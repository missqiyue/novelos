use crate::commands::agent::run_agent;
use crate::commands::compiler::do_compile;
use crate::commands::llm::LlmState;
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

// ─── WF-030: Reader Feedback Loop Workflow ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackRevisionTask {
    pub id: String,
    pub target: String,
    pub issue: String,
    pub suggestion: String,
    pub priority: String,
    pub based_on_comments: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackWorkflowResult {
    pub workflow_id: String,
    pub step: String,
    pub comment_count: usize,
    pub revision_tasks: Vec<FeedbackRevisionTask>,
    pub overall_sentiment: Option<String>,
    pub summary: Option<String>,
}

/// WF-030 Step 1: Analyze reader comments and generate revision tasks.
#[tauri::command]
pub async fn start_reader_feedback_workflow(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<FeedbackWorkflowResult, String> {
    let project_id = db.current_project_id().unwrap_or_default();

    // Load new/unprocessed comments for this chapter
    let comment_rows: Vec<(String, String, String, Option<String>, Option<String>)> = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        let mut stmt = conn.prepare(
            "SELECT id, content, source, sentiment, cluster_id FROM reader_comments WHERE project_id = ?1 AND status = 'new' ORDER BY created_at DESC"
        ).map_err(|e| e.to_string())?;
        let rows: Vec<_> = stmt.query_map(rusqlite::params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(4)?, row.get::<_, Option<String>>(5)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        rows
    };

    if comment_rows.is_empty() {
        return Ok(FeedbackWorkflowResult {
            workflow_id: uuid::Uuid::new_v4().to_string(),
            step: "no_comments".to_string(),
            comment_count: 0,
            revision_tasks: Vec::new(),
            overall_sentiment: None,
            summary: Some("没有待处理的新评论".to_string()),
        });
    }

    // Build comments text for the agent
    let comments_text: String = comment_rows.iter()
        .enumerate()
        .map(|(i, (_id, content, source, sentiment, cluster))| {
            let sent = sentiment.as_deref().unwrap_or("unknown");
            let cl = cluster.as_deref().unwrap_or("-");
            format!("[{}] (来源:{} 情感:{} 群组:{}) {}", i + 1, source, sent, cl, content)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let comment_ids: Vec<String> = comment_rows.iter().map(|(id, ..)| id.clone()).collect();

    // Get chapter summary for context
    let chapter_summary = get_chapter_summary(&db, chapter_number)?;

    // Get character list for popularity analysis
    let characters = get_character_names(&db)?;

    // Call Comment Analyzer agent
    let mut vars = HashMap::new();
    vars.insert("chapter_number".to_string(), chapter_number.to_string());
    vars.insert("chapter_summary".to_string(), chapter_summary);
    vars.insert("comments".to_string(), comments_text);
    vars.insert("characters".to_string(), characters);

    let result = run_agent(llm_state.clone(), db.clone(), "comment_analyzer".to_string(), vars).await?;

    // Parse the analysis output
    let (revision_tasks, overall_sentiment, summary) = parse_comment_analysis(&result.content);

    // Mark comments as processed
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    for cid in &comment_ids {
        let _ = conn.execute(
            "UPDATE reader_comments SET status = 'analyzed' WHERE id = ?1",
            rusqlite::params![cid],
        );
    }

    // Store analysis in comment_analyses
    let now = chrono::Utc::now().to_rfc3339();
    for task in &revision_tasks {
        let analysis_id = uuid::Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO comment_analyses (id, project_id, cluster_id, cluster_label, sentiment_summary, revision_suggestion, affected_chapters, affected_characters, priority, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                analysis_id, project_id, "feedback_workflow",
                task.target, task.issue, task.suggestion,
                chapter_number.to_string(), task.target, task.priority, now
            ],
        );
    }

    Ok(FeedbackWorkflowResult {
        workflow_id: uuid::Uuid::new_v4().to_string(),
        step: "analysis_complete".to_string(),
        comment_count: comment_rows.len(),
        revision_tasks,
        overall_sentiment,
        summary,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevisionExecutionResult {
    pub chapter_number: i64,
    pub revision_mode: String,
    pub compile_status: String,
    pub compile_score: Option<i32>,
    pub changes: Vec<RevisionChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevisionChange {
    pub location: String,
    pub reason: String,
    pub what_changed: String,
}

/// WF-030 Step 2: Execute a revision based on feedback, then re-compile.
#[tauri::command]
pub async fn execute_feedback_revision(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    chapter_number: i64,
    revision_requirements: String,
    mode: Option<String>,
) -> Result<RevisionExecutionResult, String> {
    let revision_mode = mode.unwrap_or_else(|| "repair".to_string());
    let valid_modes = ["repair", "compress", "hook_up", "voice_fix"];
    if !valid_modes.contains(&revision_mode.as_str()) {
        return Err(format!("Invalid mode '{}'. Must be one of: repair, compress, hook_up, voice_fix", revision_mode));
    }

    // Load current chapter draft
    let draft_text = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        conn.query_row(
            "SELECT draft_text FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |row| row.get::<_, String>(0),
        ).map_err(|e| e.to_string())?
    };

    // Load canon rules and soul refs for rewrite context
    let canon_rules = get_canon_rules_text(&db)?;
    let soul_refs = get_soul_refs_text(&db)?;

    // Call Rewrite Agent
    let mut vars = HashMap::new();
    vars.insert("mode".to_string(), revision_mode.clone());
    vars.insert("requirements".to_string(), revision_requirements);
    vars.insert("chapter_text".to_string(), draft_text);
    vars.insert("canon_rules".to_string(), canon_rules);
    vars.insert("soul_refs".to_string(), soul_refs);

    let result = run_agent(llm_state.clone(), db.clone(), "rewrite_agent".to_string(), vars).await?;

    // Parse rewrite output: text before "---", changes JSON after
    let (new_text, changes) = parse_rewrite_output(&result.content);

    // Save revised draft
    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        let now = chrono::Utc::now().to_rfc3339();
        let word_count = new_text.chars().count() as i64;

        conn.execute(
            "UPDATE chapters SET draft_text = ?1, word_count = ?2, status = 'draft', updated_at = ?3 WHERE chapter_number = ?4",
            rusqlite::params![new_text, word_count, now, chapter_number],
        ).map_err(|e| e.to_string())?;

        // Save a version snapshot
        let version_id = uuid::Uuid::new_v4().to_string();
        let project_id = db.current_project_id().unwrap_or_default();
        let _ = conn.execute(
            "INSERT INTO chapter_versions (id, project_id, chapter_number, version_text, word_count, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![version_id, project_id, chapter_number, new_text, word_count, now],
        );
    }

    // Re-compile the revised chapter
    let compile_result = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        do_compile(conn, &new_text, chapter_number)
    };

    let (compile_status, compile_score) = match compile_result {
        Ok(r) => (r.status.clone(), Some(r.score)),
        Err(_) => ("error".to_string(), None),
    };

    Ok(RevisionExecutionResult {
        chapter_number,
        revision_mode,
        compile_status,
        compile_score,
        changes,
    })
}

// ─── Helpers ───

fn get_chapter_summary(db: &DbState, chapter_number: i64) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let draft: String = conn.query_row(
        "SELECT COALESCE(draft_text, '') FROM chapters WHERE chapter_number = ?1",
        [chapter_number],
        |row| row.get(0),
    ).unwrap_or_default();
    Ok(draft.chars().take(500).collect())
}

fn get_character_names(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT name FROM characters WHERE status = 'active'").map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(names.join("、"))
}

fn get_canon_rules_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT rule_name, content, is_hard FROM canon_rules WHERE status = 'active'").map_err(|e| e.to_string())?;
    let rules: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let content: String = row.get(1)?;
        let hard: bool = row.get::<_, i64>(2)? != 0;
        Ok(format!("[{}] {}: {}", if hard { "硬" } else { "软" }, name, content))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(rules.join("\n"))
}

fn get_soul_refs_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT name, soul_json FROM characters WHERE status = 'active' AND soul_json != '{}' AND soul_json != ''").map_err(|e| e.to_string())?;
    let refs: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let soul: String = row.get(1)?;
        Ok(format!("{}: {}", name, soul.chars().take(300).collect::<String>()))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(refs.join("\n"))
}

fn parse_comment_analysis(content: &str) -> (Vec<FeedbackRevisionTask>, Option<String>, Option<String>) {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
        let overall_sentiment = value.get("overall_sentiment")
            .and_then(|v| v.get("dominant_sentiment"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let summary = value.get("summary")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let tasks: Vec<FeedbackRevisionTask> = value.get("suggested_revisions")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().filter_map(|item| {
                    let target = item.get("target").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let issue = item.get("issue").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let suggestion = item.get("suggestion").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let priority = item.get("priority").and_then(|v| v.as_str()).unwrap_or("medium").to_string();
                    let based_on = item.get("based_on_comments").and_then(|v| v.as_i64()).unwrap_or(0);
                    if !target.is_empty() {
                        Some(FeedbackRevisionTask {
                            id: uuid::Uuid::new_v4().to_string(),
                            target, issue, suggestion, priority, based_on_comments: based_on,
                        })
                    } else {
                        None
                    }
                }).collect()
            })
            .unwrap_or_default();

        return (tasks, overall_sentiment, summary);
    }

    // Fallback: no structured output
    (Vec::new(), None, Some(content.chars().take(500).collect()))
}

fn parse_rewrite_output(content: &str) -> (String, Vec<RevisionChange>) {
    if let Some(sep_idx) = content.find("\n---\n").or_else(|| content.find("\n---")) {
        let text_part = content[..sep_idx].trim().to_string();
        let json_part = &content[sep_idx..];

        let changes: Vec<RevisionChange> = serde_json::from_str::<serde_json::Value>(json_part.trim_start_matches('-').trim())
            .ok()
            .and_then(|v| v.get("changes").and_then(|c| c.as_array()).cloned())
            .map(|arr| {
                arr.iter().filter_map(|item| {
                    Some(RevisionChange {
                        location: item.get("location").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        reason: item.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        what_changed: item.get("what_changed").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    })
                }).collect()
            })
            .unwrap_or_default();

        return (text_part, changes);
    }

    (content.to_string(), Vec::new())
}
