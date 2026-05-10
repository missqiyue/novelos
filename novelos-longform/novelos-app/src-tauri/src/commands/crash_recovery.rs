use crate::commands::llm::LlmState;
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct CrashRecoveryInfo {
    pub chapter_number: i64,
    pub saved_at: String,
    pub draft_length: i64,
}

/// Emergency save: persist draft text to a crash recovery file.
/// This is intentionally lightweight — it writes a small JSON file
/// without creating a chapter_versions entry, so it is fast enough
/// to call synchronously from a CloseRequested handler.
#[tauri::command]
pub fn emergency_save_draft(
    app: AppHandle,
    db: State<'_, DbState>,
    chapter_number: i64,
    draft_text: String,
) -> Result<(), String> {
    let project_id = match db.current_project_id() {
        Some(id) => id,
        None => return Ok(()), // No project open, nothing to save
    };

    let recovery_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("crash_recovery")
        .join(&project_id);
    fs::create_dir_all(&recovery_dir).map_err(|e| e.to_string())?;

    let recovery_path = recovery_dir.join(format!("chapter_{}.json", chapter_number));
    let payload = serde_json::json!({
        "chapter_number": chapter_number,
        "draft_text": draft_text,
        "saved_at": chrono::Utc::now().to_rfc3339(),
        "project_id": project_id,
    });
    fs::write(&recovery_path, payload.to_string()).map_err(|e| e.to_string())?;

    Ok(())
}

/// Check if crash recovery files exist for the current project.
#[tauri::command]
pub fn check_crash_recovery(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<Vec<CrashRecoveryInfo>, String> {
    let project_id = match db.current_project_id() {
        Some(id) => id,
        None => return Ok(vec![]),
    };

    let recovery_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("crash_recovery")
        .join(&project_id);

    if !recovery_dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    for entry in fs::read_dir(&recovery_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                    results.push(CrashRecoveryInfo {
                        chapter_number: data["chapter_number"].as_i64().unwrap_or(0),
                        saved_at: data["saved_at"].as_str().unwrap_or("").to_string(),
                        draft_length: data["draft_text"].as_str().map_or(0, |s| s.len() as i64),
                    });
                }
            }
        }
    }

    Ok(results)
}

/// Restore a chapter from crash recovery and clean up the recovery file.
#[tauri::command]
pub async fn restore_crash_draft(
    app: AppHandle,
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    chapter_number: i64,
) -> Result<String, String> {
    let project_id = db.current_project_id().ok_or("No project open")?;

    let recovery_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("crash_recovery")
        .join(&project_id)
        .join(format!("chapter_{}.json", chapter_number));

    if !recovery_path.exists() {
        return Err("No crash recovery file found".to_string());
    }

    let content = fs::read_to_string(&recovery_path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let draft_text = data["draft_text"]
        .as_str()
        .ok_or("Invalid recovery file")?
        .to_string();

    // Restore to DB via the normal update_chapter_draft path
    if !draft_text.trim().is_empty() {
        super::chapter::update_chapter_draft(
            db,
            llm,
            chapter_number,
            draft_text.clone(),
            Some(true),
        )
        .await?;
    }

    // Clean up recovery file
    let _ = fs::remove_file(&recovery_path);

    Ok(draft_text)
}

/// Discard a crash recovery file without restoring.
#[tauri::command]
pub fn discard_crash_recovery(
    app: AppHandle,
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<(), String> {
    let project_id = match db.current_project_id() {
        Some(id) => id,
        None => return Ok(()),
    };

    let recovery_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("crash_recovery")
        .join(&project_id)
        .join(format!("chapter_{}.json", chapter_number));

    if recovery_path.exists() {
        fs::remove_file(&recovery_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
