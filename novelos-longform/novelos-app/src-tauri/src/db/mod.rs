pub mod global;
pub mod project;
pub mod repos;
pub mod transactions;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::Manager;

pub struct DbState {
    pub global: Arc<Mutex<Connection>>,
    pub project: Arc<Mutex<Option<Connection>>>,
    pub project_id: Arc<Mutex<Option<String>>>,
}

/// Helper to recover from a poisoned Mutex by recreating the inner value.
/// This should only be used when the poisoned state is recoverable
/// (i.e. the inner value can be safely reconstructed).
fn recover_or_lock<T>(mutex: &Mutex<T>, recover: impl FnOnce() -> T) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!("Mutex poisoned — recovering by replacing with fresh value");
            // Replace the poisoned mutex contents with a fresh value
            let mut guard = poisoned.into_inner();
            *guard = recover();
            guard
        }
    }
}

impl Clone for DbState {
    fn clone(&self) -> Self {
        Self {
            global: Arc::clone(&self.global),
            project: Arc::clone(&self.project),
            project_id: Arc::clone(&self.project_id),
        }
    }
}

impl DbState {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = app.path().app_data_dir()?.join("novelos");
        std::fs::create_dir_all(&data_dir)?;

        let global_dir = data_dir.join("global");
        std::fs::create_dir_all(&global_dir)?;
        let global_db_path = global_dir.join("global.db");

        let mut global_conn = Connection::open(&global_db_path)?;
        global::run_migrations(&mut global_conn)?;

        let books_dir = data_dir.join("books");
        std::fs::create_dir_all(&books_dir)?;

        Ok(Self {
            global: Arc::new(Mutex::new(global_conn)),
            project: Arc::new(Mutex::new(None)),
            project_id: Arc::new(Mutex::new(None)),
        })
    }

    pub fn books_dir(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let dir = app.path().app_data_dir()?.join("novelos").join("books");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn open_project_db(&self, app: &tauri::AppHandle, project_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let db_path = Self::books_dir(app)?.join(project_id).join("book.db");
        std::fs::create_dir_all(db_path.parent().unwrap())?;
        let mut conn = Connection::open(&db_path)?;
        project::run_migrations(&mut conn)?;
        *self.project.lock().unwrap() = Some(conn);
        *self.project_id.lock().unwrap() = Some(project_id.to_string());
        Ok(())
    }

    pub fn close_project_db(&self) {
        *self.project.lock().unwrap() = None;
        *self.project_id.lock().unwrap() = None;
    }

    pub fn current_project_id(&self) -> Option<String> {
        self.project_id.lock().unwrap().clone()
    }

    /// Safely lock the project database connection.
    /// Returns an error if the project is not open.
    /// On poisoned mutex, clears and returns an error rather than
    /// using a potentially inconsistent connection.
    pub fn lock_project(&self) -> Result<MutexGuard<'_, Option<Connection>>, String> {
        match self.project.lock() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                log::error!("Project DB mutex poisoned — clearing connection");
                let mut guard = poisoned.into_inner();
                *guard = None;
                Err("Database connection was poisoned and has been reset. Please re-open the project.".to_string())
            }
        }
    }

    /// Safely lock the global database connection.
    /// On poisoned mutex, attempts to re-open the connection.
    pub fn lock_global(&self, app: &tauri::AppHandle) -> Result<MutexGuard<'_, Connection>, String> {
        match self.global.lock() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                log::error!("Global DB mutex poisoned — attempting to re-open");
                let mut guard = poisoned.into_inner();
                // Try to re-open the global database
                let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("novelos").join("global");
                let db_path = data_dir.join("global.db");
                match Connection::open(&db_path) {
                    Ok(conn) => {
                        *guard = conn;
                        Ok(guard)
                    }
                    Err(e) => {
                        Err(format!("Failed to re-open global database: {}", e))
                    }
                }
            }
        }
    }
}
