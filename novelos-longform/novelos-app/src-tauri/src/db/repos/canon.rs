use super::{db_err, Repository};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanonRuleRow {
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

const SELECT_COLS: &str = "id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<CanonRuleRow> {
    Ok(CanonRuleRow {
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
}

fn query_list(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<CanonRuleRow>, String> {
    let mut stmt = conn.prepare(sql).map_err(db_err)?;
    let rows = stmt.query_map(params, map_row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub struct CanonRuleRepo;

impl Repository<CanonRuleRow> for CanonRuleRepo {
    fn find_by_id(conn: &Connection, id: &str) -> Result<Option<CanonRuleRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM canon_rules WHERE id = ?1"),
            [id],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    fn list(conn: &Connection) -> Result<Vec<CanonRuleRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM canon_rules ORDER BY created_at"),
            [],
        )
    }

    fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute(
            "DELETE FROM canon_rule_versions WHERE canon_rule_id = ?1",
            [id],
        )
        .map_err(db_err)?;
        conn.execute("DELETE FROM canon_rules WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }
}

impl CanonRuleRepo {
    pub fn list_by_scope(conn: &Connection, scope_type: &str) -> Result<Vec<CanonRuleRow>, String> {
        query_list(
            conn,
            &format!(
                "SELECT {SELECT_COLS} FROM canon_rules WHERE scope_type = ?1 ORDER BY created_at"
            ),
            [scope_type],
        )
    }

    pub fn search(conn: &Connection, query: &str) -> Result<Vec<CanonRuleRow>, String> {
        let search_term = format!("%{}%", query.trim());
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM canon_rules WHERE rule_name LIKE ?1 OR content LIKE ?1 OR rule_key LIKE ?1 ORDER BY is_hard DESC, rule_name"),
            [&search_term],
        )
    }
}

// ─── Canon Rule Versions ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanonRuleVersionRow {
    pub id: String,
    pub canon_rule_id: String,
    pub version: i64,
    pub content: String,
    pub change_reason: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

fn map_version_row(row: &rusqlite::Row) -> rusqlite::Result<CanonRuleVersionRow> {
    Ok(CanonRuleVersionRow {
        id: row.get(0)?,
        canon_rule_id: row.get(1)?,
        version: row.get(2)?,
        content: row.get(3)?,
        change_reason: row.get(4)?,
        created_by: row.get(5)?,
        created_at: row.get(6)?,
    })
}

pub struct CanonRuleVersionRepo;

impl CanonRuleVersionRepo {
    pub fn list_by_rule(
        conn: &Connection,
        canon_rule_id: &str,
    ) -> Result<Vec<CanonRuleVersionRow>, String> {
        let mut stmt = conn
            .prepare("SELECT id, canon_rule_id, version, content, change_reason, created_by, created_at FROM canon_rule_versions WHERE canon_rule_id = ?1 ORDER BY version DESC")
            .map_err(db_err)?;
        let rows = stmt
            .query_map([canon_rule_id], map_version_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }
}
