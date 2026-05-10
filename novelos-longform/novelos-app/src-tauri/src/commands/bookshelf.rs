use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct BookshelfItem {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub genre_name: Option<String>,
    pub status: String,
    pub display_order: i64,
    pub cover_image: Option<String>,
    pub last_opened_at: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn list_bookshelf(db: State<'_, DbState>) -> Result<Vec<BookshelfItem>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, genre_name, status, display_order, cover_image, last_opened_at, created_at FROM bookshelf ORDER BY display_order",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(BookshelfItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                genre_name: row.get(3)?,
                status: row.get(4)?,
                display_order: row.get(5)?,
                cover_image: row.get(6)?,
                last_opened_at: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn add_to_bookshelf(
    db: State<'_, DbState>,
    project_id: String,
    title: String,
    genre_name: Option<String>,
    status: Option<String>,
) -> Result<String, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(display_order), 0) FROM bookshelf",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let st = status.unwrap_or_else(|| "planning".to_string());

    conn.execute(
        "INSERT INTO bookshelf (id, project_id, title, genre_name, status, display_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, project_id, title, genre_name, st, max_order + 1, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn remove_from_bookshelf(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookshelf WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_bookshelf_item(
    db: State<'_, DbState>,
    project_id: String,
    title: Option<String>,
    genre_name: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;

    if let Some(t) = title {
        conn.execute(
            "UPDATE bookshelf SET title = ?1 WHERE project_id = ?2",
            rusqlite::params![t, project_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(g) = genre_name {
        conn.execute(
            "UPDATE bookshelf SET genre_name = ?1 WHERE project_id = ?2",
            rusqlite::params![g, project_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(s) = status {
        conn.execute(
            "UPDATE bookshelf SET status = ?1 WHERE project_id = ?2",
            rusqlite::params![s, project_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn reorder_bookshelf(db: State<'_, DbState>, ordered_ids: Vec<String>) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;

    for (i, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE bookshelf SET display_order = ?1 WHERE id = ?2",
            rusqlite::params![(i + 1) as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ─── De-AI Rules (global) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct DeAiRuleInfo {
    pub id: String,
    pub category: String,
    pub pattern: String,
    pub replacement: Option<String>,
    pub severity: String,
    pub is_enabled: bool,
    pub description: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn list_de_ai_rules(db: State<'_, DbState>) -> Result<Vec<DeAiRuleInfo>, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut stmt = global_conn
        .prepare("SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules ORDER BY category, severity")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(DeAiRuleInfo {
                id: row.get(0)?,
                category: row.get(1)?,
                pattern: row.get(2)?,
                replacement: row.get(3)?,
                severity: row.get(4)?,
                is_enabled: row.get::<_, i64>(5)? != 0,
                description: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_de_ai_rule(
    db: State<'_, DbState>,
    input: UpsertDeAiRuleInput,
) -> Result<DeAiRuleInfo, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let existing: Option<String> = global_conn
        .query_row("SELECT id FROM de_ai_rules WHERE id = ?1", [&id], |r| {
            r.get(0)
        })
        .ok();
    let enabled = if input.is_enabled.unwrap_or(true) {
        1i64
    } else {
        0i64
    };

    if existing.is_some() {
        global_conn.execute(
            "UPDATE de_ai_rules SET category=?1, pattern=?2, replacement=?3, severity=?4, is_enabled=?5, description=?6 WHERE id=?7",
            rusqlite::params![input.category, input.pattern, input.replacement, input.severity, enabled, input.description, id],
        ).map_err(|e| e.to_string())?;
    } else {
        global_conn.execute(
            "INSERT INTO de_ai_rules (id, category, pattern, replacement, severity, is_enabled, description, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![id, input.category, input.pattern, input.replacement, input.severity, enabled, input.description, now],
        ).map_err(|e| e.to_string())?;
    }

    get_de_ai_rule_inner(&global_conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertDeAiRuleInput {
    pub id: Option<String>,
    pub category: String,
    pub pattern: String,
    pub replacement: Option<String>,
    pub severity: Option<String>,
    pub is_enabled: Option<bool>,
    pub description: Option<String>,
}

fn get_de_ai_rule_inner(conn: &rusqlite::Connection, id: &str) -> Result<DeAiRuleInfo, String> {
    conn.query_row(
        "SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules WHERE id = ?1",
        [id],
        |row| Ok(DeAiRuleInfo {
            id: row.get(0)?, category: row.get(1)?, pattern: row.get(2)?,
            replacement: row.get(3)?, severity: row.get(4)?,
            is_enabled: row.get::<_, i64>(5)? != 0, description: row.get(6)?,
            created_at: row.get(7)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_de_ai_rule(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    global_conn
        .execute("DELETE FROM de_ai_rules WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── SOUL Templates (global) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct SoulTemplateInfo {
    pub id: String,
    pub soul_name: String,
    pub category: String,
    pub genre_compat: Option<String>,
    pub personality_json: String,
    pub speech_json: String,
    pub behavior_json: String,
    pub relationships_json: Option<String>,
    pub is_builtin: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn list_soul_templates(
    db: State<'_, DbState>,
    category: Option<String>,
) -> Result<Vec<SoulTemplateInfo>, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    if let Some(ref cat) = category {
        let mut stmt = global_conn.prepare("SELECT id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at FROM soul_templates WHERE category = ?1 ORDER BY soul_name").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([cat], |row| {
                Ok(SoulTemplateInfo {
                    id: row.get(0)?,
                    soul_name: row.get(1)?,
                    category: row.get(2)?,
                    genre_compat: row.get(3)?,
                    personality_json: row.get(4)?,
                    speech_json: row.get(5)?,
                    behavior_json: row.get(6)?,
                    relationships_json: row.get(7)?,
                    is_builtin: row.get::<_, i64>(8)? != 0,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = global_conn.prepare("SELECT id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at FROM soul_templates ORDER BY category, soul_name").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SoulTemplateInfo {
                    id: row.get(0)?,
                    soul_name: row.get(1)?,
                    category: row.get(2)?,
                    genre_compat: row.get(3)?,
                    personality_json: row.get(4)?,
                    speech_json: row.get(5)?,
                    behavior_json: row.get(6)?,
                    relationships_json: row.get(7)?,
                    is_builtin: row.get::<_, i64>(8)? != 0,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(items)
}

// ─── Genre Templates (global) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct GenreTemplateInfo {
    pub id: String,
    pub genre_id: String,
    pub genre_name: String,
    pub world_framework: Option<String>,
    pub volume_rhythm: Option<String>,
    pub character_archetypes: Option<String>,
    pub thrill_params: Option<String>,
    pub taboo_rules: Option<String>,
    pub naming_style: Option<String>,
    pub naming_examples: Option<String>,
}

#[tauri::command]
pub fn list_genre_templates(db: State<'_, DbState>) -> Result<Vec<GenreTemplateInfo>, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut stmt = global_conn.prepare(
        "SELECT id, genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, naming_style, naming_examples FROM genre_templates ORDER BY genre_name"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(GenreTemplateInfo {
                id: row.get(0)?,
                genre_id: row.get(1)?,
                genre_name: row.get(2)?,
                world_framework: row.get(3)?,
                volume_rhythm: row.get(4)?,
                character_archetypes: row.get(5)?,
                thrill_params: row.get(6)?,
                taboo_rules: row.get(7)?,
                naming_style: row.get(8)?,
                naming_examples: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}
