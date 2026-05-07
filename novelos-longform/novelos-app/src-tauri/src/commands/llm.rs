use crate::db::DbState;
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, LlmService, StreamChunk};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use futures::StreamExt;

pub struct LlmState {
    pub service: Mutex<LlmService>,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            service: Mutex::new(LlmService::new(LlmConfig::default())),
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
}

#[tauri::command]
pub fn get_llm_config(state: State<'_, LlmState>) -> Result<LlmConfig, String> {
    let service = state.service.lock().map_err(|e| e.to_string())?;
    Ok(service.config.clone())
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

    service.update_config(config.clone());
    Ok(config)
}

#[tauri::command]
pub async fn chat_completion(state: State<'_, LlmState>, messages: Vec<ChatMessage>) -> Result<ChatResponse, String> {
    let config = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };

    let svc = LlmService::new(config);
    svc.chat(messages).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat_with_system_prompt(state: State<'_, LlmState>, system_prompt: String, user_prompt: String) -> Result<ChatResponse, String> {
    let config = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };

    let svc = LlmService::new(config);
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

    // Cost estimate: GPT-4o ~$2.5/1M input, $10/1M output; Claude ~$3/$15; Ollama free
    let cost = (total_prompt as f64 * 2.5 + total_completion as f64 * 10.0) / 1_000_000.0;

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
    messages: Vec<ChatMessage>,
    request_id: String,
) -> Result<(), String> {
    let config = {
        let service = state.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };

    let svc = LlmService::new(config);
    let mut stream = svc.chat_stream(messages);

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        let msg = StreamMessage {
            request_id: request_id.clone(),
            chunk,
        };
        let _ = app.emit("llm-stream-chunk", &msg);
    }

    Ok(())
}
