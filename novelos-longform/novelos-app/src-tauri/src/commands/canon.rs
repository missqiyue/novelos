use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct CanonRuleInfo {
    pub id: String,
    pub rule_key: String,
    pub rule_name: String,
    pub rule_type: String,
    pub scope_type: String,
    pub scope_ref: Option<String>,
    pub content: String,
    pub is_hard: bool,
    pub status: String,
    pub version: i64,
    pub source_type: Option<String>,
    pub source_ref: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CanonRuleVersionInfo {
    pub id: String,
    pub canon_rule_id: String,
    pub version: i64,
    pub content: String,
    pub change_reason: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCanonRuleInput {
    pub rule_key: String,
    pub rule_name: String,
    pub rule_type: Option<String>,
    pub scope_type: String,
    pub scope_ref: Option<String>,
    pub content: String,
    pub is_hard: Option<bool>,
    pub source_type: Option<String>,
    pub source_ref: Option<String>,
}

#[tauri::command]
pub fn list_canon_rules(
    db: State<'_, DbState>,
    scope_type: Option<String>,
) -> Result<Vec<CanonRuleInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if scope_type.is_some() {
        "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE scope_type = ?1 ORDER BY created_at"
    } else {
        "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules ORDER BY created_at"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<CanonRuleInfo> {
        Ok(CanonRuleInfo {
            id: row.get(0)?,
            rule_key: row.get(1)?,
            rule_name: row.get(2)?,
            rule_type: row.get(3)?,
            scope_type: row.get(4)?,
            scope_ref: row.get(5)?,
            content: row.get(6)?,
            is_hard: row.get::<_, i64>(7)? != 0,
            status: row.get(8)?,
            version: row.get(9)?,
            source_type: row.get(10)?,
            source_ref: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    };

    let items = if let Some(st) = scope_type {
        stmt.query_map([&st], map_row)
    } else {
        stmt.query_map([], map_row)
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn create_canon_rule(
    db: State<'_, DbState>,
    input: CreateCanonRuleInput,
) -> Result<CanonRuleInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();
    let rule_type = input.rule_type.unwrap_or_else(|| "soft_rule".to_string());
    let is_hard = input.is_hard.unwrap_or(false) as i64;

    crate::db::transactions::create_canon_rule_transaction(
        conn,
        &project_id,
        &id,
        &input.rule_key,
        &input.rule_name,
        &rule_type,
        &input.scope_type,
        input.scope_ref.as_deref(),
        &input.content,
        is_hard,
        input.source_type.as_deref(),
        input.source_ref.as_deref(),
        &now,
    )?;

    get_canon_rule_inner(conn, &id)
}

#[tauri::command]
pub fn get_canon_rule(db: State<'_, DbState>, id: String) -> Result<CanonRuleInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    get_canon_rule_inner(conn, &id)
}

fn get_canon_rule_inner(conn: &rusqlite::Connection, id: &str) -> Result<CanonRuleInfo, String> {
    conn.query_row(
        "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE id = ?1",
        [id],
        |row| Ok(CanonRuleInfo {
            id: row.get(0)?,
            rule_key: row.get(1)?,
            rule_name: row.get(2)?,
            rule_type: row.get(3)?,
            scope_type: row.get(4)?,
            scope_ref: row.get(5)?,
            content: row.get(6)?,
            is_hard: row.get::<_, i64>(7)? != 0,
            status: row.get(8)?,
            version: row.get(9)?,
            source_type: row.get(10)?,
            source_ref: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_canon_rule(
    db: State<'_, DbState>,
    id: String,
    content: Option<String>,
    rule_name: Option<String>,
    status: Option<String>,
    is_hard: Option<bool>,
    change_reason: Option<String>,
) -> Result<CanonRuleInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(c) = &content {
        crate::db::transactions::update_canon_with_version(
            conn,
            &id,
            c,
            change_reason.as_deref(),
            &now,
        )?;
    }

    if let Some(n) = &rule_name {
        conn.execute(
            "UPDATE canon_rules SET rule_name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![n, now, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(s) = &status {
        conn.execute(
            "UPDATE canon_rules SET status = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![s, now, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(h) = is_hard {
        conn.execute(
            "UPDATE canon_rules SET is_hard = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![h as i64, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    get_canon_rule_inner(conn, &id)
}

#[tauri::command]
pub fn delete_canon_rule(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    crate::db::transactions::delete_canon_rule_transaction(conn, &id)
}

#[tauri::command]
pub fn list_canon_rule_versions(
    db: State<'_, DbState>,
    canon_rule_id: String,
) -> Result<Vec<CanonRuleVersionInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT id, canon_rule_id, version, content, change_reason, created_by, created_at FROM canon_rule_versions WHERE canon_rule_id = ?1 ORDER BY version DESC")
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([&canon_rule_id], |row| {
            Ok(CanonRuleVersionInfo {
                id: row.get(0)?,
                canon_rule_id: row.get(1)?,
                version: row.get(2)?,
                content: row.get(3)?,
                change_reason: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub fn search_canon_rules(
    db: State<'_, DbState>,
    query: String,
) -> Result<Vec<CanonRuleInfo>, String> {
    if query.trim().is_empty() {
        return list_canon_rules(db, None);
    }

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let search_term = format!("%{}%", query.trim());
    let mut stmt = conn
        .prepare(
            "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE rule_name LIKE ?1 OR content LIKE ?1 OR rule_key LIKE ?1 ORDER BY is_hard DESC, rule_name"
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([&search_term], |row| {
            Ok(CanonRuleInfo {
                id: row.get(0)?,
                rule_key: row.get(1)?,
                rule_name: row.get(2)?,
                rule_type: row.get(3)?,
                scope_type: row.get(4)?,
                scope_ref: row.get(5)?,
                content: row.get(6)?,
                is_hard: row.get::<_, i64>(7)? != 0,
                status: row.get(8)?,
                version: row.get(9)?,
                source_type: row.get(10)?,
                source_ref: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}
