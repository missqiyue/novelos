use crate::db::DbState;
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, LlmService, StreamChunk};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
/// Masks an API key for safe display in the frontend.
/// - Empty key → empty string
/// - Key length ≤ 8 → "****"
/// - Otherwise → "****" + last 4 chars
fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 8 {
        return "****".to_string();
    }
    format!("****{}", &key[key.len() - 4..])
}

/// Returns (input_price_per_1m_tokens, output_price_per_1m_tokens) for a given model.
/// Uses case-insensitive prefix matching.
fn get_model_pricing(model: &str) -> (f64, f64) {
    let lower = model.to_lowercase();
    if lower.starts_with("gpt-4o-mini") {
        (0.15, 0.60)
    } else if lower.starts_with("gpt-4o") {
        (2.5, 10.0)
    } else if lower.starts_with("gpt-4-turbo") {
        (10.0, 30.0)
    } else if lower.starts_with("claude-3.5-sonnet") || lower.starts_with("claude-3-5") {
        (3.0, 15.0)
    } else if lower.starts_with("claude-3-haiku") {
        (0.25, 1.25)
    } else if lower.starts_with("ollama/") || lower.contains("ollama") {
        (0.0, 0.0)
    } else {
        (2.5, 10.0) // default: GPT-4o rates
    }
}

pub(crate) fn create_llm_call_log(
    db: &DbState,
    project_id: &str,
    request_id: &str,
    agent_name: Option<&str>,
    provider: &str,
    model: &str,
    status: &str,
    error_message: Option<&str>,
) -> Result<String, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO llm_api_calls (id, request_id, project_id, agent_name, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![id, request_id, project_id, agent_name, provider, model, 0_i64, 0_i64, 0_i64, Option::<i64>::None, status, error_message, now],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

pub(crate) fn finalize_llm_call_log(
    db: &DbState,
    id: &str,
    model: &str,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    latency_ms: i64,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    conn.execute(
        "UPDATE llm_api_calls
         SET model = ?1,
             prompt_tokens = ?2,
             completion_tokens = ?3,
             total_tokens = ?4,
             latency_ms = ?5,
             status = ?6,
             error_message = ?7
         WHERE id = ?8",
        rusqlite::params![
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            latency_ms,
            status,
            error_message,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn log_llm_stream_event(
    db: &DbState,
    request_id: &str,
    project_id: &str,
    agent_name: Option<&str>,
    provider: &str,
    model: &str,
    kind: &str,
    delta: &str,
    reasoning_delta: &str,
    done: bool,
) -> Result<String, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO llm_stream_events (id, request_id, project_id, agent_name, provider, model, kind, delta, reasoning_delta, done, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![id, request_id, project_id, agent_name, provider, model, kind, delta, reasoning_delta, if done { 1_i64 } else { 0_i64 }, now],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

pub(crate) fn log_llm_response_events(
    db: &DbState,
    request_id: &str,
    project_id: &str,
    agent_name: Option<&str>,
    provider: &str,
    model: &str,
    response: &ChatResponse,
) -> Result<(), String> {
    if !response.reasoning_content.is_empty() {
        let _ = log_llm_stream_event(
            db,
            request_id,
            project_id,
            agent_name,
            provider,
            model,
            "thinking",
            "",
            &response.reasoning_content,
            false,
        )?;
    }

    if !response.content.is_empty() {
        let _ = log_llm_stream_event(
            db,
            request_id,
            project_id,
            agent_name,
            provider,
            model,
            "content",
            &response.content,
            "",
            false,
        )?;
    }

    let _ = log_llm_stream_event(
        db, request_id, project_id, agent_name, provider, model, "done", "", "", true,
    )?;

    Ok(())
}

pub struct StreamCancelTokens(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

pub struct LlmState {
    pub service: Arc<Mutex<LlmService>>,
}

impl Clone for LlmState {
    fn clone(&self) -> Self {
        Self {
            service: Arc::clone(&self.service),
        }
    }
}

impl LlmState {
    pub fn new() -> Self {
        Self::from_config(LlmConfig::default())
    }

    pub fn from_config(config: LlmConfig) -> Self {
        Self {
            service: Arc::new(Mutex::new(LlmService::new(config))),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateLlmConfigInput {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub embedding_provider: Option<String>,
    pub embedding_model: Option<String>,
}

#[tauri::command]
pub fn get_llm_config(state: State<'_, LlmState>) -> Result<LlmConfig, String> {
    let service = state.service.lock().map_err(|e| e.to_string())?;
    let mut config = service.config.clone();
    config.api_key = mask_api_key(&config.api_key);
    Ok(config)
}

#[tauri::command]
pub fn update_llm_config(
    state: State<'_, LlmState>,
    input: UpdateLlmConfigInput,
) -> Result<LlmConfig, String> {
    let mut service = state.service.lock().map_err(|e| e.to_string())?;
    let mut config = service.config.clone();

    if let Some(v) = input.provider {
        config.provider = v;
    }
    if let Some(v) = input.base_url {
        config.base_url = v;
    }
    if let Some(v) = input.api_key {
        config.api_key = v;
    }
    if let Some(v) = input.model {
        config.model = v;
    }
    if let Some(v) = input.max_tokens {
        config.max_tokens = v;
    }
    if let Some(v) = input.temperature {
        config.temperature = v;
    }
    if let Some(v) = input.embedding_provider {
        config.embedding_provider = v;
    }
    if let Some(v) = input.embedding_model {
        config.embedding_model = v;
    }

    service.update_config(config.clone());
    let mut response = config;
    response.api_key = mask_api_key(&response.api_key);
    Ok(response)
}

#[tauri::command]
pub async fn chat_completion(
    db: State<'_, DbState>,
    state: State<'_, LlmState>,
    messages: Vec<ChatMessage>,
) -> Result<ChatResponse, String> {
    let (config, client) = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        (service.config.clone(), service.client.clone())
    };

    let mut svc = LlmService::new(config);
    svc.client = client;
    let project_id = db.current_project_id().unwrap_or_default();
    let request_id = uuid::Uuid::new_v4().to_string();
    let llm_call_id = create_llm_call_log(
        &db,
        &project_id,
        &request_id,
        None,
        &svc.config.provider,
        &svc.config.model,
        "running",
        None,
    )?;

    match svc.chat(messages).await {
        Ok(response) => {
            let _ = log_llm_response_events(
                &db,
                &request_id,
                &project_id,
                None,
                &svc.config.provider,
                &response.model,
                &response,
            );
            let _ = finalize_llm_call_log(
                &db,
                &llm_call_id,
                &response.model,
                response.prompt_tokens as i64,
                response.completion_tokens as i64,
                response.total_tokens as i64,
                0,
                "success",
                None,
            );
            Ok(response)
        }
        Err(err) => {
            let _ = finalize_llm_call_log(
                &db,
                &llm_call_id,
                &svc.config.model,
                0,
                0,
                0,
                0,
                "failed",
                Some(&err.to_string()),
            );
            Err(err.to_string())
        }
    }
}

#[tauri::command]
pub async fn chat_with_system_prompt(
    db: State<'_, DbState>,
    state: State<'_, LlmState>,
    system_prompt: String,
    user_prompt: String,
) -> Result<ChatResponse, String> {
    let (config, client) = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        (service.config.clone(), service.client.clone())
    };

    let mut svc = LlmService::new(config);
    svc.client = client;
    let project_id = db.current_project_id().unwrap_or_default();
    let request_id = uuid::Uuid::new_v4().to_string();
    let llm_call_id = create_llm_call_log(
        &db,
        &project_id,
        &request_id,
        None,
        &svc.config.provider,
        &svc.config.model,
        "running",
        None,
    )?;

    match svc.chat_with_system(&system_prompt, &user_prompt).await {
        Ok(response) => {
            let _ = log_llm_response_events(
                &db,
                &request_id,
                &project_id,
                None,
                &svc.config.provider,
                &response.model,
                &response,
            );
            let _ = finalize_llm_call_log(
                &db,
                &llm_call_id,
                &response.model,
                response.prompt_tokens as i64,
                response.completion_tokens as i64,
                response.total_tokens as i64,
                0,
                "success",
                None,
            );
            Ok(response)
        }
        Err(err) => {
            let _ = finalize_llm_call_log(
                &db,
                &llm_call_id,
                &svc.config.model,
                0,
                0,
                0,
                0,
                "failed",
                Some(&err.to_string()),
            );
            Err(err.to_string())
        }
    }
}

#[tauri::command]
pub fn save_llm_config_to_db(db: State<'_, DbState>, config: LlmConfig) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    save_llm_config_to_connection(&conn, &config)
}

#[tauri::command]
pub fn load_llm_config_from_db(db: State<'_, DbState>) -> Result<Option<LlmConfig>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    load_llm_config_from_connection(&conn)
}

fn save_llm_config_to_connection(
    conn: &rusqlite::Connection,
    config: &LlmConfig,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO global_settings (key, value, updated_at) VALUES ('llm_config', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
        rusqlite::params![config_json, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn load_llm_config_from_connection(
    conn: &rusqlite::Connection,
) -> Result<Option<LlmConfig>, String> {
    let result = conn.query_row(
        "SELECT value FROM global_settings WHERE key = 'llm_config'",
        [],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(json) => {
            let config: LlmConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn load_persisted_llm_config(db: &DbState) -> Result<Option<LlmConfig>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    load_llm_config_from_connection(&conn)
}

#[tauri::command]
pub fn save_runtime_llm_config_to_db(
    db: State<'_, DbState>,
    state: State<'_, LlmState>,
) -> Result<(), String> {
    let config = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    save_llm_config_to_connection(&conn, &config)
}

// ─── Token Usage Tracking (LLM-008) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsageSummary {
    pub total_calls: i64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub total_tokens: i64,
    pub total_cost_estimate_usd: f64,
    pub by_agent: Vec<AgentTokenUsage>,
    pub by_model: Vec<ModelTokenUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentTokenUsage {
    pub agent_name: String,
    pub calls: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelTokenUsage {
    pub model: String,
    pub calls: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmApiCallEntry {
    pub id: String,
    pub request_id: Option<String>,
    pub agent_name: Option<String>,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub latency_ms: Option<i64>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmStreamEventEntry {
    pub id: String,
    pub request_id: String,
    pub project_id: Option<String>,
    pub agent_name: Option<String>,
    pub provider: String,
    pub model: String,
    pub kind: String,
    pub delta: String,
    pub reasoning_delta: String,
    pub done: i64,
    pub created_at: String,
}

#[tauri::command]
pub fn get_token_usage(db: State<'_, DbState>) -> Result<TokenUsageSummary, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let total_calls: i64 = conn
        .query_row("SELECT COUNT(*) FROM llm_api_calls", [], |r| r.get(0))
        .unwrap_or(0);
    let total_prompt: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(prompt_tokens), 0) FROM llm_api_calls",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let total_completion: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(completion_tokens), 0) FROM llm_api_calls",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // By agent
    let mut stmt = conn.prepare(
        "SELECT COALESCE(agent_name, 'direct'), COUNT(*), COALESCE(SUM(total_tokens), 0) FROM llm_api_calls GROUP BY agent_name ORDER BY SUM(total_tokens) DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let by_agent: Vec<AgentTokenUsage> = stmt
        .query_map([], |row| {
            Ok(AgentTokenUsage {
                agent_name: row.get(0)?,
                calls: row.get(1)?,
                total_tokens: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // By model
    let mut stmt = conn.prepare(
        "SELECT model, COUNT(*), COALESCE(SUM(total_tokens), 0) FROM llm_api_calls GROUP BY model ORDER BY SUM(total_tokens) DESC"
    ).map_err(|e| e.to_string())?;
    let by_model: Vec<ModelTokenUsage> = stmt
        .query_map([], |row| {
            Ok(ModelTokenUsage {
                model: row.get(0)?,
                calls: row.get(1)?,
                total_tokens: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Per-model cost calculation using actual pricing table
    let mut cost = 0.0;
    for m in &by_model {
        let (input_price, output_price) = get_model_pricing(&m.model);
        let model_prompt: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(prompt_tokens), 0) FROM llm_api_calls WHERE model = ?1",
                rusqlite::params![m.model],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let model_completion: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(completion_tokens), 0) FROM llm_api_calls WHERE model = ?1",
                rusqlite::params![m.model],
                |r| r.get(0),
            )
            .unwrap_or(0);
        cost += (model_prompt as f64 * input_price + model_completion as f64 * output_price)
            / 1_000_000.0;
    }

    Ok(TokenUsageSummary {
        total_calls,
        total_prompt_tokens: total_prompt,
        total_completion_tokens: total_completion,
        total_tokens: total_prompt + total_completion,
        total_cost_estimate_usd: (cost * 100.0).round() / 100.0,
        by_agent,
        by_model,
    })
}

#[tauri::command]
pub fn list_llm_api_calls(
    db: State<'_, DbState>,
    agent_name: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LlmApiCallEntry>, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let limit_val = limit.unwrap_or(100);
    let mut stmt = conn.prepare(
        "SELECT id, request_id, agent_name, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message, created_at
         FROM llm_api_calls
         WHERE (?1 IS NULL OR agent_name = ?1)
         ORDER BY created_at DESC
         LIMIT ?2"
    ).map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![agent_name, limit_val], |row| {
            Ok(LlmApiCallEntry {
                id: row.get(0)?,
                request_id: row.get(1)?,
                agent_name: row.get(2)?,
                provider: row.get(3)?,
                model: row.get(4)?,
                prompt_tokens: row.get(5)?,
                completion_tokens: row.get(6)?,
                total_tokens: row.get(7)?,
                latency_ms: row.get(8)?,
                status: row.get(9)?,
                error_message: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn list_llm_stream_events(
    db: State<'_, DbState>,
    request_id: String,
    limit: Option<i64>,
) -> Result<Vec<LlmStreamEventEntry>, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let limit_val = limit.unwrap_or(200);
    let mut stmt = conn.prepare(
        "SELECT id, request_id, project_id, agent_name, provider, model, kind, delta, reasoning_delta, done, created_at
         FROM llm_stream_events
         WHERE request_id = ?
         ORDER BY created_at ASC
         LIMIT ?"
    ).map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![request_id, limit_val], |row| {
            Ok(LlmStreamEventEntry {
                id: row.get(0)?,
                request_id: row.get(1)?,
                project_id: row.get(2)?,
                agent_name: row.get(3)?,
                provider: row.get(4)?,
                model: row.get(5)?,
                kind: row.get(6)?,
                delta: row.get(7)?,
                reasoning_delta: row.get(8)?,
                done: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

// ─── Streaming LLM (LLM-009) ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    pub request_id: String,
    pub chunk: StreamChunk,
}

#[tauri::command]
pub async fn chat_completion_stream(
    app: AppHandle,
    db: State<'_, DbState>,
    state: State<'_, LlmState>,
    cancel_tokens: State<'_, StreamCancelTokens>,
    messages: Vec<ChatMessage>,
    request_id: String,
) -> Result<(), String> {
    // Register cancellation token
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
        tokens.insert(request_id.clone(), cancel_flag.clone());
    }

    let (config, client) = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        (service.config.clone(), service.client.clone())
    };
    let project_id = db.current_project_id().unwrap_or_default();
    let llm_call_id = create_llm_call_log(
        &db,
        &project_id,
        &request_id,
        None,
        &config.provider,
        &config.model,
        "running",
        None,
    )?;

    let mut svc = LlmService::new(config);
    svc.client = client;
    let mut stream = svc.chat_stream(messages);
    let final_model = svc.config.model.clone();

    while let Some(item) = stream.next().await {
        // Check cancellation
        if cancel_flag.load(Ordering::SeqCst) {
            break;
        }
        let chunk = item.map_err(|e| e.to_string())?;
        if !chunk.delta.is_empty() || !chunk.reasoning_delta.is_empty() || chunk.done {
            let kind = if !chunk.reasoning_delta.is_empty() {
                "thinking"
            } else if chunk.done {
                "done"
            } else {
                "content"
            };
            let _ = log_llm_stream_event(
                &db,
                &request_id,
                &project_id,
                None,
                &svc.config.provider,
                &chunk.model,
                kind,
                &chunk.delta,
                &chunk.reasoning_delta,
                chunk.done,
            );
        }
        let msg = StreamMessage {
            request_id: request_id.clone(),
            chunk,
        };
        let _ = app.emit("llm-stream-chunk", &msg);
    }

    // Clean up token
    {
        let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
        tokens.remove(&request_id);
    }

    let _ = finalize_llm_call_log(&db, &llm_call_id, &final_model, 0, 0, 0, 0, "success", None);

    Ok(())
}

#[tauri::command]
pub fn cancel_stream(
    tokens: State<'_, StreamCancelTokens>,
    request_id: String,
) -> Result<bool, String> {
    let tokens = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some(token) = tokens.get(&request_id) {
        token.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}
