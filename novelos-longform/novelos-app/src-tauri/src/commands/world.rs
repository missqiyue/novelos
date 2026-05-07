use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── Location ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationInfo {
    pub id: String,
    pub name: String,
    pub location_type: Option<String>,
    pub owner_faction_id: Option<String>,
    pub danger_level: Option<i32>,
    pub status: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLocationInput {
    pub name: String,
    pub location_type: Option<String>,
    pub owner_faction_id: Option<String>,
    pub danger_level: Option<i32>,
    pub status: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLocationInput {
    pub id: String,
    pub name: Option<String>,
    pub location_type: Option<String>,
    pub owner_faction_id: Option<String>,
    pub danger_level: Option<i32>,
    pub status: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub fn list_locations(db: State<'_, DbState>) -> Result<Vec<LocationInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT id, name, location_type, owner_faction_id, danger_level, status, description FROM locations WHERE project_id = ?1 ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(LocationInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                location_type: row.get(2)?,
                owner_faction_id: row.get(3)?,
                danger_level: row.get(4)?,
                status: row.get(5)?,
                description: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn create_location(db: State<'_, DbState>, input: CreateLocationInput) -> Result<LocationInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO locations (id, project_id, name, location_type, owner_faction_id, danger_level, status, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id,
            project_id,
            input.name,
            input.location_type,
            input.owner_faction_id,
            input.danger_level,
            input.status,
            input.description,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(LocationInfo {
        id,
        name: input.name,
        location_type: input.location_type,
        owner_faction_id: input.owner_faction_id,
        danger_level: input.danger_level,
        status: input.status,
        description: input.description,
    })
}

#[tauri::command]
pub fn update_location(db: State<'_, DbState>, input: UpdateLocationInput) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let current: LocationInfo = conn
        .query_row(
            "SELECT id, name, location_type, owner_faction_id, danger_level, status, description FROM locations WHERE id = ?1",
            rusqlite::params![input.id],
            |row| {
                Ok(LocationInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    location_type: row.get(2)?,
                    owner_faction_id: row.get(3)?,
                    danger_level: row.get(4)?,
                    status: row.get(5)?,
                    description: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE locations SET name = ?1, location_type = ?2, owner_faction_id = ?3, danger_level = ?4, status = ?5, description = ?6 WHERE id = ?7",
        rusqlite::params![
            input.name.unwrap_or(current.name),
            input.location_type.or(current.location_type),
            input.owner_faction_id.or(current.owner_faction_id),
            input.danger_level.or(current.danger_level),
            input.status.or(current.status),
            input.description.or(current.description),
            input.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_location(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute("DELETE FROM locations WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Faction ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactionInfo {
    pub id: String,
    pub name: String,
    pub faction_type: Option<String>,
    pub goal: Option<String>,
    pub resource_summary: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFactionInput {
    pub name: String,
    pub faction_type: Option<String>,
    pub goal: Option<String>,
    pub resource_summary: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFactionInput {
    pub id: String,
    pub name: Option<String>,
    pub faction_type: Option<String>,
    pub goal: Option<String>,
    pub resource_summary: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn list_factions(db: State<'_, DbState>) -> Result<Vec<FactionInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT id, name, faction_type, goal, resource_summary, status FROM factions WHERE project_id = ?1 ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(FactionInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                faction_type: row.get(2)?,
                goal: row.get(3)?,
                resource_summary: row.get(4)?,
                status: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn create_faction(db: State<'_, DbState>, input: CreateFactionInput) -> Result<FactionInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO factions (id, project_id, name, faction_type, goal, resource_summary, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            project_id,
            input.name,
            input.faction_type,
            input.goal,
            input.resource_summary,
            input.status,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(FactionInfo {
        id,
        name: input.name,
        faction_type: input.faction_type,
        goal: input.goal,
        resource_summary: input.resource_summary,
        status: input.status,
    })
}

#[tauri::command]
pub fn update_faction(db: State<'_, DbState>, input: UpdateFactionInput) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let current: FactionInfo = conn
        .query_row(
            "SELECT id, name, faction_type, goal, resource_summary, status FROM factions WHERE id = ?1",
            rusqlite::params![input.id],
            |row| {
                Ok(FactionInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    faction_type: row.get(2)?,
                    goal: row.get(3)?,
                    resource_summary: row.get(4)?,
                    status: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE factions SET name = ?1, faction_type = ?2, goal = ?3, resource_summary = ?4, status = ?5 WHERE id = ?6",
        rusqlite::params![
            input.name.unwrap_or(current.name),
            input.faction_type.or(current.faction_type),
            input.goal.or(current.goal),
            input.resource_summary.or(current.resource_summary),
            input.status.or(current.status),
            input.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_faction(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute("DELETE FROM factions WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Collision Check ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollisionItem {
    pub id: String,
    pub item_type: String, // "name" or "title"
    pub text: String,
    pub reason: String,
    pub severity: String, // "high", "medium", "low"
}

#[tauri::command]
pub fn check_collisions(db: State<'_, DbState>, query: String) -> Result<Vec<CollisionItem>, String> {
    let global_conn = db.global.lock().map_err(|e| e.to_string())?;
    let conn = &*global_conn;

    let pattern = format!("%{}%", query);
    let mut results = Vec::new();

    // Check banned_names
    let mut stmt = conn
        .prepare(
            "SELECT id, name, source_work, ban_level FROM banned_names WHERE name LIKE ?1",
        )
        .map_err(|e| e.to_string())?;

    let name_rows = stmt
        .query_map(rusqlite::params![pattern], |row| {
            let ban_level: String = row.get(3)?;
            let severity = match ban_level.as_str() {
                "hard_ban" => "high",
                "soft_warn" => "medium",
                _ => "low",
            };
            Ok(CollisionItem {
                id: row.get(0)?,
                item_type: "name".to_string(),
                text: row.get(1)?,
                reason: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                severity: severity.to_string(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    results.extend(name_rows);

    // Check banned_book_titles
    let mut stmt = conn
        .prepare(
            "SELECT id, title, source_platform, ban_level FROM banned_book_titles WHERE title LIKE ?1",
        )
        .map_err(|e| e.to_string())?;

    let title_rows = stmt
        .query_map(rusqlite::params![pattern], |row| {
            let ban_level: String = row.get(3)?;
            let severity = match ban_level.as_str() {
                "hard_ban" => "high",
                "soft_warn" => "medium",
                _ => "low",
            };
            Ok(CollisionItem {
                id: row.get(0)?,
                item_type: "title".to_string(),
                text: row.get(1)?,
                reason: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                severity: severity.to_string(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    results.extend(title_rows);

    Ok(results)
}
