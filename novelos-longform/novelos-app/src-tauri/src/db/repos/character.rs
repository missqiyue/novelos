use super::{db_err, Repository};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterRow {
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

const SELECT_COLS: &str = "id, name, alias, role_type, identity_core, persona_core, soul_template_id, soul_json, taboo_rules, core_motivation, status, created_at, updated_at";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CharacterRow> {
    Ok(CharacterRow {
        id: row.get(0)?,
        name: row.get(1)?,
        alias: row.get(2)?,
        role_type: row.get(3)?,
        identity_core: row.get(4)?,
        persona_core: row.get(5)?,
        soul_template_id: row.get(6)?,
        soul_json: row.get(7)?,
        taboo_rules: row.get(8)?,
        core_motivation: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn query_list(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<CharacterRow>, String> {
    let mut stmt = conn.prepare(sql).map_err(db_err)?;
    let rows = stmt.query_map(params, map_row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub struct CharacterRepo;

impl Repository<CharacterRow> for CharacterRepo {
    fn find_by_id(conn: &Connection, id: &str) -> Result<Option<CharacterRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM characters WHERE id = ?1"),
            [id],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    fn list(conn: &Connection) -> Result<Vec<CharacterRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM characters ORDER BY name"),
            [],
        )
    }

    fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute("DELETE FROM character_states WHERE character_id = ?1", [id])
            .map_err(db_err)?;
        conn.execute("DELETE FROM relationship_states WHERE source_character_id = ?1 OR target_character_id = ?1", [id])
            .map_err(db_err)?;
        conn.execute("DELETE FROM characters WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }
}

impl CharacterRepo {
    pub fn find_by_name(conn: &Connection, name: &str) -> Result<Option<CharacterRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM characters WHERE name = ?1"),
            [name],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    pub fn list_by_role(conn: &Connection, role_type: &str) -> Result<Vec<CharacterRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM characters WHERE role_type = ?1 ORDER BY name"),
            [role_type],
        )
    }

    pub fn list_by_status(conn: &Connection, status: &str) -> Result<Vec<CharacterRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM characters WHERE status = ?1 ORDER BY name"),
            [status],
        )
    }
}

// ─── Character States ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterStateRow {
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

const STATE_COLS: &str = "id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at";

fn map_state_row(row: &rusqlite::Row) -> rusqlite::Result<CharacterStateRow> {
    Ok(CharacterStateRow {
        id: row.get(0)?,
        character_id: row.get(1)?,
        snapshot_id: row.get(2)?,
        chapter_from: row.get(3)?,
        chapter_to: row.get(4)?,
        level_state: row.get(5)?,
        physical_state: row.get(6)?,
        emotion_state: row.get(7)?,
        goal_state: row.get(8)?,
        location_id: row.get(9)?,
        resource_state: row.get(10)?,
        known_info: row.get(11)?,
        secret_info: row.get(12)?,
        created_at: row.get(13)?,
    })
}

pub struct CharacterStateRepo;

impl CharacterStateRepo {
    pub fn list_by_character(
        conn: &Connection,
        character_id: &str,
    ) -> Result<Vec<CharacterStateRow>, String> {
        let mut stmt = conn
            .prepare(&format!("SELECT {STATE_COLS} FROM character_states WHERE character_id = ?1 ORDER BY chapter_from"))
            .map_err(db_err)?;
        let rows = stmt
            .query_map([character_id], map_state_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    pub fn current_for_character(
        conn: &Connection,
        character_id: &str,
    ) -> Result<Option<CharacterStateRow>, String> {
        match conn.query_row(
            &format!("SELECT {STATE_COLS} FROM character_states WHERE character_id = ?1 AND chapter_to IS NULL ORDER BY chapter_from DESC LIMIT 1"),
            [character_id],
            map_state_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }
}

// ─── Relationship States ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RelationshipStateRow {
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

const REL_COLS: &str = "id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes";

fn map_rel_row(row: &rusqlite::Row) -> rusqlite::Result<RelationshipStateRow> {
    Ok(RelationshipStateRow {
        id: row.get(0)?,
        source_character_id: row.get(1)?,
        target_character_id: row.get(2)?,
        relation_type: row.get(3)?,
        strength: row.get(4)?,
        trust_score: row.get(5)?,
        conflict_score: row.get(6)?,
        chapter_from: row.get(7)?,
        chapter_to: row.get(8)?,
        trigger_event_id: row.get(9)?,
        notes: row.get(10)?,
    })
}

pub struct RelationshipStateRepo;

impl RelationshipStateRepo {
    pub fn list_by_character(
        conn: &Connection,
        character_id: &str,
    ) -> Result<Vec<RelationshipStateRow>, String> {
        let mut stmt = conn
            .prepare(&format!("SELECT {REL_COLS} FROM relationship_states WHERE source_character_id = ?1 OR target_character_id = ?1 ORDER BY chapter_from"))
            .map_err(db_err)?;
        let rows = stmt
            .query_map([character_id], map_rel_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    pub fn list_between(
        conn: &Connection,
        source_id: &str,
        target_id: &str,
    ) -> Result<Vec<RelationshipStateRow>, String> {
        let mut stmt = conn
            .prepare(&format!("SELECT {REL_COLS} FROM relationship_states WHERE (source_character_id = ?1 AND target_character_id = ?2) OR (source_character_id = ?2 AND target_character_id = ?1) ORDER BY chapter_from"))
            .map_err(db_err)?;
        let rows = stmt
            .query_map(rusqlite::params![source_id, target_id], map_rel_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }
}
