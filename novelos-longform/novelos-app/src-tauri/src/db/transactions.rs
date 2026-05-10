use rusqlite::Connection;

/// Execute a closure inside a SQLite transaction.
/// Commits on Ok, rolls back on Err.
pub fn run_in_transaction<T>(
    conn: &Connection,
    f: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    match f() {
        Ok(value) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(value)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// DB-010: Finalize chapter — update status + create snapshot, atomically.
pub fn finalize_chapter_transaction(
    conn: &Connection,
    project_id: &str,
    chapter_number: i64,
) -> Result<(), String> {
    run_in_transaction(conn, || {
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE chapters SET final_text = draft_text, status = 'finalized', updated_at = ?1 WHERE chapter_number = ?2",
            rusqlite::params![now, chapter_number],
        ).map_err(|e| e.to_string())?;

        crate::commands::snapshot::create_snapshot_for_chapter(conn, project_id, chapter_number)?;

        Ok(())
    })
}

/// DB-010: Create canon rule + initial version record, atomically.
pub fn create_canon_rule_transaction(
    conn: &Connection,
    project_id: &str,
    id: &str,
    rule_key: &str,
    rule_name: &str,
    rule_type: &str,
    scope_type: &str,
    scope_ref: Option<&str>,
    content: &str,
    is_hard: i64,
    source_type: Option<&str>,
    source_ref: Option<&str>,
    now: &str,
) -> Result<(), String> {
    run_in_transaction(conn, || {
        conn.execute(
            "INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', 1, ?10, ?11, ?12, ?13)",
            rusqlite::params![id, project_id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, source_type, source_ref, now, now],
        ).map_err(|e| e.to_string())?;

        let version_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO canon_rule_versions (id, canon_rule_id, version, content, change_reason, created_by, created_at) VALUES (?1, ?2, 1, ?3, 'Initial version', 'user', ?4)",
            rusqlite::params![version_id, id, content, now],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })
}

/// DB-010: Update canon rule content + create version record, atomically.
pub fn update_canon_with_version(
    conn: &Connection,
    id: &str,
    content: &str,
    change_reason: Option<&str>,
    now: &str,
) -> Result<(), String> {
    run_in_transaction(conn, || {
        let current_version: i64 = conn
            .query_row("SELECT version FROM canon_rules WHERE id = ?1", [id], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?;
        let new_version = current_version + 1;

        conn.execute(
            "UPDATE canon_rules SET content = ?1, version = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![content, new_version, now, id],
        )
        .map_err(|e| e.to_string())?;

        let version_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO canon_rule_versions (id, canon_rule_id, version, content, change_reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'user', ?6)",
            rusqlite::params![version_id, id, new_version, content, change_reason.unwrap_or("Updated"), now],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })
}

/// DB-010: Delete canon rule + its version records, atomically.
pub fn delete_canon_rule_transaction(conn: &Connection, id: &str) -> Result<(), String> {
    run_in_transaction(conn, || {
        conn.execute(
            "DELETE FROM canon_rule_versions WHERE canon_rule_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM canon_rules WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// DB-010: Atomic status transition for retcon requests.
/// Checks current status matches `expected`, then updates to `new_status` with timestamp.
/// Uses WHERE guard for atomicity (TOCTOU-safe).
/// Returns the number of rows affected (0 means status didn't match).
pub fn retcon_status_transition(
    conn: &Connection,
    retcon_id: &str,
    expected_status: &str,
    new_status: &str,
) -> Result<usize, String> {
    run_in_transaction(conn, || {
        let now = chrono::Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE retcon_requests SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status = ?4",
            rusqlite::params![new_status, now, retcon_id, expected_status],
        ).map_err(|e| e.to_string())?;

        if affected == 0 {
            let current: String = conn
                .query_row(
                    "SELECT status FROM retcon_requests WHERE id = ?1",
                    [retcon_id],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(format!(
                "Cannot transition from '{}' to '{}' (expected '{}')",
                current, new_status, expected_status
            ));
        }

        Ok(affected)
    })
}

/// DB-010: Approve retcon with atomic status check + approved_at timestamp.
pub fn approve_retcon_transaction(conn: &Connection, retcon_id: &str) -> Result<(), String> {
    run_in_transaction(conn, || {
        let now = chrono::Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE retcon_requests SET status = 'approved', approved_at = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'pending'",
            rusqlite::params![now, now, retcon_id],
        ).map_err(|e| e.to_string())?;

        if affected == 0 {
            let current: String = conn
                .query_row(
                    "SELECT status FROM retcon_requests WHERE id = ?1",
                    [retcon_id],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(format!(
                "Cannot approve retcon in '{}' status. Must be 'pending'.",
                current
            ));
        }

        Ok(())
    })
}
