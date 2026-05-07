pub mod global;
pub mod project;
pub mod repos;
pub mod transactions;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub global: Mutex<Connection>,
    pub project: Mutex<Option<Connection>>,
    pub project_id: Mutex<Option<String>>,
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
            global: Mutex::new(global_conn),
            project: Mutex::new(None),
            project_id: Mutex::new(None),
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
}
