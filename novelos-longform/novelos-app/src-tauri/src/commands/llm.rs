use crate::db::DbState;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, LlmService, StreamChunk};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use futures::StreamExt;
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
        Self {
            service: Arc::new(Mutex::new(LlmService::new(LlmConfig::default()))),
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
pub fn update_llm_config(state: State<'_, LlmState>, input: UpdateLlmConfigInput) -> Result<LlmConfig, String> {
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
    Ok(config)
}

#[tauri::command]
pub async fn chat_completion(state: State<'_, LlmState>, messages: Vec<ChatMessage>) -> Result<ChatResponse, String> {
    let (config, client) = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        (service.config.clone(), service.client.clone())
    };

    let mut svc = LlmService::new(config);
    svc.client = client;
    svc.chat(messages).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat_with_system_prompt(state: State<'_, LlmState>, system_prompt: String, user_prompt: String) -> Result<ChatResponse, String> {
    let (config, client) = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        (service.config.clone(), service.client.clone())
    };

    let mut svc = LlmService::new(config);
    svc.client = client;
    svc.chat_with_system(&system_prompt, &user_prompt)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_llm_config_to_db(db: State<'_, DbState>, config: LlmConfig) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO global_settings (key, value, updated_at) VALUES ('llm_config', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2",
        rusqlite::params![config_json, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_llm_config_from_db(db: State<'_, DbState>) -> Result<Option<LlmConfig>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;

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

#[tauri::command]
pub fn get_token_usage(db: State<'_, DbState>) -> Result<TokenUsageSummary, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let total_calls: i64 = conn.query_row("SELECT COUNT(*) FROM llm_api_calls", [], |r| r.get(0)).unwrap_or(0);
    let total_prompt: i64 = conn.query_row("SELECT COALESCE(SUM(prompt_tokens), 0) FROM llm_api_calls", [], |r| r.get(0)).unwrap_or(0);
    let total_completion: i64 = conn.query_row("SELECT COALESCE(SUM(completion_tokens), 0) FROM llm_api_calls", [], |r| r.get(0)).unwrap_or(0);

    // By agent
    let mut stmt = conn.prepare(
        "SELECT COALESCE(agent_name, 'direct'), COUNT(*), COALESCE(SUM(total_tokens), 0) FROM llm_api_calls GROUP BY agent_name ORDER BY SUM(total_tokens) DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let by_agent: Vec<AgentTokenUsage> = stmt.query_map([], |row| {
        Ok(AgentTokenUsage { agent_name: row.get(0)?, calls: row.get(1)?, total_tokens: row.get(2)? })
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // By model
    let mut stmt = conn.prepare(
        "SELECT model, COUNT(*), COALESCE(SUM(total_tokens), 0) FROM llm_api_calls GROUP BY model ORDER BY SUM(total_tokens) DESC"
    ).map_err(|e| e.to_string())?;
    let by_model: Vec<ModelTokenUsage> = stmt.query_map([], |row| {
        Ok(ModelTokenUsage { model: row.get(0)?, calls: row.get(1)?, total_tokens: row.get(2)? })
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

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
        cost += (model_prompt as f64 * input_price + model_completion as f64 * output_price) / 1_000_000.0;
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

// ─── Streaming LLM (LLM-009) ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    pub request_id: String,
    pub chunk: StreamChunk,
}

#[tauri::command]
pub async fn chat_completion_stream(
    app: AppHandle,
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

    let mut svc = LlmService::new(config);
    svc.client = client;
    let mut stream = svc.chat_stream(messages);

    while let Some(item) = stream.next().await {
        // Check cancellation
        if cancel_flag.load(Ordering::SeqCst) {
            break;
        }
        let chunk = item.map_err(|e| e.to_string())?;
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

    Ok(())
}

#[tauri::command]
pub fn cancel_stream(tokens: State<'_, StreamCancelTokens>, request_id: String) -> Result<bool, String> {
    let tokens = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some(token) = tokens.get(&request_id) {
        token.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}
