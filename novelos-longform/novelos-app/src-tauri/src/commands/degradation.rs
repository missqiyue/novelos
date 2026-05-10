use crate::commands::agent::{run_agent, AgentRunResult};
use crate::commands::llm::LlmState;
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

// ─── WF-002: Genre Match Low-Confidence Degradation ───
// ─── WF-003: Agent Timeout Skip + Manual Completion ───

const GENRE_CONFIDENCE_THRESHOLD: f32 = 0.6;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenreMatchResult {
    pub candidates: Vec<GenreCandidate>,
    pub confidence: f32,
    pub needs_user_selection: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenreCandidate {
    pub genre_id: String,
    pub genre_name: String,
    pub match_score: f32,
    pub reasoning: String,
}

/// WF-002: Run genre match with low-confidence degradation.
/// If the top candidate's confidence is below threshold, returns all candidates
/// for user selection instead of auto-selecting.
#[tauri::command]
pub async fn run_genre_match_with_fallback(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    project_title: String,
    project_description: String,
) -> Result<GenreMatchResult, String> {
    let mut vars = HashMap::new();
    vars.insert("project_title".to_string(), project_title);
    vars.insert("project_description".to_string(), project_description);

    let result = run_agent(llm_state, db, "genre_match".to_string(), vars).await?;

    // Parse the agent output to extract candidates
    let candidates = parse_genre_candidates(&result.content);

    let top_confidence = candidates
        .first()
        .map(|c| c.match_score / 10.0)
        .unwrap_or(0.0);
    let needs_user_selection = top_confidence < GENRE_CONFIDENCE_THRESHOLD;

    Ok(GenreMatchResult {
        candidates,
        confidence: top_confidence,
        needs_user_selection,
    })
}

/// WF-003: Run an agent with timeout and graceful degradation.
/// On timeout, returns a SkippedAgentResult instead of a hard error,
/// allowing the pipeline to continue with the step marked as "skipped".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStepResult {
    pub agent_name: String,
    pub status: String, // "completed", "skipped", "failed"
    pub output: Option<String>,
    pub confidence: f32,
    pub timeout_secs: u64,
    pub duration_ms: u64,
    pub skip_reason: Option<String>,
}

/// WF-003: Run an agent step with timeout-skip behavior.
/// If the agent times out, the step is marked "skipped" (not "failed"),
/// and the pipeline can continue. The user can manually retry later.
#[tauri::command]
pub async fn run_agent_step_with_skip(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    agent_name: String,
    variables: HashMap<String, String>,
    timeout_secs: u64,
) -> Result<AgentStepResult, String> {
    let effective_timeout = if timeout_secs == 0 {
        crate::orchestrator::get_agent_timeout(&agent_name)
    } else {
        timeout_secs
    };

    let start = std::time::Instant::now();

    let result = tokio::time::timeout(
        tokio::time::Duration::from_secs(effective_timeout),
        run_agent(llm_state, db, agent_name.clone(), variables),
    )
    .await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(agent_result)) => Ok(AgentStepResult {
            agent_name,
            status: "completed".to_string(),
            output: Some(agent_result.content),
            confidence: 1.0,
            timeout_secs: effective_timeout,
            duration_ms,
            skip_reason: None,
        }),
        Ok(Err(e)) => Ok(AgentStepResult {
            agent_name,
            status: "failed".to_string(),
            output: Some(e.clone()),
            confidence: 0.0,
            timeout_secs: effective_timeout,
            duration_ms,
            skip_reason: Some(e),
        }),
        Err(_) => Ok(AgentStepResult {
            agent_name,
            status: "skipped".to_string(),
            output: None,
            confidence: 0.0,
            timeout_secs: effective_timeout,
            duration_ms,
            skip_reason: Some(format!(
                "Agent timed out after {}s — skipped, can be retried manually",
                effective_timeout
            )),
        }),
    }
}

/// WF-003: Get a list of skipped/failed steps for a project that can be manually retried.
#[tauri::command]
pub fn list_skipped_steps(db: State<'_, DbState>) -> Result<Vec<SkippedStepInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn.prepare(
        "SELECT id, agent_name, input_summary, status, error_message, created_at FROM agent_execution_logs WHERE status IN ('skipped', 'failed') ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let items: Vec<SkippedStepInfo> = stmt
        .query_map([], |row| {
            Ok(SkippedStepInfo {
                id: row.get(0)?,
                agent_name: row.get(1)?,
                step_name: row.get::<_, String>(2)?,
                chapter_number: 0,
                status: row.get(3)?,
                error_message: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedStepInfo {
    pub id: String,
    pub agent_name: String,
    pub step_name: String,
    pub chapter_number: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

// ─── Helpers ───

fn parse_genre_candidates(content: &str) -> Vec<GenreCandidate> {
    // Try to parse JSON array from the agent output
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(arr) = value.as_array() {
            let mut candidates = Vec::new();
            for item in arr {
                let genre_id = item
                    .get("genre_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let genre_name = item
                    .get("genre_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let match_score = item
                    .get("match_score")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(5.0) as f32;
                let reasoning = item
                    .get("reasoning")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if !genre_name.is_empty() {
                    candidates.push(GenreCandidate {
                        genre_id,
                        genre_name,
                        match_score,
                        reasoning,
                    });
                }
            }
            if !candidates.is_empty() {
                candidates.sort_by(|a, b| {
                    b.match_score
                        .partial_cmp(&a.match_score)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                return candidates;
            }
        }
    }

    // Fallback: try to extract from text (look for numbered patterns)
    let mut candidates = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(|c: char| c.is_ascii_digit()) {
            let name = trimmed
                .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ' ')
                .trim()
                .to_string();
            if !name.is_empty() && name.len() > 1 {
                candidates.push(GenreCandidate {
                    genre_id: name.clone().to_lowercase().replace(' ', "_"),
                    genre_name: name,
                    match_score: 7.0,
                    reasoning: String::new(),
                });
            }
        }
    }

    if candidates.is_empty() {
        candidates.push(GenreCandidate {
            genre_id: "unknown".to_string(),
            genre_name: "未识别题材".to_string(),
            match_score: 3.0,
            reasoning: "无法自动识别题材，请手动选择".to_string(),
        });
    }

    candidates
}
