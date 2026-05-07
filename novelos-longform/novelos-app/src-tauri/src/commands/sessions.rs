use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingSessionInfo {
    pub id: String,
    pub project_id: String,
    pub chapter_id: Option<String>,
    pub words_written: i64,
    pub duration_seconds: i64,
    pub started_at: String,
    pub ended_at: String,
}

#[derive(Debug, Deserialize)]
pub struct StartSessionInput {
    pub chapter_id: Option<String>,
    pub start_word_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct EndSessionInput {
    pub session_id: String,
    pub end_word_count: i64,
}

#[tauri::command]
pub fn start_writing_session(
    db: State<'_, DbState>,
    input: StartSessionInput,
) -> Result<WritingSessionInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO writing_sessions (id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at) VALUES (?1, ?2, ?3, 0, 0, ?4, ?4)",
        rusqlite::params![id, project_id, input.chapter_id, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO project_settings (project_id, key, value) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, format!("session_start_wc_{}", id), input.start_word_count.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(WritingSessionInfo {
        id,
        project_id,
        chapter_id: input.chapter_id,
        words_written: 0,
        duration_seconds: 0,
        started_at: now.clone(),
        ended_at: now,
    })
}

#[tauri::command]
pub fn end_writing_session(
    db: State<'_, DbState>,
    input: EndSessionInput,
) -> Result<WritingSessionInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let (started_at, chapter_id): (String, Option<String>) = conn
        .query_row(
            "SELECT started_at, chapter_id FROM writing_sessions WHERE id = ?1",
            rusqlite::params![input.session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let now_str = chrono::Utc::now().to_rfc3339();

    let start_time = chrono::DateTime::parse_from_rfc3339(&started_at)
        .map_err(|e| format!("Invalid started_at: {}", e))?
        .to_utc();
    let duration = (chrono::Utc::now() - start_time).num_seconds().max(0);

    let start_wc: i64 = conn
        .query_row(
            "SELECT value FROM project_settings WHERE project_id = ?1 AND key = ?2",
            rusqlite::params![project_id, format!("session_start_wc_{}", input.session_id)],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default()
        .parse()
        .unwrap_or(0);

    let words_written = (input.end_word_count - start_wc).max(0);

    conn.execute(
        "UPDATE writing_sessions SET words_written = ?1, duration_seconds = ?2, ended_at = ?3 WHERE id = ?4",
        rusqlite::params![words_written, duration, now_str, input.session_id],
    )
    .map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "DELETE FROM project_settings WHERE project_id = ?1 AND key = ?2",
        rusqlite::params![project_id, format!("session_start_wc_{}", input.session_id)],
    );

    Ok(WritingSessionInfo {
        id: input.session_id,
        project_id,
        chapter_id,
        words_written,
        duration_seconds: duration,
        started_at,
        ended_at: now_str,
    })
}

#[tauri::command]
pub fn list_writing_sessions(
    db: State<'_, DbState>,
    chapter_id: Option<String>,
) -> Result<Vec<WritingSessionInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let sql = if chapter_id.is_some() {
        "SELECT id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at FROM writing_sessions WHERE project_id = ?1 AND chapter_id = ?2 ORDER BY started_at DESC"
    } else {
        "SELECT id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at FROM writing_sessions WHERE project_id = ?1 ORDER BY started_at DESC"
    };

    let rows = if let Some(ch_id) = chapter_id {
        conn.prepare(sql)
            .map_err(|e| e.to_string())?
            .query_map(rusqlite::params![project_id, ch_id], |row| {
                Ok(WritingSessionInfo {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_id: row.get(2)?,
                    words_written: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    started_at: row.get(5)?,
                    ended_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        conn.prepare(sql)
            .map_err(|e| e.to_string())?
            .query_map(rusqlite::params![project_id], |row| {
                Ok(WritingSessionInfo {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_id: row.get(2)?,
                    words_written: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    started_at: row.get(5)?,
                    ended_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    Ok(rows)
}
