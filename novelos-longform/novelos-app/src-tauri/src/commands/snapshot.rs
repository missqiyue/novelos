use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub snapshot_type: String,
    pub chapter_start: Option<i64>,
    pub chapter_end: Option<i64>,
    pub volume_id: Option<String>,
    pub arc_id: Option<String>,
    pub summary_json: String,
    pub created_at: String,
}

/// A lightweight reference to a snapshot used for recall lookups
#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotRef {
    pub id: String,
    pub snapshot_type: String,
    pub chapter_end: Option<i64>,
    pub created_at: String,
}

/// Generate a snapshot after chapter finalization (SNP-001)
#[tauri::command]
pub fn generate_chapter_snapshot(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<SnapshotInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    create_snapshot_for_chapter(conn, &project_id, chapter_number)
}

/// Internal helper for creating a chapter snapshot without needing State
pub fn create_snapshot_for_chapter(
    conn: &rusqlite::Connection,
    project_id: &str,
    chapter_number: i64,
) -> Result<SnapshotInfo, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let chapter: (String, String, Option<i64>) = conn
        .query_row(
            "SELECT title, COALESCE(final_text, draft_text), word_count FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut char_stmt = conn
        .prepare("SELECT c.name, c.role_type, cs.level_state, cs.emotion_state, cs.goal_state FROM characters c LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.chapter_to IS NULL WHERE c.status = 'active'")
        .map_err(|e| e.to_string())?;
    let characters: Vec<serde_json::Value> = char_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "name": row.get::<_, String>(0)?,
                "role_type": row.get::<_, String>(1)?,
                "level": row.get::<_, Option<String>>(2)?,
                "emotion": row.get::<_, Option<String>>(3)?,
                "goal": row.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let fs_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE status = 'planted'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let volume: Option<(i64, String)> = conn
        .query_row(
            "SELECT volume_number, COALESCE(title, '') FROM volumes WHERE chapter_start <= ?1 AND (chapter_end >= ?1 OR chapter_end IS NULL) LIMIT 1",
            [chapter_number],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).ok();

    let volume_id = volume.as_ref().map(|v| v.0.to_string());
    let summary = serde_json::json!({
        "chapter_number": chapter_number,
        "chapter_title": chapter.0,
        "word_count": chapter.2,
        "volume": volume.map(|v| format!("第{}卷: {}", v.0, v.1)),
        "character_count": characters.len(),
        "characters": characters,
        "active_foreshadow_count": fs_count,
        "generated_at": now,
    });

    conn.execute(
        "INSERT INTO snapshots (id, project_id, snapshot_type, chapter_start, chapter_end, volume_id, summary_json, created_at) VALUES (?1, ?2, 'chapter', ?3, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, project_id, chapter_number, volume_id, summary.to_string(), now],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE chapters SET snapshot_id = ?1 WHERE chapter_number = ?2",
        rusqlite::params![id, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    Ok(SnapshotInfo {
        id,
        snapshot_type: "chapter".to_string(),
        chapter_start: Some(chapter_number),
        chapter_end: Some(chapter_number),
        volume_id,
        arc_id: None,
        summary_json: summary.to_string(),
        created_at: now,
    })
}

/// List snapshots with optional type/chapter filter (SNP-004)
#[tauri::command]
pub fn list_snapshots(
    db: State<'_, DbState>,
    snapshot_type: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<Vec<SnapshotInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut sql = String::from("SELECT id, snapshot_type, chapter_start, chapter_end, volume_id, arc_id, summary_json, created_at FROM snapshots WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref st) = snapshot_type {
        sql.push_str(&format!(" AND snapshot_type = ?{}", params.len() + 1));
        params.push(Box::new(st.clone()));
    }
    if let Some(cs) = chapter_start {
        sql.push_str(&format!(" AND chapter_start >= ?{}", params.len() + 1));
        params.push(Box::new(cs));
    }
    if let Some(ce) = chapter_end {
        sql.push_str(&format!(" AND chapter_end <= ?{}", params.len() + 1));
        params.push(Box::new(ce));
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT 50");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(SnapshotInfo {
                id: row.get(0)?,
                snapshot_type: row.get(1)?,
                chapter_start: row.get(2)?,
                chapter_end: row.get(3)?,
                volume_id: row.get(4)?,
                arc_id: row.get(5)?,
                summary_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

// ─── SNP-002: Arc snapshot generation ───

/// Generate a snapshot for an entire arc (SNP-002)
#[tauri::command]
pub fn generate_arc_snapshot(
    db: State<'_, DbState>,
    arc_id: String,
) -> Result<SnapshotInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    // Fetch arc info
    let arc: (Option<String>, Option<String>, Option<i64>, Option<i64>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT volume_id, title, chapter_start, chapter_end, goal, status FROM arcs WHERE id = ?1",
            rusqlite::params![&arc_id],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?,
            )),
        )
        .map_err(|e| format!("Arc not found: {}", e))?;

    let (arc_volume_id, arc_title, arc_start, arc_end, arc_goal, arc_status) = arc;

    // Helper to query chapters in a range
    let query_chapters = |start: i64, end: i64| -> Result<Vec<serde_json::Value>, String> {
        let mut stmt = conn
            .prepare("SELECT chapter_number, title, status, word_count, compiler_status, review_status FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 ORDER BY chapter_number")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![start, end], |row| {
                Ok(serde_json::json!({
                    "chapter_number": row.get::<_, i64>(0)?,
                    "title": row.get::<_, Option<String>>(1)?,
                    "status": row.get::<_, String>(2)?,
                    "word_count": row.get::<_, Option<i64>>(3)?,
                    "compiler_status": row.get::<_, Option<String>>(4)?,
                    "review_status": row.get::<_, Option<String>>(5)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    };

    let query_characters = |start: i64, end: i64| -> Result<Vec<serde_json::Value>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT c.name, c.role_type, cs.level_state, cs.emotion_state, cs.goal_state \
                 FROM character_states cs JOIN characters c ON c.id = cs.character_id \
                 WHERE cs.chapter_from >= ?1 AND cs.chapter_from <= ?2 AND c.status = 'active'",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![start, end], |row| {
                Ok(serde_json::json!({
                    "name": row.get::<_, String>(0)?,
                    "role_type": row.get::<_, String>(1)?,
                    "level": row.get::<_, Option<String>>(2)?,
                    "emotion": row.get::<_, Option<String>>(3)?,
                    "goal": row.get::<_, Option<String>>(4)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    };

    // Query all chapters in this arc's range
    let chapters: Vec<serde_json::Value> = match (arc_start, arc_end) {
        (Some(start), Some(end)) => query_chapters(start, end)?,
        _ => Vec::new(),
    };

    // Calculate total words
    let total_words: i64 = chapters
        .iter()
        .filter_map(|c| c["word_count"].as_i64())
        .sum();

    // Characters appearing in these chapters
    let characters: Vec<serde_json::Value> = match (arc_start, arc_end) {
        (Some(start), Some(end)) => query_characters(start, end)?,
        _ => Vec::new(),
    };

    // Foreshadows planted in this arc range
    let foreshadow_planted: Vec<serde_json::Value> = match (arc_start, arc_end) {
        (Some(start), Some(end)) => {
            let mut stmt = conn
                .prepare("SELECT id, title, seed_chapter FROM foreshadow_items WHERE seed_chapter >= ?1 AND seed_chapter <= ?2 AND status = 'planted'")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![start, end], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "title": row.get::<_, String>(1)?,
                        "seed_chapter": row.get::<_, i64>(2)?,
                    }))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        _ => Vec::new(),
    };

    let foreshadow_resolved: Vec<serde_json::Value> = match (arc_start, arc_end) {
        (Some(start), Some(end)) => {
            let mut stmt = conn
                .prepare("SELECT id, title, resolved_chapter FROM foreshadow_items WHERE resolved_chapter >= ?1 AND resolved_chapter <= ?2 AND status = 'resolved'")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![start, end], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "title": row.get::<_, String>(1)?,
                        "resolved_chapter": row.get::<_, Option<i64>>(2)?,
                    }))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        _ => Vec::new(),
    };

    let summary = serde_json::json!({
        "arc_id": arc_id,
        "arc_title": arc_title,
        "arc_goal": arc_goal,
        "arc_status": arc_status,
        "chapter_range": { "start": arc_start, "end": arc_end },
        "chapter_count": chapters.len(),
        "total_words": total_words,
        "chapters": chapters,
        "character_count": characters.len(),
        "characters": characters,
        "foreshadow_planted_count": foreshadow_planted.len(),
        "foreshadow_planted": foreshadow_planted,
        "foreshadow_resolved_count": foreshadow_resolved.len(),
        "foreshadow_resolved": foreshadow_resolved,
        "generated_at": now,
    });

    conn.execute(
        "INSERT INTO snapshots (id, project_id, snapshot_type, chapter_start, chapter_end, volume_id, arc_id, summary_json, created_at) VALUES (?1, ?2, 'arc', ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, project_id, arc_start, arc_end, arc_volume_id, arc_id, summary.to_string(), now],
    )
    .map_err(|e| e.to_string())?;

    Ok(SnapshotInfo {
        id,
        snapshot_type: "arc".to_string(),
        chapter_start: arc_start,
        chapter_end: arc_end,
        volume_id: arc_volume_id,
        arc_id: Some(arc_id),
        summary_json: summary.to_string(),
        created_at: now,
    })
}

// ─── SNP-003: Volume snapshot generation ───

/// Generate a comprehensive snapshot for an entire volume (SNP-003)
#[tauri::command]
pub fn generate_volume_snapshot(
    db: State<'_, DbState>,
    volume_id: String,
) -> Result<SnapshotInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    // Fetch volume info
    let volume: (i64, Option<String>, Option<i64>, Option<i64>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT volume_number, title, chapter_start, chapter_end, goal, main_conflict, climax, settlement, status FROM volumes WHERE id = ?1",
            rusqlite::params![&volume_id],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?,
            )),
        )
        .map_err(|e| format!("Volume not found: {}", e))?;

    let (
        volume_number,
        volume_title,
        vol_start,
        vol_end,
        vol_goal,
        vol_conflict,
        vol_climax,
        vol_settlement,
        vol_status,
    ) = volume;

    // Query all chapters in this volume range
    let chapters: Vec<serde_json::Value> = match (vol_start, vol_end) {
        (Some(start), Some(end)) => {
            let mut stmt = conn
                .prepare("SELECT chapter_number, title, status, word_count, compiler_status, review_status FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 ORDER BY chapter_number")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![start, end], |row| {
                    Ok(serde_json::json!({
                        "chapter_number": row.get::<_, i64>(0)?,
                        "title": row.get::<_, Option<String>>(1)?,
                        "status": row.get::<_, String>(2)?,
                        "word_count": row.get::<_, Option<i64>>(3)?,
                        "compiler_status": row.get::<_, Option<String>>(4)?,
                        "review_status": row.get::<_, Option<String>>(5)?,
                    }))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        _ => Vec::new(),
    };

    let total_words: i64 = chapters
        .iter()
        .filter_map(|c| c["word_count"].as_i64())
        .sum();

    let finalized_count = chapters
        .iter()
        .filter(|c| c["status"].as_str() == Some("finalized"))
        .count();

    // Query all arcs in this volume
    let mut arc_stmt = conn
        .prepare("SELECT id, arc_type, title, chapter_start, chapter_end, goal, status, priority FROM arcs WHERE volume_id = ?1 ORDER BY priority")
        .map_err(|e| e.to_string())?;
    let arcs: Vec<serde_json::Value> = {
        let rows = arc_stmt
            .query_map(rusqlite::params![&volume_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "arc_type": row.get::<_, String>(1)?,
                    "title": row.get::<_, Option<String>>(2)?,
                    "chapter_start": row.get::<_, Option<i64>>(3)?,
                    "chapter_end": row.get::<_, Option<i64>>(4)?,
                    "goal": row.get::<_, Option<String>>(5)?,
                    "status": row.get::<_, Option<String>>(6)?,
                    "priority": row.get::<_, Option<i64>>(7)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    // Characters active in this volume range
    let characters: Vec<serde_json::Value> = match (vol_start, vol_end) {
        (Some(start), Some(end)) => {
            let mut stmt = conn
                .prepare(
                    "SELECT DISTINCT c.name, c.role_type, cs.level_state, cs.emotion_state, cs.goal_state \
                     FROM character_states cs JOIN characters c ON c.id = cs.character_id \
                     WHERE cs.chapter_from >= ?1 AND cs.chapter_from <= ?2 AND c.status = 'active'",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![start, end], |row| {
                    Ok(serde_json::json!({
                        "name": row.get::<_, String>(0)?,
                        "role_type": row.get::<_, String>(1)?,
                        "level": row.get::<_, Option<String>>(2)?,
                        "emotion": row.get::<_, Option<String>>(3)?,
                        "goal": row.get::<_, Option<String>>(4)?,
                    }))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        _ => Vec::new(),
    };

    // Foreshadows summary
    let foreshadow_planted_count: i64 = if let (Some(start), Some(end)) = (vol_start, vol_end) {
        conn.query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE seed_chapter >= ?1 AND seed_chapter <= ?2 AND status = 'planted'",
            rusqlite::params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0
    };

    let foreshadow_resolved_count: i64 = if let (Some(start), Some(end)) = (vol_start, vol_end) {
        conn.query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE resolved_chapter >= ?1 AND resolved_chapter <= ?2 AND status = 'resolved'",
            rusqlite::params![start, end],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0
    };

    // Compiler status aggregation
    let compile_pass_count = chapters
        .iter()
        .filter(|c| c["compiler_status"].as_str() == Some("pass"))
        .count();
    let compile_fail_count = chapters
        .iter()
        .filter(|c| c["compiler_status"].as_str() == Some("fail"))
        .count();

    let summary = serde_json::json!({
        "volume_id": volume_id,
        "volume_number": volume_number,
        "volume_title": volume_title,
        "volume_goal": vol_goal,
        "volume_main_conflict": vol_conflict,
        "volume_climax": vol_climax,
        "volume_settlement": vol_settlement,
        "volume_status": vol_status,
        "chapter_range": { "start": vol_start, "end": vol_end },
        "chapter_count": chapters.len(),
        "finalized_count": finalized_count,
        "total_words": total_words,
        "chapters": chapters,
        "arc_count": arcs.len(),
        "arcs": arcs,
        "character_count": characters.len(),
        "characters": characters,
        "foreshadow_planted_count": foreshadow_planted_count,
        "foreshadow_resolved_count": foreshadow_resolved_count,
        "compiler_pass_count": compile_pass_count,
        "compiler_fail_count": compile_fail_count,
        "generated_at": now,
    });

    conn.execute(
        "INSERT INTO snapshots (id, project_id, snapshot_type, chapter_start, chapter_end, volume_id, arc_id, summary_json, created_at) VALUES (?1, ?2, 'volume', ?3, ?4, ?5, NULL, ?6, ?7)",
        rusqlite::params![id, project_id, vol_start, vol_end, volume_id, summary.to_string(), now],
    )
    .map_err(|e| e.to_string())?;

    Ok(SnapshotInfo {
        id,
        snapshot_type: "volume".to_string(),
        chapter_start: vol_start,
        chapter_end: vol_end,
        volume_id: Some(volume_id),
        arc_id: None,
        summary_json: summary.to_string(),
        created_at: now,
    })
}

// ─── SNP-005: Snapshot-based recall helper ───

/// Find the most recent snapshot whose chapter_end is strictly before the given chapter_number.
/// This is a public helper usable by other modules (e.g., the chapter recall flow).
pub fn get_latest_snapshot_for_chapter(
    conn: &rusqlite::Connection,
    chapter_number: i64,
) -> Result<Option<SnapshotRef>, String> {
    let result = conn.query_row(
        "SELECT id, snapshot_type, chapter_end, created_at FROM snapshots WHERE chapter_end < ?1 ORDER BY chapter_end DESC, created_at DESC LIMIT 1",
        rusqlite::params![chapter_number],
        |row| {
            Ok(SnapshotRef {
                id: row.get(0)?,
                snapshot_type: row.get(1)?,
                chapter_end: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    );

    match result {
        Ok(sr) => Ok(Some(sr)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command wrapper for SNP-005: gets the latest snapshot before a chapter
#[tauri::command]
pub fn get_latest_snapshot_before_chapter(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<Option<SnapshotRef>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    get_latest_snapshot_for_chapter(conn, chapter_number)
}
