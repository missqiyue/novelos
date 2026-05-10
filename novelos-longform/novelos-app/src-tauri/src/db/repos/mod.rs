pub mod canon;
pub mod chapter;
pub mod character;
pub mod retcon;

use rusqlite::Connection;
use std::sync::MutexGuard;

/// Run a closure with a reference to the project database connection.
/// Holds the MutexGuard for the duration of the closure, preventing
/// concurrent access issues and avoiding the broken `.clone()` approach.
pub fn with_project_conn<F, R>(db: &crate::db::DbState, f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, String>,
{
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .as_ref()
        .ok_or_else(|| "No project open".to_string())?;
    f(conn)
}

/// Run a closure with a reference to the global database connection.
pub fn with_global_conn<F, R>(db: &crate::db::DbState, f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, String>,
{
    let guard = db.global.lock().map_err(|e| e.to_string())?;
    f(&guard)
}

/// Core repository trait. Each entity implements this for type-safe data access.
pub trait Repository<T> {
    /// Find a single entity by its primary key.
    fn find_by_id(conn: &Connection, id: &str) -> Result<Option<T>, String>;

    /// List all entities, optionally filtered.
    fn list(conn: &Connection) -> Result<Vec<T>, String>;

    /// Delete an entity by its primary key.
    fn delete(conn: &Connection, id: &str) -> Result<(), String>;
}

/// Helper: map a rusqlite error into our String error type.
pub fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}
