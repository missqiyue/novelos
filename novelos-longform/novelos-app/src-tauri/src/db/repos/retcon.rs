use super::{db_err, Repository};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetconRequestRow {
    pub id: String,
    pub project_id: String,
    pub request_type: String,
    pub target_type: String,
    pub target_ref: String,
    pub reason: String,
    pub impact_summary: Option<String>,
    pub risk_level: Option<String>,
    pub strategy: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub scheme: Option<String>,
    pub approved_at: Option<String>,
    pub rejection_reason: Option<String>,
}

const SELECT_COLS: &str = "id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at, scheme, approved_at, rejection_reason";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<RetconRequestRow> {
    Ok(RetconRequestRow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        request_type: row.get(2)?,
        target_type: row.get(3)?,
        target_ref: row.get(4)?,
        reason: row.get(5)?,
        impact_summary: row.get(6)?,
        risk_level: row.get(7)?,
        strategy: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        scheme: row.get(12)?,
        approved_at: row.get(13)?,
        rejection_reason: row.get(14)?,
    })
}

fn query_list(conn: &Connection, sql: &str, params: impl rusqlite::Params) -> Result<Vec<RetconRequestRow>, String> {
    let mut stmt = conn.prepare(sql).map_err(db_err)?;
    let rows = stmt.query_map(params, map_row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub struct RetconRequestRepo;

impl Repository<RetconRequestRow> for RetconRequestRepo {
    fn find_by_id(conn: &Connection, id: &str) -> Result<Option<RetconRequestRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM retcon_requests WHERE id = ?1"),
            [id],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    fn list(conn: &Connection) -> Result<Vec<RetconRequestRow>, String> {
        query_list(conn, &format!("SELECT {SELECT_COLS} FROM retcon_requests ORDER BY created_at DESC"), [])
    }

    fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute("DELETE FROM retcon_requests WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }
}

impl RetconRequestRepo {
    pub fn list_by_status(conn: &Connection, status: &str) -> Result<Vec<RetconRequestRow>, String> {
        query_list(conn, &format!("SELECT {SELECT_COLS} FROM retcon_requests WHERE status = ?1 ORDER BY created_at DESC"), [status])
    }

    pub fn list_by_target(conn: &Connection, target_type: &str, target_ref: &str) -> Result<Vec<RetconRequestRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM retcon_requests WHERE target_type = ?1 AND target_ref = ?2 ORDER BY created_at DESC"),
            rusqlite::params![target_type, target_ref],
        )
    }

    pub fn update_status(conn: &Connection, id: &str, status: &str, now: &str) -> Result<(), String> {
        conn.execute(
            "UPDATE retcon_requests SET status = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![status, now, id],
        )
        .map_err(db_err)?;
        Ok(())
    }

    pub fn approve(conn: &Connection, id: &str, scheme: &str, now: &str) -> Result<(), String> {
        conn.execute(
            "UPDATE retcon_requests SET status = 'approved', scheme = ?1, approved_at = ?2, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![scheme, now, id],
        )
        .map_err(db_err)?;
        Ok(())
    }

    pub fn reject(conn: &Connection, id: &str, reason: &str, now: &str) -> Result<(), String> {
        conn.execute(
            "UPDATE retcon_requests SET status = 'rejected', rejection_reason = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![reason, now, id],
        )
        .map_err(db_err)?;
        Ok(())
    }
}
