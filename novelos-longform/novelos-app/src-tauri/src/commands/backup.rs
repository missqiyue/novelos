use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn create_backup(app: AppHandle, db: State<'_, DbState>) -> Result<BackupInfo, String> {
    let project_id = db.current_project_id().ok_or("No project open")?;
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let backup_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("backups")
        .join(&project_id);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let filename = format!("backup_{}.db", now.format("%Y%m%d_%H%M%S"));
    let backup_path = backup_dir.join(&filename);

    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;

    let metadata = fs::metadata(&backup_path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    // Clean old backups (keep last 10)
    let mut backups: Vec<PathBuf> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |e| e == "db"))
        .collect();
    backups.sort();
    while backups.len() > 10 {
        if let Some(old) = backups.first() {
            let _ = fs::remove_file(old);
            backups.remove(0);
        }
    }

    Ok(BackupInfo {
        path: backup_path.to_string_lossy().to_string(),
        created_at: now.to_rfc3339(),
        size_bytes: size,
    })
}

#[tauri::command]
pub fn list_backups(app: AppHandle, db: State<'_, DbState>) -> Result<Vec<BackupInfo>, String> {
    let project_id = db.current_project_id().ok_or("No project open")?;
    let backup_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("backups")
        .join(&project_id);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups: Vec<BackupInfo> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "db"))
        .filter_map(|e| {
            let path = e.path();
            let metadata = fs::metadata(&path).ok()?;
            let filename = path.file_stem()?.to_string_lossy();
            let date_str = filename.strip_prefix("backup_")?;
            Some(BackupInfo {
                path: path.to_string_lossy().to_string(),
                created_at: format!("{}T00:00:00Z", date_str),
                size_bytes: metadata.len(),
            })
        })
        .collect();

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

/// Restore the project database from a backup file.
/// Creates a safety backup before overwriting, then closes the DB,
/// copies the backup over book.db, and reopens the connection.
#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    db: State<'_, DbState>,
    backup_path: String,
) -> Result<BackupInfo, String> {
    let project_id = db.current_project_id().ok_or("No project open")?;
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");
    let backup_src = PathBuf::from(&backup_path);

    if !backup_src.exists() {
        return Err("Backup file not found".to_string());
    }
    if !db_path.exists() {
        return Err("Current project database not found".to_string());
    }

    // Create a pre-restore safety backup
    let safety_backup = create_backup(app.clone(), db.clone())?;

    // Close the project database connection
    db.close_project_db();

    // Copy backup over book.db
    fs::copy(&backup_src, &db_path).map_err(|e| format!("Failed to restore backup: {}", e))?;

    // Reopen the project database
    db.open_project_db(&app, &project_id)
        .map_err(|e| format!("Failed to reopen project DB after restore: {}", e))?;

    Ok(safety_backup)
}
