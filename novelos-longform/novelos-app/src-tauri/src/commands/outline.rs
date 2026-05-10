use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// --- Book Outline ---

#[derive(Debug, Serialize, Deserialize)]
pub struct BookOutlineInfo {
    pub id: String,
    pub version: i64,
    pub content_json: String,
    pub change_reason: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_book_outline(db: State<'_, DbState>) -> Result<Option<BookOutlineInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let result = conn.query_row(
        "SELECT id, version, content_json, change_reason, status, created_at, updated_at FROM book_outlines ORDER BY version DESC LIMIT 1",
        [],
        |row| Ok(BookOutlineInfo {
            id: row.get(0)?,
            version: row.get(1)?,
            content_json: row.get(2)?,
            change_reason: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        }),
    );

    match result {
        Ok(info) => Ok(Some(info)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_book_outline(
    db: State<'_, DbState>,
    content_json: String,
    change_reason: Option<String>,
) -> Result<BookOutlineInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();

    let next_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM book_outlines",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO book_outlines (id, project_id, version, content_json, change_reason, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7)",
        rusqlite::params![id, project_id, next_version, content_json, change_reason, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(BookOutlineInfo {
        id,
        version: next_version,
        content_json,
        change_reason,
        status: "draft".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

// --- Volume Outline ---

#[derive(Debug, Serialize, Deserialize)]
pub struct VolumeOutlineInfo {
    pub id: String,
    pub volume_id: String,
    pub version: i64,
    pub content_json: String,
    pub change_reason: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_volume_outlines(db: State<'_, DbState>) -> Result<Vec<VolumeOutlineInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, volume_id, version, content_json, change_reason, status, created_at, updated_at FROM volume_outlines ORDER BY volume_id")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(VolumeOutlineInfo {
                id: row.get(0)?,
                volume_id: row.get(1)?,
                version: row.get(2)?,
                content_json: row.get(3)?,
                change_reason: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn save_volume_outline(
    db: State<'_, DbState>,
    volume_id: String,
    content_json: String,
    change_reason: Option<String>,
) -> Result<VolumeOutlineInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();

    let next_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM volume_outlines WHERE volume_id = ?1",
            [&volume_id],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO volume_outlines (id, project_id, volume_id, version, content_json, change_reason, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8)",
        rusqlite::params![id, project_id, volume_id, next_version, content_json, change_reason, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(VolumeOutlineInfo {
        id,
        volume_id,
        version: next_version,
        content_json,
        change_reason,
        status: "draft".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

// --- Chapter Outline ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterOutlineInfo {
    pub id: String,
    pub chapter_number: i64,
    pub task_id: Option<String>,
    pub version: i64,
    pub content_json: String,
    pub confirmed: bool,
    pub change_reason: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_chapter_outlines(db: State<'_, DbState>) -> Result<Vec<ChapterOutlineInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at FROM chapter_outlines ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(ChapterOutlineInfo {
                id: row.get(0)?,
                chapter_number: row.get(1)?,
                task_id: row.get(2)?,
                version: row.get(3)?,
                content_json: row.get(4)?,
                confirmed: row.get::<_, i64>(5)? != 0,
                change_reason: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn get_latest_chapter_outline(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<Option<ChapterOutlineInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    get_latest_chapter_outline_inner(conn, chapter_number)
}

pub fn get_latest_chapter_outline_inner(
    conn: &rusqlite::Connection,
    chapter_number: i64,
) -> Result<Option<ChapterOutlineInfo>, String> {
    conn.query_row(
        "SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at
         FROM chapter_outlines
         WHERE chapter_number = ?1
         ORDER BY version DESC, updated_at DESC
         LIMIT 1",
        [chapter_number],
        |row| {
            Ok(ChapterOutlineInfo {
                id: row.get(0)?,
                chapter_number: row.get(1)?,
                task_id: row.get(2)?,
                version: row.get(3)?,
                content_json: row.get(4)?,
                confirmed: row.get::<_, i64>(5)? != 0,
                change_reason: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
    .map_err(|e| e.to_string())
}

pub fn save_generated_chapter_outline_inner(
    conn: &rusqlite::Connection,
    project_id: &str,
    chapter_number: i64,
    content_json: &str,
    task_id: Option<&str>,
    change_reason: Option<&str>,
) -> Result<ChapterOutlineInfo, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let next_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM chapter_outlines WHERE chapter_number = ?1",
            [chapter_number],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO chapter_outlines (id, project_id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, 'generated', ?8, ?9)",
        rusqlite::params![
            id,
            project_id,
            chapter_number,
            task_id,
            next_version,
            content_json,
            change_reason,
            now,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(ChapterOutlineInfo {
        id,
        chapter_number,
        task_id: task_id.map(|value| value.to_string()),
        version: next_version,
        content_json: content_json.to_string(),
        confirmed: false,
        change_reason: change_reason.map(|value| value.to_string()),
        status: "generated".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn save_chapter_outline(
    db: State<'_, DbState>,
    chapter_number: i64,
    content_json: String,
    task_id: Option<String>,
    change_reason: Option<String>,
) -> Result<ChapterOutlineInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();

    let next_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM chapter_outlines WHERE chapter_number = ?1",
            [chapter_number],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO chapter_outlines (id, project_id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, 'draft', ?8, ?9)",
        rusqlite::params![id, project_id, chapter_number, task_id, next_version, content_json, change_reason, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(ChapterOutlineInfo {
        id,
        chapter_number,
        task_id,
        version: next_version,
        content_json,
        confirmed: false,
        change_reason,
        status: "draft".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn confirm_chapter_outline(db: State<'_, DbState>, chapter_number: i64) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE chapter_outlines SET confirmed = 1, status = 'confirmed', updated_at = ?1 WHERE chapter_number = ?2 AND version = (SELECT MAX(version) FROM chapter_outlines WHERE chapter_number = ?2)",
        rusqlite::params![now, chapter_number],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// --- Volumes ---

#[derive(Debug, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub id: String,
    pub volume_number: i64,
    pub title: Option<String>,
    pub chapter_start: Option<i64>,
    pub chapter_end: Option<i64>,
    pub goal: Option<String>,
    pub main_conflict: Option<String>,
    pub climax: Option<String>,
    pub settlement: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn list_volumes(db: State<'_, DbState>) -> Result<Vec<VolumeInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, volume_number, title, chapter_start, chapter_end, goal, main_conflict, climax, settlement, status FROM volumes ORDER BY volume_number")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(VolumeInfo {
                id: row.get(0)?,
                volume_number: row.get(1)?,
                title: row.get(2)?,
                chapter_start: row.get(3)?,
                chapter_end: row.get(4)?,
                goal: row.get(5)?,
                main_conflict: row.get(6)?,
                climax: row.get(7)?,
                settlement: row.get(8)?,
                status: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn update_volume(
    db: State<'_, DbState>,
    id: String,
    title: Option<String>,
    goal: Option<String>,
    main_conflict: Option<String>,
    climax: Option<String>,
    settlement: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    if let Some(v) = title {
        conn.execute(
            "UPDATE volumes SET title = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = goal {
        conn.execute(
            "UPDATE volumes SET goal = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = main_conflict {
        conn.execute(
            "UPDATE volumes SET main_conflict = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = climax {
        conn.execute(
            "UPDATE volumes SET climax = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = settlement {
        conn.execute(
            "UPDATE volumes SET settlement = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = status {
        conn.execute(
            "UPDATE volumes SET status = ?1 WHERE id = ?2",
            rusqlite::params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// --- Arcs ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ArcInfo {
    pub id: String,
    pub volume_id: Option<String>,
    pub arc_type: String,
    pub title: Option<String>,
    pub chapter_start: Option<i64>,
    pub chapter_end: Option<i64>,
    pub goal: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i64>,
}

#[tauri::command]
pub fn list_arcs(
    db: State<'_, DbState>,
    volume_id: Option<String>,
) -> Result<Vec<ArcInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn.prepare(
        "SELECT id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority FROM arcs WHERE (?1 IS NULL OR volume_id = ?1) ORDER BY priority"
    ).map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![volume_id], |row| {
            Ok(ArcInfo {
                id: row.get(0)?,
                volume_id: row.get(1)?,
                arc_type: row.get(2)?,
                title: row.get(3)?,
                chapter_start: row.get(4)?,
                chapter_end: row.get(5)?,
                goal: row.get(6)?,
                status: row.get(7)?,
                priority: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[derive(Debug, Deserialize)]
pub struct CreateArcInput {
    pub volume_id: String,
    pub title: String,
    pub arc_type: Option<String>,
    pub chapter_start: Option<i64>,
    pub chapter_end: Option<i64>,
    pub goal: Option<String>,
}

#[tauri::command]
pub fn create_arc(db: State<'_, DbState>, input: CreateArcInput) -> Result<ArcInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = uuid::Uuid::new_v4().to_string();
    let arc_type = input.arc_type.unwrap_or_else(|| "character".to_string());

    let next_priority: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(priority), 0) + 1 FROM arcs WHERE volume_id = ?1",
            [&input.volume_id],
            |r| r.get(0),
        )
        .unwrap_or(1);

    conn.execute(
        "INSERT INTO arcs (id, project_id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9)",
        rusqlite::params![id, project_id, input.volume_id, arc_type, input.title, input.chapter_start, input.chapter_end, input.goal, next_priority],
    )
    .map_err(|e| e.to_string())?;

    Ok(ArcInfo {
        id,
        volume_id: Some(input.volume_id),
        arc_type,
        title: Some(input.title),
        chapter_start: input.chapter_start,
        chapter_end: input.chapter_end,
        goal: input.goal,
        status: Some("active".to_string()),
        priority: Some(next_priority),
    })
}

// --- OUT-007: Outline revision impact analysis ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlineImpactReport {
    pub affected_volumes: Vec<i64>,
    pub affected_chapters: Vec<i64>,
    pub affected_characters: Vec<String>,
    pub affected_foreshadows: Vec<String>,
    pub risk_level: String,
    pub suggestions: Vec<String>,
}

#[tauri::command]
pub fn analyze_outline_impact(
    db: State<'_, DbState>,
    volume_id: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<OutlineImpactReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let (start, end) = if let Some(vid) = &volume_id {
        let (s, e): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT chapter_start, chapter_end FROM volumes WHERE id = ?1",
                [vid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        (s.unwrap_or(1), e.unwrap_or(1))
    } else {
        (chapter_start.unwrap_or(1), chapter_end.unwrap_or(1))
    };

    let mut stmt = conn.prepare(
        "SELECT chapter_number FROM chapters WHERE chapter_number BETWEEN ?1 AND ?2 ORDER BY chapter_number"
    ).map_err(|e| e.to_string())?;
    let affected_chapters: Vec<i64> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT volume_number FROM volumes WHERE chapter_end >= ?1 AND chapter_start <= ?2",
        )
        .map_err(|e| e.to_string())?;
    let affected_volumes: Vec<i64> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT c.name FROM characters c JOIN character_states cs ON cs.character_id = c.id WHERE cs.chapter_from BETWEEN ?1 AND ?2"
    ).map_err(|e| e.to_string())?;
    let affected_characters: Vec<String> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT title FROM foreshadow_items WHERE seed_chapter BETWEEN ?1 AND ?2 OR (resolved_chapter BETWEEN ?1 AND ?2)"
    ).map_err(|e| e.to_string())?;
    let affected_foreshadows: Vec<String> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let finalized_in_range: i64 = conn.query_row(
        "SELECT COUNT(*) FROM chapters WHERE chapter_number BETWEEN ?1 AND ?2 AND status IN ('finalized','approved')",
        [start, end], |r| r.get(0),
    ).unwrap_or(0);

    let risk_level = if finalized_in_range > 5 {
        "high"
    } else if finalized_in_range > 2 {
        "medium"
    } else {
        "low"
    };
    let mut suggestions = Vec::new();
    if finalized_in_range > 0 {
        suggestions.push(format!(
            "{}章已定稿，修改后需要重新审阅",
            finalized_in_range
        ));
    }
    if affected_foreshadows.len() > 3 {
        suggestions.push("修改范围内包含多个伏笔，需检查连续性".to_string());
    }

    Ok(OutlineImpactReport {
        affected_volumes,
        affected_chapters,
        affected_characters,
        affected_foreshadows,
        risk_level: risk_level.to_string(),
        suggestions,
    })
}

// --- Event Nodes ---

#[derive(Debug, Serialize, Deserialize)]
pub struct EventNodeInfo {
    pub id: String,
    pub arc_id: Option<String>,
    pub chapter_number: Option<i64>,
    pub event_type: Option<String>,
    pub summary: String,
    pub cause_refs: Option<String>,
    pub effect_refs: Option<String>,
    pub participants: Option<String>,
    pub impact_scope: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn list_event_nodes(
    db: State<'_, DbState>,
    arc_id: Option<String>,
) -> Result<Vec<EventNodeInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn.prepare(
        "SELECT id, arc_id, chapter_number, event_type, summary, cause_refs, effect_refs, participants, impact_scope, status FROM event_nodes WHERE (?1 IS NULL OR arc_id = ?1) ORDER BY chapter_number"
    ).map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![arc_id], |row| {
            Ok(EventNodeInfo {
                id: row.get(0)?,
                arc_id: row.get(1)?,
                chapter_number: row.get(2)?,
                event_type: row.get(3)?,
                summary: row.get(4)?,
                cause_refs: row.get(5)?,
                effect_refs: row.get(6)?,
                participants: row.get(7)?,
                impact_scope: row.get(8)?,
                status: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}
