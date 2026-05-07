use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── Character State (LDG-002) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterStateInfo {
    pub id: String,
    pub character_id: String,
    pub snapshot_id: Option<String>,
    pub chapter_from: Option<i64>,
    pub chapter_to: Option<i64>,
    pub level_state: Option<String>,
    pub physical_state: Option<String>,
    pub emotion_state: Option<String>,
    pub goal_state: Option<String>,
    pub location_id: Option<String>,
    pub resource_state: Option<String>,
    pub known_info: Option<String>,
    pub secret_info: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn list_character_states(db: State<'_, DbState>, character_id: Option<String>) -> Result<Vec<CharacterStateInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if character_id.is_some() {
        "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states WHERE character_id = ?1 ORDER BY chapter_from"
    } else {
        "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states ORDER BY chapter_from"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<CharacterStateInfo> {
        Ok(CharacterStateInfo {
            id: row.get(0)?, character_id: row.get(1)?, snapshot_id: row.get(2)?,
            chapter_from: row.get(3)?, chapter_to: row.get(4)?, level_state: row.get(5)?,
            physical_state: row.get(6)?, emotion_state: row.get(7)?, goal_state: row.get(8)?,
            location_id: row.get(9)?, resource_state: row.get(10)?, known_info: row.get(11)?,
            secret_info: row.get(12)?, created_at: row.get(13)?,
        })
    };

    let items = if let Some(ref cid) = character_id {
        stmt.query_map([cid], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_character_state(db: State<'_, DbState>, input: UpsertCharacterStateInput) -> Result<CharacterStateInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // Check if state exists for this character+chapter combination
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM character_states WHERE character_id = ?1 AND chapter_from = ?2",
            rusqlite::params![input.character_id, input.chapter_from],
            |r| r.get(0),
        ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE character_states SET level_state=?1, physical_state=?2, emotion_state=?3, goal_state=?4, location_id=?5, resource_state=?6, known_info=?7, secret_info=?8, chapter_to=?9 WHERE id=?10",
            rusqlite::params![input.level_state, input.physical_state, input.emotion_state, input.goal_state, input.location_id, input.resource_state, input.known_info, input.secret_info, input.chapter_to, id],
        ).map_err(|e| e.to_string())?;
        get_character_state_inner(conn, &id)
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO character_states (id, project_id, character_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            rusqlite::params![id, project_id, input.character_id, input.chapter_from, input.chapter_to, input.level_state, input.physical_state, input.emotion_state, input.goal_state, input.location_id, input.resource_state, input.known_info, input.secret_info, now],
        ).map_err(|e| e.to_string())?;
        get_character_state_inner(conn, &id)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertCharacterStateInput {
    pub character_id: String,
    pub chapter_from: Option<i64>,
    pub chapter_to: Option<i64>,
    pub level_state: Option<String>,
    pub physical_state: Option<String>,
    pub emotion_state: Option<String>,
    pub goal_state: Option<String>,
    pub location_id: Option<String>,
    pub resource_state: Option<String>,
    pub known_info: Option<String>,
    pub secret_info: Option<String>,
}

fn get_character_state_inner(conn: &rusqlite::Connection, id: &str) -> Result<CharacterStateInfo, String> {
    conn.query_row("SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states WHERE id = ?1", [id], |row| {
        Ok(CharacterStateInfo {
            id: row.get(0)?, character_id: row.get(1)?, snapshot_id: row.get(2)?,
            chapter_from: row.get(3)?, chapter_to: row.get(4)?, level_state: row.get(5)?,
            physical_state: row.get(6)?, emotion_state: row.get(7)?, goal_state: row.get(8)?,
            location_id: row.get(9)?, resource_state: row.get(10)?, known_info: row.get(11)?,
            secret_info: row.get(12)?, created_at: row.get(13)?,
        })
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_character_state(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute("DELETE FROM character_states WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Relationship States (LDG-003) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct RelationshipStateInfo {
    pub id: String,
    pub source_character_id: String,
    pub target_character_id: String,
    pub relation_type: String,
    pub strength: Option<i64>,
    pub trust_score: Option<i64>,
    pub conflict_score: Option<i64>,
    pub chapter_from: Option<i64>,
    pub chapter_to: Option<i64>,
    pub trigger_event_id: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn list_relationship_states(db: State<'_, DbState>, character_id: Option<String>) -> Result<Vec<RelationshipStateInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if character_id.is_some() {
        "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states WHERE source_character_id = ?1 OR target_character_id = ?1 ORDER BY chapter_from"
    } else {
        "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states ORDER BY chapter_from"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<RelationshipStateInfo> {
        Ok(RelationshipStateInfo {
            id: row.get(0)?, source_character_id: row.get(1)?, target_character_id: row.get(2)?,
            relation_type: row.get(3)?, strength: row.get(4)?, trust_score: row.get(5)?,
            conflict_score: row.get(6)?, chapter_from: row.get(7)?, chapter_to: row.get(8)?,
            trigger_event_id: row.get(9)?, notes: row.get(10)?,
        })
    };

    let items = if let Some(ref cid) = character_id {
        stmt.query_map([cid], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_relationship_state(db: State<'_, DbState>, input: UpsertRelationshipInput) -> Result<RelationshipStateInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM relationship_states WHERE source_character_id = ?1 AND target_character_id = ?2",
            rusqlite::params![input.source_character_id, input.target_character_id],
            |r| r.get(0),
        ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE relationship_states SET relation_type=?1, strength=?2, trust_score=?3, conflict_score=?4, chapter_to=?5, notes=?6 WHERE id=?7",
            rusqlite::params![input.relation_type, input.strength, input.trust_score, input.conflict_score, input.chapter_to, input.notes, id],
        ).map_err(|e| e.to_string())?;
        get_relationship_inner(conn, &id)
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO relationship_states (id, project_id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![id, project_id, input.source_character_id, input.target_character_id, input.relation_type, input.strength, input.trust_score, input.conflict_score, input.chapter_from, input.chapter_to, input.trigger_event_id, input.notes],
        ).map_err(|e| e.to_string())?;
        get_relationship_inner(conn, &id)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertRelationshipInput {
    pub source_character_id: String,
    pub target_character_id: String,
    pub relation_type: String,
    pub strength: Option<i64>,
    pub trust_score: Option<i64>,
    pub conflict_score: Option<i64>,
    pub chapter_from: Option<i64>,
    pub chapter_to: Option<i64>,
    pub trigger_event_id: Option<String>,
    pub notes: Option<String>,
}

fn get_relationship_inner(conn: &rusqlite::Connection, id: &str) -> Result<RelationshipStateInfo, String> {
    conn.query_row("SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states WHERE id = ?1", [id], |row| {
        Ok(RelationshipStateInfo {
            id: row.get(0)?, source_character_id: row.get(1)?, target_character_id: row.get(2)?,
            relation_type: row.get(3)?, strength: row.get(4)?, trust_score: row.get(5)?,
            conflict_score: row.get(6)?, chapter_from: row.get(7)?, chapter_to: row.get(8)?,
            trigger_event_id: row.get(9)?, notes: row.get(10)?,
        })
    }).map_err(|e| e.to_string())
}

// ─── Timeline Nodes (LDG-004) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineNodeInfo {
    pub id: String,
    pub chapter_number: Option<i64>,
    pub world_date: Option<String>,
    pub relative_day: Option<i64>,
    pub location_id: Option<String>,
    pub summary: String,
    pub participants: Option<String>,
    pub dependencies: Option<String>,
}

#[tauri::command]
pub fn list_timeline_nodes(db: State<'_, DbState>, chapter_number: Option<i64>) -> Result<Vec<TimelineNodeInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if chapter_number.is_some() {
        "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes WHERE chapter_number = ?1 ORDER BY relative_day"
    } else {
        "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes ORDER BY relative_day, chapter_number"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<TimelineNodeInfo> {
        Ok(TimelineNodeInfo {
            id: row.get(0)?, chapter_number: row.get(1)?, world_date: row.get(2)?,
            relative_day: row.get(3)?, location_id: row.get(4)?, summary: row.get(5)?,
            participants: row.get(6)?, dependencies: row.get(7)?,
        })
    };

    let items = if let Some(cn) = chapter_number {
        stmt.query_map([cn], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_timeline_node(db: State<'_, DbState>, input: UpsertTimelineInput) -> Result<TimelineNodeInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT id FROM timeline_nodes WHERE id = ?1", [&id], |r| r.get(0)).ok();

    if existing.is_some() {
        conn.execute(
            "UPDATE timeline_nodes SET chapter_number=?1, world_date=?2, relative_day=?3, location_id=?4, summary=?5, participants=?6, dependencies=?7 WHERE id=?8",
            rusqlite::params![input.chapter_number, input.world_date, input.relative_day, input.location_id, input.summary, input.participants, input.dependencies, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO timeline_nodes (id, project_id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![id, project_id, input.chapter_number, input.world_date, input.relative_day, input.location_id, input.summary, input.participants, input.dependencies],
        ).map_err(|e| e.to_string())?;
    }
    get_timeline_node_inner(conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertTimelineInput {
    pub id: Option<String>,
    pub chapter_number: Option<i64>,
    pub world_date: Option<String>,
    pub relative_day: Option<i64>,
    pub location_id: Option<String>,
    pub summary: String,
    pub participants: Option<String>,
    pub dependencies: Option<String>,
}

fn get_timeline_node_inner(conn: &rusqlite::Connection, id: &str) -> Result<TimelineNodeInfo, String> {
    conn.query_row("SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes WHERE id = ?1", [id], |row| {
        Ok(TimelineNodeInfo {
            id: row.get(0)?, chapter_number: row.get(1)?, world_date: row.get(2)?,
            relative_day: row.get(3)?, location_id: row.get(4)?, summary: row.get(5)?,
            participants: row.get(6)?, dependencies: row.get(7)?,
        })
    }).map_err(|e| e.to_string())
}

// ─── Foreshadow Items (LDG-006) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct ForeshadowItemInfo {
    pub id: String,
    pub seed_chapter: i64,
    pub expected_volume_id: Option<String>,
    pub title: String,
    pub maturity_condition: Option<String>,
    pub payoff_type: Option<String>,
    pub status: String,
    pub resolved_chapter: Option<i64>,
    pub importance: Option<i64>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn list_foreshadow_items(db: State<'_, DbState>, status: Option<String>) -> Result<Vec<ForeshadowItemInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if status.is_some() {
        "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items WHERE status = ?1 ORDER BY seed_chapter"
    } else {
        "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items ORDER BY seed_chapter"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ForeshadowItemInfo> {
        Ok(ForeshadowItemInfo {
            id: row.get(0)?, seed_chapter: row.get(1)?, expected_volume_id: row.get(2)?,
            title: row.get(3)?, maturity_condition: row.get(4)?, payoff_type: row.get(5)?,
            status: row.get(6)?, resolved_chapter: row.get(7)?, importance: row.get(8)?,
            notes: row.get(9)?,
        })
    };

    let items = if let Some(ref st) = status {
        stmt.query_map([st], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_foreshadow_item(db: State<'_, DbState>, input: UpsertForeshadowInput) -> Result<ForeshadowItemInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT id FROM foreshadow_items WHERE id = ?1", [&id], |r| r.get(0)).ok();

    if existing.is_some() {
        conn.execute(
            "UPDATE foreshadow_items SET title=?1, maturity_condition=?2, payoff_type=?3, status=?4, resolved_chapter=?5, importance=?6, notes=?7 WHERE id=?8",
            rusqlite::params![input.title, input.maturity_condition, input.payoff_type, input.status, input.resolved_chapter, input.importance, input.notes, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO foreshadow_items (id, project_id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![id, project_id, input.seed_chapter, input.expected_volume_id, input.title, input.maturity_condition, input.payoff_type, input.status, input.resolved_chapter, input.importance, input.notes],
        ).map_err(|e| e.to_string())?;
    }
    get_foreshadow_inner(conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertForeshadowInput {
    pub id: Option<String>,
    pub seed_chapter: i64,
    pub expected_volume_id: Option<String>,
    pub title: String,
    pub maturity_condition: Option<String>,
    pub payoff_type: Option<String>,
    pub status: Option<String>,
    pub resolved_chapter: Option<i64>,
    pub importance: Option<i64>,
    pub notes: Option<String>,
}

fn get_foreshadow_inner(conn: &rusqlite::Connection, id: &str) -> Result<ForeshadowItemInfo, String> {
    conn.query_row("SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items WHERE id = ?1", [id], |row| {
        Ok(ForeshadowItemInfo {
            id: row.get(0)?, seed_chapter: row.get(1)?, expected_volume_id: row.get(2)?,
            title: row.get(3)?, maturity_condition: row.get(4)?, payoff_type: row.get(5)?,
            status: row.get(6)?, resolved_chapter: row.get(7)?, importance: row.get(8)?,
            notes: row.get(9)?,
        })
    }).map_err(|e| e.to_string())
}

// ─── Ability Items (LDG-008) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct AbilityItemInfo {
    pub id: String,
    pub item_type: String,
    pub name: String,
    pub owner_character_id: Option<String>,
    pub source_rule_id: Option<String>,
    pub cost_rule: Option<String>,
    pub cooldown_rule: Option<String>,
    pub limit_rule: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn list_ability_items(db: State<'_, DbState>, owner_id: Option<String>) -> Result<Vec<AbilityItemInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if owner_id.is_some() {
        "SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items WHERE owner_character_id = ?1 ORDER BY name"
    } else {
        "SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items ORDER BY item_type, name"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<AbilityItemInfo> {
        Ok(AbilityItemInfo {
            id: row.get(0)?, item_type: row.get(1)?, name: row.get(2)?,
            owner_character_id: row.get(3)?, source_rule_id: row.get(4)?,
            cost_rule: row.get(5)?, cooldown_rule: row.get(6)?, limit_rule: row.get(7)?,
            status: row.get(8)?,
        })
    };

    let items = if let Some(ref oid) = owner_id {
        stmt.query_map([oid], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_ability_item(db: State<'_, DbState>, input: UpsertAbilityInput) -> Result<AbilityItemInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT id FROM ability_items WHERE id = ?1", [&id], |r| r.get(0)).ok();

    if existing.is_some() {
        conn.execute(
            "UPDATE ability_items SET name=?1, owner_character_id=?2, source_rule_id=?3, cost_rule=?4, cooldown_rule=?5, limit_rule=?6, status=?7 WHERE id=?8",
            rusqlite::params![input.name, input.owner_character_id, input.source_rule_id, input.cost_rule, input.cooldown_rule, input.limit_rule, input.status, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO ability_items (id, project_id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            rusqlite::params![id, project_id, input.item_type, input.name, input.owner_character_id, input.source_rule_id, input.cost_rule, input.cooldown_rule, input.limit_rule, input.status],
        ).map_err(|e| e.to_string())?;
    }
    get_ability_inner(conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertAbilityInput {
    pub id: Option<String>,
    pub item_type: String,
    pub name: String,
    pub owner_character_id: Option<String>,
    pub source_rule_id: Option<String>,
    pub cost_rule: Option<String>,
    pub cooldown_rule: Option<String>,
    pub limit_rule: Option<String>,
    pub status: Option<String>,
}

fn get_ability_inner(conn: &rusqlite::Connection, id: &str) -> Result<AbilityItemInfo, String> {
    conn.query_row("SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items WHERE id = ?1", [id], |row| {
        Ok(AbilityItemInfo {
            id: row.get(0)?, item_type: row.get(1)?, name: row.get(2)?,
            owner_character_id: row.get(3)?, source_rule_id: row.get(4)?,
            cost_rule: row.get(5)?, cooldown_rule: row.get(6)?, limit_rule: row.get(7)?,
            status: row.get(8)?,
        })
    }).map_err(|e| e.to_string())
}

// ─── Knowledge Visibility (LDG-007) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeVisibilityInfo {
    pub id: String,
    pub knowledge_key: String,
    pub holder_type: String,
    pub holder_ref: String,
    pub visibility_state: String,
    pub chapter_acquired: Option<i64>,
    pub source_event_id: Option<String>,
}

#[tauri::command]
pub fn list_knowledge_visibility(db: State<'_, DbState>, holder_ref: Option<String>) -> Result<Vec<KnowledgeVisibilityInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if holder_ref.is_some() {
        "SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility WHERE holder_ref = ?1 ORDER BY chapter_acquired"
    } else {
        "SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility ORDER BY chapter_acquired, holder_ref"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<KnowledgeVisibilityInfo> {
        Ok(KnowledgeVisibilityInfo {
            id: row.get(0)?, knowledge_key: row.get(1)?, holder_type: row.get(2)?,
            holder_ref: row.get(3)?, visibility_state: row.get(4)?,
            chapter_acquired: row.get(5)?, source_event_id: row.get(6)?,
        })
    };

    let items = if let Some(ref hr) = holder_ref {
        stmt.query_map([hr], map_row)
    } else {
        stmt.query_map([], map_row)
    }.map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn upsert_knowledge_visibility(db: State<'_, DbState>, input: UpsertKnowledgeInput) -> Result<KnowledgeVisibilityInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT id FROM knowledge_visibility WHERE id = ?1", [&id], |r| r.get(0)).ok();

    if existing.is_some() {
        conn.execute(
            "UPDATE knowledge_visibility SET knowledge_key=?1, holder_type=?2, holder_ref=?3, visibility_state=?4, chapter_acquired=?5 WHERE id=?6",
            rusqlite::params![input.knowledge_key, input.holder_type, input.holder_ref, input.visibility_state, input.chapter_acquired, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO knowledge_visibility (id, project_id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![id, project_id, input.knowledge_key, input.holder_type, input.holder_ref, input.visibility_state, input.chapter_acquired, input.source_event_id],
        ).map_err(|e| e.to_string())?;
    }
    get_knowledge_visibility_inner(conn, &id)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertKnowledgeInput {
    pub id: Option<String>,
    pub knowledge_key: String,
    pub holder_type: String,
    pub holder_ref: String,
    pub visibility_state: String,
    pub chapter_acquired: Option<i64>,
    pub source_event_id: Option<String>,
}

fn get_knowledge_visibility_inner(conn: &rusqlite::Connection, id: &str) -> Result<KnowledgeVisibilityInfo, String> {
    conn.query_row("SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility WHERE id = ?1", [id], |row| {
        Ok(KnowledgeVisibilityInfo {
            id: row.get(0)?, knowledge_key: row.get(1)?, holder_type: row.get(2)?,
            holder_ref: row.get(3)?, visibility_state: row.get(4)?,
            chapter_acquired: row.get(5)?, source_event_id: row.get(6)?,
        })
    }).map_err(|e| e.to_string())
}

// ─── Notifications (NTF-001,002) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct NotificationInfo {
    pub id: String,
    pub notif_type: String,
    pub severity: String,
    pub message: String,
    pub related_entity: Option<String>,
    pub read_status: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn list_notifications(db: State<'_, DbState>, unread_only: Option<bool>) -> Result<Vec<NotificationInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let sql = if unread_only.unwrap_or(false) {
        "SELECT id, type, severity, message, related_entity_type, is_read, created_at FROM notifications WHERE is_read = 0 ORDER BY created_at DESC LIMIT 50"
    } else {
        "SELECT id, type, severity, message, related_entity_type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| Ok(NotificationInfo {
        id: row.get(0)?, notif_type: row.get(1)?, severity: row.get(2)?,
        message: row.get(3)?, related_entity: row.get(4)?,
        read_status: row.get::<_, i64>(5)? != 0, created_at: row.get(6)?,
    })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn create_notification(db: State<'_, DbState>, notif_type: String, severity: String, message: String, related_entity: Option<String>) -> Result<NotificationInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO notifications (id, project_id, type, severity, message, related_entity_type, is_read, created_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7)",
        rusqlite::params![id, project_id, notif_type, severity, message, related_entity, now],
    ).map_err(|e| e.to_string())?;

    Ok(NotificationInfo { id, notif_type, severity, message, related_entity, read_status: false, created_at: now })
}

#[tauri::command]
pub fn mark_notification_read(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── NTF-006: Unread Notification Count ───

#[derive(Debug, Serialize, Deserialize)]
pub struct UnreadNotificationCount {
    pub total: i64,
    pub by_type: NotificationCountByType,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotificationCountByType {
    pub compiler: i64,
    pub review: i64,
    pub pipeline: i64,
    pub system: i64,
}

#[tauri::command]
pub fn get_unread_notification_count(db: State<'_, DbState>) -> Result<UnreadNotificationCount, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let count_by_type = |notif_type: &str| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE is_read = 0 AND type = ?1",
            [notif_type],
            |r| r.get(0),
        ).unwrap_or(0)
    };

    let compiler = count_by_type("compiler");
    let review = count_by_type("review");
    let pipeline = count_by_type("pipeline");
    let system = count_by_type("system");
    let total = compiler + review + pipeline + system;

    Ok(UnreadNotificationCount {
        total,
        by_type: NotificationCountByType {
            compiler,
            review,
            pipeline,
            system,
        },
    })
}

/// Helper to create notifications from pipeline steps (available for orchestrator integration)
#[allow(dead_code)]
pub fn notify_pipeline_event(conn: &rusqlite::Connection, project_id: &str, notif_type: &str, severity: &str, message: &str) {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let _ = conn.execute(
        "INSERT INTO notifications (id, project_id, type, severity, message, is_read, created_at) VALUES (?1,?2,?3,?4,?5,0,?6)",
        rusqlite::params![id, project_id, notif_type, severity, message, now],
    );
}

// ─── Quick Ledger Summary (LDG-001~008 aggregate) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct LedgerSummary {
    pub character_states_count: i64,
    pub relationship_states_count: i64,
    pub timeline_nodes_count: i64,
    pub event_nodes_count: i64,
    pub foreshadow_items_count: i64,
    pub foreshadow_planted_count: i64,
    pub foreshadow_resolved_count: i64,
    pub foreshadow_overdue_count: i64,
    pub ability_items_count: i64,
}

#[tauri::command]
pub fn get_ledger_summary(db: State<'_, DbState>) -> Result<LedgerSummary, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0)
    };

    Ok(LedgerSummary {
        character_states_count: count("SELECT COUNT(*) FROM character_states"),
        relationship_states_count: count("SELECT COUNT(*) FROM relationship_states"),
        timeline_nodes_count: count("SELECT COUNT(*) FROM timeline_nodes"),
        event_nodes_count: count("SELECT COUNT(*) FROM event_nodes"),
        foreshadow_items_count: count("SELECT COUNT(*) FROM foreshadow_items"),
        foreshadow_planted_count: count("SELECT COUNT(*) FROM foreshadow_items WHERE status = 'planted'"),
        foreshadow_resolved_count: count("SELECT COUNT(*) FROM foreshadow_items WHERE status = 'resolved'"),
        foreshadow_overdue_count: count("SELECT COUNT(*) FROM foreshadow_items WHERE status = 'overdue'"),
        ability_items_count: count("SELECT COUNT(*) FROM ability_items"),
    })
}

// ─── LDG-009: Incremental character state update helper ───

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterStateUpdateInput {
    pub character_id: String,
    pub chapter_number: i64,
    pub level_state: Option<String>,
    pub physical_state: Option<String>,
    pub emotion_state: Option<String>,
    pub goal_state: Option<String>,
    pub location_id: Option<String>,
    pub resource_state: Option<String>,
    pub known_info: Option<String>,
    pub secret_info: Option<String>,
}

/// Called after chapter finalization to record incremental state changes for a character.
/// Updates the existing character_state whose chapter_to is NULL (i.e. "current" state),
/// closing it at the given chapter_number, and inserts a new row for the next chapter range.
pub fn update_character_state_after_chapter(
    conn: &rusqlite::Connection,
    project_id: &str,
    input: &CharacterStateUpdateInput,
) -> Result<CharacterStateInfo, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Close the current (open-ended) state for this character
    let open_ended: Option<String> = conn
        .query_row(
            "SELECT id FROM character_states WHERE character_id = ?1 AND chapter_to IS NULL",
            rusqlite::params![input.character_id],
            |r| r.get(0),
        )
        .ok();

    if let Some(ref existing_id) = open_ended {
        conn.execute(
            "UPDATE character_states SET chapter_to = ?1 WHERE id = ?2",
            rusqlite::params![input.chapter_number, existing_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Insert a new current state row starting at the next chapter
    let new_id = uuid::Uuid::new_v4().to_string();
    let next_chapter = input.chapter_number + 1;

    conn.execute(
        "INSERT INTO character_states (id, project_id, character_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        rusqlite::params![
            new_id, project_id, input.character_id,
            next_chapter, Option::<i64>::None,
            input.level_state, input.physical_state, input.emotion_state, input.goal_state,
            input.location_id, input.resource_state, input.known_info, input.secret_info,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_character_state_inner(conn, &new_id)
}

/// Tauri command wrapper for LDG-009
#[tauri::command]
pub fn update_character_state_after_chapter_cmd(
    db: State<'_, DbState>,
    input: CharacterStateUpdateInput,
) -> Result<CharacterStateInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    update_character_state_after_chapter(conn, &project_id, &input)
}

// ─── LDG-010: Recall Ledger Context ───

#[derive(Debug, Serialize, Deserialize)]
pub struct RecallLedgerContextInput {
    pub chapter_number: i64,
    pub character_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecallLedgerContextOutput {
    pub character_states: Vec<CharacterStateInfo>,
    pub active_relationships: Vec<RelationshipStateInfo>,
    pub open_foreshadows: Vec<ForeshadowItemInfo>,
    pub recent_timeline_events: Vec<TimelineNodeInfo>,
    pub context_text: String,
}

/// Recalls relevant ledger context for a given chapter.
/// Returns character states, active relationships, open foreshadows,
/// and recent timeline events, with a compact ~2000 char summary.
#[tauri::command]
pub fn recall_ledger_context(
    db: State<'_, DbState>,
    input: RecallLedgerContextInput,
) -> Result<RecallLedgerContextOutput, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    // Fetch character states
    let char_states: Vec<CharacterStateInfo> = {
        let mut stmt = conn.prepare(
            "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states WHERE chapter_from <= ?1 AND (chapter_to IS NULL OR chapter_to >= ?1) ORDER BY character_id"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([input.chapter_number], |row| {
            Ok(CharacterStateInfo {
                id: row.get(0)?, character_id: row.get(1)?, snapshot_id: row.get(2)?,
                chapter_from: row.get(3)?, chapter_to: row.get(4)?, level_state: row.get(5)?,
                physical_state: row.get(6)?, emotion_state: row.get(7)?, goal_state: row.get(8)?,
                location_id: row.get(9)?, resource_state: row.get(10)?, known_info: row.get(11)?,
                secret_info: row.get(12)?, created_at: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut items: Vec<CharacterStateInfo> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        // Filter by character_ids if provided
        if let Some(ref ids) = input.character_ids {
            items.retain(|cs| ids.contains(&cs.character_id));
        }
        items
    };

    // Fetch active relationships (those active in this chapter range)
    let relationships: Vec<RelationshipStateInfo> = {
        let mut stmt = conn.prepare(
            "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states WHERE chapter_from <= ?1 AND (chapter_to IS NULL OR chapter_to >= ?1) ORDER BY chapter_from"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([input.chapter_number], |row| {
            Ok(RelationshipStateInfo {
                id: row.get(0)?, source_character_id: row.get(1)?, target_character_id: row.get(2)?,
                relation_type: row.get(3)?, strength: row.get(4)?, trust_score: row.get(5)?,
                conflict_score: row.get(6)?, chapter_from: row.get(7)?, chapter_to: row.get(8)?,
                trigger_event_id: row.get(9)?, notes: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut items: Vec<RelationshipStateInfo> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        // Filter by character_ids if provided
        if let Some(ref ids) = input.character_ids {
            items.retain(|r| ids.contains(&r.source_character_id) || ids.contains(&r.target_character_id));
        }
        items
    };

    // Fetch open foreshadows (planted, not resolved)
    let foreshadows: Vec<ForeshadowItemInfo> = {
        let mut stmt = conn.prepare(
            "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items WHERE status IN ('planted', 'overdue') AND seed_chapter <= ?1 ORDER BY seed_chapter"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([input.chapter_number], |row| {
            Ok(ForeshadowItemInfo {
                id: row.get(0)?, seed_chapter: row.get(1)?, expected_volume_id: row.get(2)?,
                title: row.get(3)?, maturity_condition: row.get(4)?, payoff_type: row.get(5)?,
                status: row.get(6)?, resolved_chapter: row.get(7)?, importance: row.get(8)?,
                notes: row.get(9)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    // Fetch recent timeline events (last 10 events up to this chapter)
    let timeline_events: Vec<TimelineNodeInfo> = {
        let mut stmt = conn.prepare(
            "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes WHERE chapter_number <= ?1 ORDER BY relative_day DESC, chapter_number DESC LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([input.chapter_number], |row| {
            Ok(TimelineNodeInfo {
                id: row.get(0)?, chapter_number: row.get(1)?, world_date: row.get(2)?,
                relative_day: row.get(3)?, location_id: row.get(4)?, summary: row.get(5)?,
                participants: row.get(6)?, dependencies: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    // Build compact context_text (limit ~2000 chars)
    let mut text = String::new();

    // Character states summary
    if !char_states.is_empty() {
        text.push_str("【角色状态】\n");
        for cs in &char_states {
            let mut parts: Vec<String> = Vec::new();
            parts.push(format!("[{}]", cs.character_id));
            if let Some(ref level) = cs.level_state { parts.push(format!("等级:{}", level)); }
            if let Some(ref emotion) = cs.emotion_state { parts.push(format!("情绪:{}", emotion)); }
            if let Some(ref goal) = cs.goal_state { parts.push(format!("目标:{}", goal)); }
            if let Some(ref loc) = cs.location_id { parts.push(format!("位置:{}", loc)); }
            text.push_str(&parts.join(" "));
            text.push('\n');
            if text.len() > 1800 { break; }
        }
        text.push('\n');
    }

    // Active relationships summary
    if !relationships.is_empty() && text.len() < 1800 {
        text.push_str("【活跃关系】\n");
        for r in &relationships {
            let mut rel = format!("{}->{}:{}", r.source_character_id, r.target_character_id, r.relation_type);
            if let Some(s) = r.strength { rel.push_str(&format!(" 强度:{}", s)); }
            if let Some(t) = r.trust_score { rel.push_str(&format!(" 信任:{}", t)); }
            text.push_str(&rel);
            text.push('\n');
            if text.len() > 1800 { break; }
        }
        text.push('\n');
    }

    // Open foreshadows summary
    if !foreshadows.is_empty() && text.len() < 1800 {
        text.push_str("【未回收伏笔】\n");
        for f in &foreshadows {
            text.push_str(&format!("- [{}] {} (种子第{}章)\n", f.status, f.title, f.seed_chapter));
            if text.len() > 1800 { break; }
        }
        text.push('\n');
    }

    // Recent timeline events
    if !timeline_events.is_empty() && text.len() < 1800 {
        text.push_str("【近期时间线】\n");
        for t in &timeline_events {
            let day = t.relative_day.map(|d| format!("第{}天", d)).unwrap_or_default();
            let ch = t.chapter_number.map(|c| format!("第{}章", c)).unwrap_or_default();
            text.push_str(&format!("- {} {}: {}\n", day, ch, t.summary));
            if text.len() > 1800 { break; }
        }
    }

    // Truncate to ~2000 chars
    if text.len() > 2000 {
        // Find a good cut point (at a newline)
        let trunc = &text[..2000];
        if let Some(last_nl) = trunc.rfind('\n') {
            text = text[..=last_nl].to_string();
        } else {
            text = trunc.to_string();
        }
        text.push_str("...(已截断)");
    }

    Ok(RecallLedgerContextOutput {
        character_states: char_states,
        active_relationships: relationships,
        open_foreshadows: foreshadows,
        recent_timeline_events: timeline_events,
        context_text: text,
    })
}
