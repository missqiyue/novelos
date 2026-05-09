use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterTaskInfo {
    pub id: String,
    pub chapter_number: i64,
    pub volume_id: Option<String>,
    pub arc_id: Option<String>,
    pub objective: String,
    pub must_progress: Option<String>,
    pub must_recall: Option<String>,
    pub must_avoid: Option<String>,
    pub required_hooks: Option<String>,
    pub required_context: Option<String>,
    pub ending_hook: Option<String>,
    pub status: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterInfo {
    pub id: String,
    pub chapter_number: i64,
    pub title: Option<String>,
    pub status: String,
    pub draft_text: Option<String>,
    pub final_text: Option<String>,
    pub word_count: Option<i64>,
    pub task_id: Option<String>,
    pub compiler_status: Option<String>,
    pub review_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterVersionInfo {
    pub id: String,
    pub chapter_id: String,
    pub version_no: i64,
    pub content_type: String,
    pub content: String,
    pub diff_summary: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

// --- Chapter Tasks ---

#[tauri::command]
pub fn list_chapter_tasks(db: State<'_, DbState>, volume_id: Option<String>) -> Result<Vec<ChapterTaskInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn.prepare(
        "SELECT id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook, status, created_at FROM chapter_tasks WHERE (?1 IS NULL OR volume_id = ?1) ORDER BY chapter_number"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map(rusqlite::params![volume_id], |row| {
        Ok(ChapterTaskInfo {
            id: row.get(0)?, chapter_number: row.get(1)?, volume_id: row.get(2)?, arc_id: row.get(3)?,
            objective: row.get(4)?, must_progress: row.get(5)?, must_recall: row.get(6)?, must_avoid: row.get(7)?,
            required_hooks: row.get(8)?, required_context: row.get(9)?, ending_hook: row.get(10)?,
            status: row.get(11)?, created_at: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn create_chapter_task(db: State<'_, DbState>, chapter_number: i64, objective: String, volume_id: Option<String>, arc_id: Option<String>, must_progress: Option<String>, must_recall: Option<String>, must_avoid: Option<String>) -> Result<ChapterTaskInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();

    conn.execute(
        "INSERT INTO chapter_tasks (id, project_id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10)",
        rusqlite::params![id, project_id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(ChapterTaskInfo {
        id,
        chapter_number,
        volume_id,
        arc_id,
        objective,
        must_progress,
        must_recall,
        must_avoid,
        required_hooks: None,
        required_context: None,
        ending_hook: None,
        status: Some("pending".to_string()),
        created_at: now,
    })
}

// --- Chapters ---

#[tauri::command]
pub fn list_chapters(db: State<'_, DbState>) -> Result<Vec<ChapterInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(ChapterInfo {
                id: row.get(0)?, chapter_number: row.get(1)?, title: row.get(2)?, status: row.get(3)?,
                draft_text: row.get(4)?, final_text: row.get(5)?, word_count: row.get(6)?, task_id: row.get(7)?,
                compiler_status: row.get(8)?, review_status: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn get_chapter(db: State<'_, DbState>, chapter_number: i64) -> Result<ChapterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    conn.query_row(
        "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?1",
        [chapter_number],
        |row| Ok(ChapterInfo {
            id: row.get(0)?, chapter_number: row.get(1)?, title: row.get(2)?, status: row.get(3)?,
            draft_text: row.get(4)?, final_text: row.get(5)?, word_count: row.get(6)?, task_id: row.get(7)?,
            compiler_status: row.get(8)?, review_status: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
        }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_chapter(db: State<'_, DbState>, chapter_number: i64, title: Option<String>, task_id: Option<String>) -> Result<ChapterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();

    conn.execute(
        "INSERT INTO chapters (id, project_id, chapter_number, title, status, task_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'task_ready', ?5, ?6, ?7)",
        rusqlite::params![id, project_id, chapter_number, title, task_id, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(ChapterInfo {
        id,
        chapter_number,
        title,
        status: "task_ready".to_string(),
        draft_text: None,
        final_text: None,
        word_count: None,
        task_id,
        compiler_status: None,
        review_status: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_chapter_draft(
    db: State<'_, DbState>,
    chapter_number: i64,
    draft_text: String,
    skip_version: Option<bool>,
) -> Result<ChapterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    let word_count = draft_text.chars().count() as i64;

    conn.execute(
        "UPDATE chapters SET draft_text = ?1, word_count = ?2, status = 'drafting', updated_at = ?3 WHERE chapter_number = ?4",
        rusqlite::params![draft_text, word_count, now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    // Only create a version record for manual saves (not auto-save)
    if !skip_version.unwrap_or(false) {
        let chapter_id: String = conn
            .query_row("SELECT id FROM chapters WHERE chapter_number = ?1", [chapter_number], |r| r.get(0))
            .map_err(|e| e.to_string())?;

        let next_version: i64 = conn
            .query_row("SELECT COALESCE(MAX(version_no), 0) + 1 FROM chapter_versions WHERE chapter_id = ?1", [&chapter_id], |r| r.get(0))
            .unwrap_or(1);

        let version_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?1, ?2, ?3, 'draft', ?4, 'user', ?5)",
            rusqlite::params![version_id, chapter_id, next_version, draft_text, now],
        )
        .map_err(|e| e.to_string())?;
    }

    get_chapter_inner(conn, chapter_number)
}

#[tauri::command]
pub fn finalize_chapter(db: State<'_, DbState>, chapter_number: i64) -> Result<ChapterInfo, String> {
    let project_id;
    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        project_id = db.current_project_id().unwrap_or_default();
        crate::db::transactions::finalize_chapter_transaction(conn, &project_id, chapter_number)?;
    }

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    get_chapter_inner(conn, chapter_number)
}

fn get_chapter_inner(conn: &rusqlite::Connection, chapter_number: i64) -> Result<ChapterInfo, String> {
    conn.query_row(
        "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?1",
        [chapter_number],
        |row| Ok(ChapterInfo {
            id: row.get(0)?, chapter_number: row.get(1)?, title: row.get(2)?, status: row.get(3)?,
            draft_text: row.get(4)?, final_text: row.get(5)?, word_count: row.get(6)?, task_id: row.get(7)?,
            compiler_status: row.get(8)?, review_status: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)?,
        }),
    )
    .map_err(|e| e.to_string())
}

// --- Auto-recall hard rules (CAN-006) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct RecalledContext {
    pub hard_rules: Vec<String>,
    pub soft_rules: Vec<String>,
    pub character_states: Vec<String>,
    pub open_foreshadows: Vec<String>,
    pub recent_summaries: Vec<String>,
    pub total_tokens_estimate: usize,
}

#[tauri::command]
pub fn recall_context_for_chapter(db: State<'_, DbState>, _chapter_number: i64) -> Result<RecalledContext, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    // Recall active hard rules
    let mut stmt = conn.prepare(
        "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 1 ORDER BY rule_name"
    ).map_err(|e| e.to_string())?;
    let hard_rules: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let content: String = row.get(1)?;
        Ok(format!("[硬规则] {}: {}", name, content))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Recall soft rules (style/guidance)
    let mut stmt = conn.prepare(
        "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 0 ORDER BY rule_name LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let soft_rules: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let content: String = row.get(1)?;
        Ok(format!("[软规则] {}: {}", name, content))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Recall active character states
    let mut stmt = conn.prepare(
        "SELECT c.name, cs.level_state, cs.emotion_state, cs.goal_state FROM characters c LEFT JOIN character_states cs ON cs.character_id = c.id WHERE c.status = 'active' LIMIT 15"
    ).map_err(|e| e.to_string())?;
    let character_states: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let level: Option<String> = row.get(1)?;
        let emotion: Option<String> = row.get(2)?;
        let goal: Option<String> = row.get(3)?;
        Ok(format!("{}: 等级={} 情绪={} 目标={}", name,
            level.as_deref().unwrap_or("?"), emotion.as_deref().unwrap_or("?"), goal.as_deref().unwrap_or("?")))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Recall open foreshadows
    let mut stmt = conn.prepare(
        "SELECT title, seed_chapter FROM foreshadow_items WHERE status = 'planted' ORDER BY seed_chapter LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let open_foreshadows: Vec<String> = stmt.query_map([], |row| {
        let title: String = row.get(0)?;
        let seed: i64 = row.get(1)?;
        Ok(format!("伏笔「{}」(埋于第{}章)", title, seed))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Estimate tokens (1 token ≈ 2 Chinese chars ≈ 4 English chars)
    let total_chars: usize = hard_rules.iter().map(|s| s.len()).sum::<usize>()
        + soft_rules.iter().map(|s| s.len()).sum::<usize>()
        + character_states.iter().map(|s| s.len()).sum::<usize>()
        + open_foreshadows.iter().map(|s| s.len()).sum::<usize>();
    let total_tokens_estimate = total_chars / 2;

    Ok(RecalledContext {
        hard_rules,
        soft_rules,
        character_states,
        open_foreshadows,
        recent_summaries: vec![],
        total_tokens_estimate,
    })
}

// --- Chapter FTS Search (CHP-007) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterSearchResult {
    pub chapter_number: i64,
    pub title: Option<String>,
    pub snippet: String,
    pub highlighted_snippet: Option<String>,
    pub status: String,
    pub word_count: Option<i64>,
}

#[tauri::command]
pub fn search_chapters(db: State<'_, DbState>, query: String) -> Result<Vec<ChapterSearchResult>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let search = format!("%{}%", query.trim());
    let mut stmt = conn.prepare(
        "SELECT chapter_number, title, COALESCE(final_text, draft_text, ''), status, word_count FROM chapters WHERE final_text LIKE ?1 OR draft_text LIKE ?1 OR title LIKE ?1 ORDER BY chapter_number LIMIT 30"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map([&search], |row| {
        let full_text: String = row.get(2)?;
        let ch_num: i64 = row.get(0)?;
        let query_lower = query.to_lowercase();
        let text_lower = full_text.to_lowercase();
        let pos = text_lower.find(&query_lower).unwrap_or(0);
        let start = if pos > 30 { pos - 30 } else { 0 };
        let end = (pos + query.len() + 80).min(full_text.len());
        let snippet = if start > 0 { "..." } else { "" }.to_string()
            + &full_text[start..end]
            + if end < full_text.len() { "..." } else { "" };

        Ok(ChapterSearchResult {
            chapter_number: ch_num,
            title: row.get(1)?,
            snippet,
            highlighted_snippet: None,
            status: row.get(3)?,
            word_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

/// Search chapters with term highlighting in snippets.
/// Same as search_chapters but wraps matching terms in <<HIGHLIGHT>>...<</HIGHLIGHT>> markers.
#[tauri::command]
pub fn search_chapters_with_highlights(db: State<'_, DbState>, query: String) -> Result<Vec<ChapterSearchResult>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let search = format!("%{}%", query.trim());
    let mut stmt = conn.prepare(
        "SELECT chapter_number, title, COALESCE(final_text, draft_text, ''), status, word_count FROM chapters WHERE final_text LIKE ?1 OR draft_text LIKE ?1 OR title LIKE ?1 ORDER BY chapter_number LIMIT 30"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map([&search], |row| {
        let full_text: String = row.get(2)?;
        let ch_num: i64 = row.get(0)?;
        let query_lower = query.to_lowercase();
        let text_lower = full_text.to_lowercase();

        // Build plain snippet
        let pos = text_lower.find(&query_lower).unwrap_or(0);
        let start = if pos > 30 { pos - 30 } else { 0 };
        let end = (pos + query.len() + 80).min(full_text.len());
        let snippet = if start > 0 { "..." } else { "" }.to_string()
            + &full_text[start..end]
            + if end < full_text.len() { "..." } else { "" };

        // Build highlighted version of the full text
        let highlighted = highlight_terms(&full_text, &query);

        Ok(ChapterSearchResult {
            chapter_number: ch_num,
            title: row.get(1)?,
            snippet,
            highlighted_snippet: Some(highlighted),
            status: row.get(3)?,
            word_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

/// Wraps all case-insensitive occurrences of `query` in `text` with
/// <<HIGHLIGHT>>...<</HIGHLIGHT>> markers.
fn highlight_terms(text: &str, query: &str) -> String {
    if query.is_empty() {
        return text.to_string();
    }

    let lower_text = text.to_lowercase();
    let lower_query = query.to_lowercase();
    let query_len = query.len();

    let mut result = String::with_capacity(text.len() + 64);
    let mut cursor = 0usize;

    while let Some(pos) = lower_text[cursor..].find(&lower_query) {
        let abs_pos = cursor + pos;
        // Push text before the match
        result.push_str(&text[cursor..abs_pos]);
        // Push highlighted match
        result.push_str("<<HIGHLIGHT>>");
        result.push_str(&text[abs_pos..abs_pos + query_len]);
        result.push_str("<</HIGHLIGHT>>");
        cursor = abs_pos + query_len;
    }
    // Push remaining text
    result.push_str(&text[cursor..]);

    result
}

// --- Chapter State Machine ---

const VALID_TRANSITIONS: &[(&str, &[&str])] = &[
    ("task_ready", &["drafting", "draft_generated"]),
    ("drafting", &["draft_generated", "compile_failed", "task_ready"]),
    ("draft_generated", &["reviewing", "compile_failed", "drafting", "approved"]),
    ("reviewing", &["approved", "rewrite_required", "compile_failed"]),
    ("compile_failed", &["drafting", "task_ready"]),
    ("rewrite_required", &["drafting"]),
    ("approved", &["finalized", "archived", "needs_revalidate", "drafting"]),
    ("finalized", &["archived", "needs_revalidate"]),
    ("archived", &["needs_revalidate"]),
    ("needs_revalidate", &["reviewing", "drafting"]),
];

fn is_valid_transition(from: &str, to: &str) -> bool {
    VALID_TRANSITIONS
        .iter()
        .find(|(s, _)| *s == from)
        .map(|(_, targets)| targets.contains(&to))
        .unwrap_or(false)
}

#[tauri::command]
pub fn transition_chapter_state(db: State<'_, DbState>, chapter_number: i64, new_status: String) -> Result<ChapterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    let current_status: String = conn
        .query_row("SELECT status FROM chapters WHERE chapter_number = ?1", [chapter_number], |r| r.get(0))
        .map_err(|e| format!("Chapter not found: {}", e))?;

    if !is_valid_transition(&current_status, &new_status) {
        return Err(format!(
            "无效的状态转换: {} -> {}",
            current_status, new_status
        ));
    }

    conn.execute(
        "UPDATE chapters SET status = ?1, updated_at = ?2 WHERE chapter_number = ?3",
        rusqlite::params![new_status, now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    get_chapter_inner(conn, chapter_number)
}

#[tauri::command]
pub fn get_valid_transitions(db: State<'_, DbState>, chapter_number: i64) -> Result<Vec<String>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let current_status: String = conn
        .query_row("SELECT status FROM chapters WHERE chapter_number = ?1", [chapter_number], |r| r.get(0))
        .map_err(|e| format!("Chapter not found: {}", e))?;

    let transitions = VALID_TRANSITIONS
        .iter()
        .find(|(s, _)| *s == current_status)
        .map(|(_, targets)| targets.iter().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    Ok(transitions)
}

#[tauri::command]
pub fn set_compile_status(db: State<'_, DbState>, chapter_number: i64, compiler_status: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE chapters SET compiler_status = ?1, updated_at = ?2 WHERE chapter_number = ?3",
        rusqlite::params![compiler_status, now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn set_review_status(db: State<'_, DbState>, chapter_number: i64, review_status: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE chapters SET review_status = ?1, updated_at = ?2 WHERE chapter_number = ?3",
        rusqlite::params![review_status, now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// --- Chapter Versions ---

#[tauri::command]
pub fn list_chapter_versions(db: State<'_, DbState>, chapter_number: i64) -> Result<Vec<ChapterVersionInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let chapter_id: String = conn
        .query_row("SELECT id FROM chapters WHERE chapter_number = ?1", [chapter_number], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, chapter_id, version_no, content_type, content, diff_summary, created_by, created_at FROM chapter_versions WHERE chapter_id = ?1 ORDER BY version_no DESC")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([&chapter_id], |row| {
            Ok(ChapterVersionInfo {
                id: row.get(0)?, chapter_id: row.get(1)?, version_no: row.get(2)?, content_type: row.get(3)?,
                content: row.get(4)?, diff_summary: row.get(5)?, created_by: row.get(6)?, created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn rollback_chapter(db: State<'_, DbState>, chapter_number: i64, version_no: i64) -> Result<ChapterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let chapter_id: String = conn
        .query_row("SELECT id FROM chapters WHERE chapter_number = ?1", [chapter_number], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let content: String = conn
        .query_row(
            "SELECT content FROM chapter_versions WHERE chapter_id = ?1 AND version_no = ?2",
            rusqlite::params![chapter_id, version_no],
            |r| r.get(0),
        )
        .map_err(|e| format!("Version {} not found: {}", version_no, e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let word_count = content.chars().count() as i64;

    conn.execute(
        "UPDATE chapters SET draft_text = ?1, word_count = ?2, updated_at = ?3 WHERE chapter_number = ?4",
        rusqlite::params![content, word_count, now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    get_chapter_inner(conn, chapter_number)
}

// --- Characters ---

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterInfo {
    pub id: String,
    pub name: String,
    pub alias: Option<String>,
    pub role_type: String,
    pub identity_core: Option<String>,
    pub persona_core: Option<String>,
    pub soul_template_id: Option<String>,
    pub soul_json: String,
    pub taboo_rules: Option<String>,
    pub core_motivation: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_characters(db: State<'_, DbState>) -> Result<Vec<CharacterInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, name, alias, role_type, identity_core, persona_core, soul_template_id, soul_json, taboo_rules, core_motivation, status, created_at, updated_at FROM characters ORDER BY name")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(CharacterInfo {
                id: row.get(0)?, name: row.get(1)?, alias: row.get(2)?, role_type: row.get(3)?,
                identity_core: row.get(4)?, persona_core: row.get(5)?, soul_template_id: row.get(6)?,
                soul_json: row.get(7)?, taboo_rules: row.get(8)?, core_motivation: row.get(9)?,
                status: row.get(10)?, created_at: row.get(11)?, updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn create_character(db: State<'_, DbState>, name: String, role_type: Option<String>, soul_json: Option<String>) -> Result<CharacterInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();
    let role = role_type.unwrap_or_else(|| "supporting".to_string());
    let soul = soul_json.unwrap_or_else(|| "{}".to_string());

    conn.execute(
        "INSERT INTO characters (id, project_id, name, role_type, soul_json, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7)",
        rusqlite::params![id, project_id, name, role, soul, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(CharacterInfo {
        id,
        name,
        alias: None,
        role_type: role,
        identity_core: None,
        persona_core: None,
        soul_template_id: None,
        soul_json: soul,
        taboo_rules: None,
        core_motivation: None,
        status: "active".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_character(db: State<'_, DbState>, id: String, name: Option<String>, soul_json: Option<String>, role_type: Option<String>, identity_core: Option<String>, persona_core: Option<String>, core_motivation: Option<String>) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(v) = name {
        conn.execute("UPDATE characters SET name = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }
    if let Some(v) = soul_json {
        conn.execute("UPDATE characters SET soul_json = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }
    if let Some(v) = role_type {
        conn.execute("UPDATE characters SET role_type = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }
    if let Some(v) = identity_core {
        conn.execute("UPDATE characters SET identity_core = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }
    if let Some(v) = persona_core {
        conn.execute("UPDATE characters SET persona_core = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }
    if let Some(v) = core_motivation {
        conn.execute("UPDATE characters SET core_motivation = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![v, now, id]).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_character(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute("DELETE FROM characters WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Volume Word Stats ---

#[derive(Debug, Serialize, Deserialize)]
pub struct VolumeWordStats {
    pub volume_number: i64,
    pub volume_title: Option<String>,
    pub total_words: i64,
    pub chapter_count: i64,
    pub avg_words_per_chapter: i64,
    pub min_words: i64,
    pub max_words: i64,
}

/// Get word count statistics grouped by volume.
/// Chapters are assigned to a volume when their chapter_number falls within the
/// volume's chapter_start..chapter_end range.
#[tauri::command]
pub fn get_volume_word_stats(db: State<'_, DbState>) -> Result<Vec<VolumeWordStats>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    // Fetch all volumes
    let mut vol_stmt = conn
        .prepare("SELECT volume_number, title, chapter_start, chapter_end FROM volumes ORDER BY volume_number")
        .map_err(|e| e.to_string())?;

    let volumes: Vec<(i64, Option<String>, Option<i64>, Option<i64>)> = vol_stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut results: Vec<VolumeWordStats> = Vec::new();

    for (vol_num, vol_title, start_opt, end_opt) in &volumes {
        let (start, end) = match (start_opt, end_opt) {
            (Some(s), Some(e)) => (*s, *e),
            (Some(s), None) => (*s, i64::MAX),
            _ => continue, // skip volumes without a start chapter
        };

        // Aggregate word stats for chapters in this volume's range
        let total_words: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 AND word_count IS NOT NULL",
                rusqlite::params![start, end],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let chapter_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2",
                rusqlite::params![start, end],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let min_words: i64 = conn
            .query_row(
                "SELECT COALESCE(MIN(word_count), 0) FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 AND word_count IS NOT NULL",
                rusqlite::params![start, end],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let max_words: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(word_count), 0) FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 AND word_count IS NOT NULL",
                rusqlite::params![start, end],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let avg_words_per_chapter = if chapter_count > 0 {
            total_words / chapter_count
        } else {
            0
        };

        results.push(VolumeWordStats {
            volume_number: *vol_num,
            volume_title: vol_title.clone(),
            total_words,
            chapter_count,
            avg_words_per_chapter,
            min_words,
            max_words,
        });
    }

    Ok(results)
}

// --- Chapter Statistics ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterWordInfo {
    pub chapter_number: i64,
    pub words: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterStatistics {
    pub total_chapters: i64,
    pub total_words: i64,
    pub avg_words_per_chapter: f64,
    pub median_words: i64,
    pub shortest_chapter: Option<ChapterWordInfo>,
    pub longest_chapter: Option<ChapterWordInfo>,
    pub words_per_day: f64,
    pub completion_estimate: f64,
}

/// Get aggregate statistics for all chapters in the current project.
#[tauri::command]
pub fn get_chapter_statistics(db: State<'_, DbState>) -> Result<ChapterStatistics, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT chapter_number, word_count, created_at FROM chapters WHERE word_count IS NOT NULL ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;

    let chapters: Vec<(i64, i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let total_chapters = chapters.len() as i64;
    let total_words: i64 = chapters.iter().map(|(_, wc, _)| wc).sum();
    let avg_words_per_chapter = if total_chapters > 0 {
        total_words as f64 / total_chapters as f64
    } else {
        0.0
    };

    // Median
    let mut word_counts: Vec<i64> = chapters.iter().map(|(_, wc, _)| *wc).collect();
    word_counts.sort();
    let median_words = if total_chapters > 0 {
        let mid = total_chapters as usize / 2;
        if total_chapters as usize % 2 == 0 {
            (word_counts[mid - 1] + word_counts[mid]) / 2
        } else {
            word_counts[mid]
        }
    } else {
        0
    };

    let shortest_chapter = chapters
        .iter()
        .min_by_key(|(_, wc, _)| wc)
        .map(|(cn, wc, _)| ChapterWordInfo {
            chapter_number: *cn,
            words: *wc,
        });

    let longest_chapter = chapters
        .iter()
        .max_by_key(|(_, wc, _)| wc)
        .map(|(cn, wc, _)| ChapterWordInfo {
            chapter_number: *cn,
            words: *wc,
        });

    // Words per day estimate: total_words / days_since_first_chapter
    let words_per_day = if !chapters.is_empty() {
        let first_created_at = &chapters[0].2;
        if let Ok(first_dt) = chrono::DateTime::parse_from_rfc3339(first_created_at) {
            let now = chrono::Utc::now();
            let duration = now.signed_duration_since(first_dt);
            let days = duration.num_days().max(1) as f64;
            total_words as f64 / days
        } else {
            0.0
        }
    } else {
        0.0
    };

    // Completion estimate: (target_words - total_words) / words_per_day
    let target_words: i64 = conn
        .query_row(
            "SELECT target_words FROM projects LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let remaining = (target_words - total_words).max(0);
    let completion_estimate = if words_per_day > 0.0 {
        remaining as f64 / words_per_day
    } else {
        0.0
    };

    Ok(ChapterStatistics {
        total_chapters,
        total_words,
        avg_words_per_chapter,
        median_words,
        shortest_chapter,
        longest_chapter,
        words_per_day,
        completion_estimate,
    })
}

// --- Auto-Generate Chapter Outline ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterOutlineSuggestion {
    pub chapter_number: i64,
    pub outline_json: String,
    pub task_card_summary: String,
    pub suggested_word_count: i64,
}

/// Data preparation command for AI chapter outline generation.
/// If no task_card text is provided, fetches and compiles the task card
/// from the chapter_tasks table.
#[tauri::command]
pub fn auto_generate_chapter_outline(
    db: State<'_, DbState>,
    chapter_number: i64,
    task_card: Option<String>,
) -> Result<ChapterOutlineSuggestion, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let task_card_summary = if let Some(tc) = task_card {
        tc
    } else {
        // Fetch from chapter_tasks and compile a summary
        let task = conn.query_row(
            "SELECT objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook FROM chapter_tasks WHERE chapter_number = ?1",
            [chapter_number],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            )),
        );

        match task {
            Ok((objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook)) => {
                let mut summary = format!("目标: {}", objective);
                if let Some(ref p) = must_progress { summary.push_str(&format!("\n必须推进: {}", p)); }
                if let Some(ref r) = must_recall { summary.push_str(&format!("\n必须回顾: {}", r)); }
                if let Some(ref a) = must_avoid { summary.push_str(&format!("\n必须避免: {}", a)); }
                if let Some(ref h) = required_hooks { summary.push_str(&format!("\n必须钩子: {}", h)); }
                if let Some(ref c) = required_context { summary.push_str(&format!("\n必须上下文: {}", c)); }
                if let Some(ref e) = ending_hook { summary.push_str(&format!("\n结尾钩子: {}", e)); }
                summary
            }
            Err(_) => format!("第{}章 (无任务卡)", chapter_number),
        }
    };

    let suggested_word_count = conn
        .query_row(
            "SELECT min_chapter_words FROM projects LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(2000);

    Ok(ChapterOutlineSuggestion {
        chapter_number,
        outline_json: "{}".to_string(),
        task_card_summary,
        suggested_word_count,
    })
}

// ─── RCL-005: Recall result dedup and merge ───

/// A single hit from RAG semantic recall with its similarity score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagHit {
    pub chapter_number: i64,
    pub score: f32,
}

/// The merged result for a single chapter, combining FTS and RAG signals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergedRecallResult {
    pub chapter_number: i64,
    pub fts_match: bool,
    pub rag_score: Option<f32>,
    pub combined_rank: f32,
}

/// RCL-005: Merge FTS (full-text search) chapter results with RAG semantic
/// recall results into a single deduplicated and ranked list.
///
/// - `fts_chapters`: chapter numbers that matched via FTS (LIKE search on chapter text).
/// - `rag_results`: (chapter_number, similarity_score) pairs from semantic vector search.
///
/// Deduplication keeps the **highest** RAG score per chapter.
/// The `combined_rank` is computed as:
///   `combined_rank = (fts_match ? 0.5 : 0.0) + rag_score.unwrap_or(0.0)`
///
/// Results are sorted by `combined_rank` descending, with `chapter_number`
/// ascending as a tiebreaker.
#[tauri::command]
pub fn merge_recall_results(
    fts_chapters: Vec<i64>,
    rag_results: Vec<RagHit>,
) -> Result<Vec<MergedRecallResult>, String> {
    use std::collections::HashMap;

    // Collect FTS chapter set
    let fts_set: std::collections::HashSet<i64> =
        fts_chapters.iter().cloned().collect();

    // Merge RAG results: deduplicate by chapter_number, keep highest score
    let mut rag_best: HashMap<i64, f32> = HashMap::new();
    for hit in &rag_results {
        let entry = rag_best.entry(hit.chapter_number).or_insert(hit.score);
        if hit.score > *entry {
            *entry = hit.score;
        }
    }

    // Collect all unique chapters from both sources
    let mut all_chapters: std::collections::HashSet<i64> = fts_set.clone();
    for cn in rag_best.keys() {
        all_chapters.insert(*cn);
    }

    // Build merged results
    let mut merged: Vec<MergedRecallResult> = all_chapters
        .into_iter()
        .map(|chapter_number| {
            let fts_match = fts_set.contains(&chapter_number);
            let rag_score = rag_best.get(&chapter_number).copied();
            let combined_rank =
                (if fts_match { 0.5 } else { 0.0 })
                + rag_score.unwrap_or(0.0);
            MergedRecallResult {
                chapter_number,
                fts_match,
                rag_score,
                combined_rank,
            }
        })
        .collect();

    // Sort by combined_rank descending, then chapter_number ascending
    merged.sort_by(|a, b| {
        b.combined_rank
            .partial_cmp(&a.combined_rank)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.chapter_number.cmp(&b.chapter_number))
    });

    Ok(merged)
}
