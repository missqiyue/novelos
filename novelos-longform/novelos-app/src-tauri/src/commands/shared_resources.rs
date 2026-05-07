use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── SHF-005: Global Shared Resources ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleProfileInfo {
    pub id: String,
    pub name: String,
    pub metrics: String,
    pub preferred_patterns: String,
    pub anti_ai_features: String,
    pub sample_paragraphs: String,
    pub banned_patterns: String,
    pub is_builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritingPatternInfo {
    pub id: String,
    pub source_type: String,
    pub source_ref: Option<String>,
    pub pattern_name: String,
    pub genre_compat: Option<String>,
    pub description: String,
    pub usage_guide: Option<String>,
    pub sample_text: Option<String>,
    pub created_at: String,
}

/// List all style profiles from the global DB.
#[tauri::command]
pub fn list_style_profiles(db: State<'_, DbState>) -> Result<Vec<StyleProfileInfo>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at FROM style_profiles ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(StyleProfileInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                metrics: row.get(2)?,
                preferred_patterns: row.get(3)?,
                anti_ai_features: row.get(4)?,
                sample_paragraphs: row.get(5)?,
                banned_patterns: row.get(6)?,
                is_builtin: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

/// List all writing patterns from the global DB.
#[tauri::command]
pub fn list_writing_patterns(
    db: State<'_, DbState>,
    source_type: Option<String>,
) -> Result<Vec<WritingPatternInfo>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let mut items = Vec::new();

    if let Some(ref st) = source_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at FROM writing_patterns WHERE source_type = ?1 ORDER BY pattern_name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([st], |row| {
                Ok(WritingPatternInfo {
                    id: row.get(0)?,
                    source_type: row.get(1)?,
                    source_ref: row.get(2)?,
                    pattern_name: row.get(3)?,
                    genre_compat: row.get(4)?,
                    description: row.get(5)?,
                    usage_guide: row.get(6)?,
                    sample_text: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at FROM writing_patterns ORDER BY source_type, pattern_name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(WritingPatternInfo {
                    id: row.get(0)?,
                    source_type: row.get(1)?,
                    source_ref: row.get(2)?,
                    pattern_name: row.get(3)?,
                    genre_compat: row.get(4)?,
                    description: row.get(5)?,
                    usage_guide: row.get(6)?,
                    sample_text: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(items)
}

/// Upsert a style profile in the global DB.
#[tauri::command]
pub fn upsert_style_profile(db: State<'_, DbState>, input: UpsertStyleProfileInput) -> Result<StyleProfileInfo, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let existing: Option<String> = conn
        .query_row("SELECT id FROM style_profiles WHERE id = ?1", [&id], |r| r.get(0))
        .ok();

    if existing.is_some() {
        conn.execute(
            "UPDATE style_profiles SET name=?1, metrics=?2, preferred_patterns=?3, anti_ai_features=?4, sample_paragraphs=?5, banned_patterns=?6, updated_at=?7 WHERE id=?8",
            rusqlite::params![input.name, input.metrics, input.preferred_patterns, input.anti_ai_features, input.sample_paragraphs, input.banned_patterns, now, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO style_profiles (id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9)",
            rusqlite::params![id, input.name, input.metrics, input.preferred_patterns, input.anti_ai_features, input.sample_paragraphs, input.banned_patterns, now, now],
        ).map_err(|e| e.to_string())?;
    }

    get_style_profile_inner(&conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertStyleProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub metrics: String,
    pub preferred_patterns: String,
    pub anti_ai_features: String,
    pub sample_paragraphs: String,
    pub banned_patterns: String,
}

fn get_style_profile_inner(conn: &rusqlite::Connection, id: &str) -> Result<StyleProfileInfo, String> {
    conn.query_row(
        "SELECT id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at FROM style_profiles WHERE id = ?1",
        [id],
        |row| Ok(StyleProfileInfo {
            id: row.get(0)?, name: row.get(1)?, metrics: row.get(2)?,
            preferred_patterns: row.get(3)?, anti_ai_features: row.get(4)?,
            sample_paragraphs: row.get(5)?, banned_patterns: row.get(6)?,
            is_builtin: row.get::<_, i64>(7)? != 0, created_at: row.get(8)?, updated_at: row.get(9)?,
        }),
    ).map_err(|e| e.to_string())
}

/// Delete a style profile from the global DB.
#[tauri::command]
pub fn delete_style_profile(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM style_profiles WHERE id = ?1 AND is_builtin = 0", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Apply-to-Project commands (SHF-005 core) ───

/// Apply a genre template's settings to the current project.
/// Copies key fields into the project's settings.
#[tauri::command]
pub fn apply_genre_template_to_project(
    db: State<'_, DbState>,
    template_id: String,
) -> Result<(), String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;

    let (genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, min_words, max_words, naming_style, naming_examples): (
        String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, Option<String>, Option<String>
    ) = global_conn.query_row(
        "SELECT genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, default_min_chapter_words, default_max_chapter_words, naming_style, naming_examples FROM genre_templates WHERE id = ?1",
        [&template_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?)),
    ).map_err(|e| format!("Genre template not found: {}", e))?;

    // Update the bookshelf entry with genre
    let project_id = db.current_project_id().unwrap_or_default();
    let _ = global_conn.execute(
        "UPDATE bookshelf SET genre_name = ?1 WHERE project_id = ?2",
        rusqlite::params![genre_name, project_id],
    );

    // Drop global lock before acquiring project lock
    drop(global_conn);

    // Write into project settings
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let upsert_setting = |conn: &rusqlite::Connection, pid: &str, key: &str, value: &str| -> Result<(), String> {
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM project_settings WHERE project_id = ?1 AND key = ?2",
            rusqlite::params![pid, key],
            |r| r.get(0),
        ).ok().flatten();

        if let Some(eid) = existing_id {
            conn.execute(
                "UPDATE project_settings SET value = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, now, eid],
            ).map_err(|e| e.to_string())?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![id, pid, key, value, now],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    };

    upsert_setting(conn, &project_id, "genre_id", &genre_id)?;
    upsert_setting(conn, &project_id, "genre_name", &genre_name)?;
    if let Some(ref wf) = world_framework { upsert_setting(conn, &project_id, "world_framework", wf)?; }
    if let Some(ref vr) = volume_rhythm { upsert_setting(conn, &project_id, "volume_rhythm", vr)?; }
    if let Some(ref ca) = character_archetypes { upsert_setting(conn, &project_id, "character_archetypes", ca)?; }
    if let Some(ref tp) = thrill_params { upsert_setting(conn, &project_id, "thrill_params", tp)?; }
    if let Some(ref tr) = taboo_rules { upsert_setting(conn, &project_id, "taboo_rules", tr)?; }
    upsert_setting(conn, &project_id, "min_chapter_words", &min_words.to_string())?;
    upsert_setting(conn, &project_id, "max_chapter_words", &max_words.to_string())?;
    if let Some(ref ns) = naming_style { upsert_setting(conn, &project_id, "naming_style", ns)?; }
    if let Some(ref ne) = naming_examples { upsert_setting(conn, &project_id, "naming_examples", ne)?; }

    Ok(())
}

/// Apply a style profile to the current project.
#[tauri::command]
pub fn apply_style_profile_to_project(
    db: State<'_, DbState>,
    profile_id: String,
) -> Result<(), String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;

    let (name, anti_ai_features, banned_patterns, preferred_patterns): (
        String, String, String, String,
    ) = global_conn.query_row(
        "SELECT name, anti_ai_features, banned_patterns, preferred_patterns FROM style_profiles WHERE id = ?1",
        [&profile_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| format!("Style profile not found: {}", e))?;

    drop(global_conn);

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    let upsert_setting = |conn: &rusqlite::Connection, pid: &str, key: &str, value: &str| -> Result<(), String> {
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM project_settings WHERE project_id = ?1 AND key = ?2",
            rusqlite::params![pid, key],
            |r| r.get(0),
        ).ok().flatten();

        if let Some(eid) = existing_id {
            conn.execute(
                "UPDATE project_settings SET value = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![value, now, eid],
            ).map_err(|e| e.to_string())?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![id, pid, key, value, now],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    };

    upsert_setting(conn, &project_id, "style_profile_name", &name)?;
    upsert_setting(conn, &project_id, "anti_ai_features", &anti_ai_features)?;
    upsert_setting(conn, &project_id, "banned_patterns", &banned_patterns)?;
    upsert_setting(conn, &project_id, "preferred_patterns", &preferred_patterns)?;

    Ok(())
}

/// Import de-AI rules from the global library into the current project.
/// Stores the imported rules as a JSON setting in project_settings.
#[tauri::command]
pub fn import_deai_rules_to_project(
    db: State<'_, DbState>,
    rule_ids: Vec<String>,
) -> Result<u32, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;

    let mut rules_to_import = Vec::new();
    for rid in &rule_ids {
        let rule: Option<(String, String, String, Option<String>, String, Option<String>)> = global_conn
            .query_row(
                "SELECT id, category, pattern, replacement, severity, description FROM de_ai_rules WHERE id = ?1",
                [rid],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .ok();
        if let Some(r) = rule {
            rules_to_import.push(r);
        }
    }

    drop(global_conn);

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // Store imported rules as JSON in project_settings
    let json = serde_json::to_string(&rules_to_import).unwrap_or_default();

    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM project_settings WHERE project_id = ?1 AND key = ?2",
        rusqlite::params![project_id, "imported_deai_rules"],
        |r| r.get(0),
    ).ok().flatten();

    if let Some(eid) = existing_id {
        conn.execute(
            "UPDATE project_settings SET value = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![json, now, eid],
        ).map_err(|e| e.to_string())?;
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, project_id, "imported_deai_rules", json, now],
        ).map_err(|e| e.to_string())?;
    }

    Ok(rules_to_import.len() as u32)
}

/// Get a unified overview of all global shared resources.
#[tauri::command]
pub fn list_global_resources(db: State<'_, DbState>) -> Result<GlobalResourcesOverview, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;

    let genre_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM genre_templates", [], |r| r.get(0))
        .unwrap_or(0);
    let style_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM style_profiles", [], |r| r.get(0))
        .unwrap_or(0);
    let deai_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM de_ai_rules WHERE is_enabled = 1", [], |r| r.get(0))
        .unwrap_or(0);
    let soul_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM soul_templates", [], |r| r.get(0))
        .unwrap_or(0);
    let pattern_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM writing_patterns", [], |r| r.get(0))
        .unwrap_or(0);
    let banned_names_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM banned_names", [], |r| r.get(0))
        .unwrap_or(0);
    let banned_titles_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM banned_book_titles", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(GlobalResourcesOverview {
        genre_templates: genre_count as u32,
        style_profiles: style_count as u32,
        de_ai_rules: deai_count as u32,
        soul_templates: soul_count as u32,
        writing_patterns: pattern_count as u32,
        banned_names: banned_names_count as u32,
        banned_titles: banned_titles_count as u32,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GlobalResourcesOverview {
    pub genre_templates: u32,
    pub style_profiles: u32,
    pub de_ai_rules: u32,
    pub soul_templates: u32,
    pub writing_patterns: u32,
    pub banned_names: u32,
    pub banned_titles: u32,
}

// ─── Editor Preferences ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorPrefs {
    pub font_family: Option<String>,
    pub font_size: Option<u32>,
    pub line_spacing: Option<f32>,
    pub paragraph_spacing: Option<f32>,
    pub margin_width: Option<String>,
}

impl Default for EditorPrefs {
    fn default() -> Self {
        Self {
            font_family: None,
            font_size: None,
            line_spacing: None,
            paragraph_spacing: None,
            margin_width: None,
        }
    }
}

#[tauri::command]
pub fn get_editor_prefs(db: State<'_, DbState>) -> Result<EditorPrefs, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM project_settings WHERE project_id = ?1 AND key = 'editor_prefs'",
            rusqlite::params![project_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();

    match value {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(EditorPrefs::default()),
    }
}

#[tauri::command]
pub fn set_editor_prefs(db: State<'_, DbState>, prefs: EditorPrefs) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let json = serde_json::to_string(&prefs).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM project_settings WHERE project_id = ?1 AND key = ?2",
            rusqlite::params![project_id, "editor_prefs"],
            |r| r.get(0),
        )
        .ok()
        .flatten();

    if let Some(eid) = existing_id {
        conn.execute(
            "UPDATE project_settings SET value = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![json, now, eid],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, project_id, "editor_prefs", json, now],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
