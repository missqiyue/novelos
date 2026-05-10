use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// ─── SHF-004: Background Task Registry ───

/// Represents a running or paused background task (pipeline, compilation, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundTask {
    pub id: String,
    pub project_id: String,
    pub task_type: String, // "pipeline", "compile", "review", "inspection", "retcon"
    pub label: String,
    pub status: String, // "running", "paused", "completed", "failed", "cancelled"
    pub progress: f32,  // 0.0 - 1.0
    pub started_at: String,
    pub updated_at: String,
}

/// Global task registry: tracks all active background tasks across projects.
pub struct TaskRegistry {
    pub tasks: Mutex<HashMap<String, BackgroundTask>>,
}

impl TaskRegistry {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

/// Register a new background task. Returns the task ID.
#[tauri::command]
pub fn register_task(
    registry: State<'_, TaskRegistry>,
    project_id: String,
    task_type: String,
    label: String,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let task = BackgroundTask {
        id: id.clone(),
        project_id,
        task_type,
        label,
        status: "running".to_string(),
        progress: 0.0,
        started_at: now.clone(),
        updated_at: now,
    };
    registry
        .tasks
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), task);
    Ok(id)
}

/// Update task progress.
#[tauri::command]
pub fn update_task_progress(
    registry: State<'_, TaskRegistry>,
    task_id: String,
    progress: f32,
) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.progress = progress.clamp(0.0, 1.0);
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Mark a task as completed.
#[tauri::command]
pub fn complete_task(registry: State<'_, TaskRegistry>, task_id: String) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "completed".to_string();
        task.progress = 1.0;
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Mark a task as failed.
#[tauri::command]
pub fn fail_task(registry: State<'_, TaskRegistry>, task_id: String) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        task.status = "failed".to_string();
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Cancel a running or paused task.
#[tauri::command]
pub fn cancel_task(registry: State<'_, TaskRegistry>, task_id: String) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        if task.status == "completed" || task.status == "failed" || task.status == "cancelled" {
            return Err(format!("Cannot cancel task in '{}' status", task.status));
        }
        task.status = "cancelled".to_string();
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Pause a running task.
#[tauri::command]
pub fn pause_task(registry: State<'_, TaskRegistry>, task_id: String) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        if task.status != "running" {
            return Err(format!(
                "Can only pause running tasks, current status: '{}'",
                task.status
            ));
        }
        task.status = "paused".to_string();
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Resume a paused task.
#[tauri::command]
pub fn resume_task(registry: State<'_, TaskRegistry>, task_id: String) -> Result<(), String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.get_mut(&task_id) {
        if task.status != "paused" {
            return Err(format!(
                "Can only resume paused tasks, current status: '{}'",
                task.status
            ));
        }
        task.status = "running".to_string();
        task.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// List all active tasks for a project.
#[tauri::command]
pub fn list_project_tasks(
    registry: State<'_, TaskRegistry>,
    project_id: String,
) -> Result<Vec<BackgroundTask>, String> {
    let tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    let result: Vec<BackgroundTask> = tasks
        .values()
        .filter(|t| t.project_id == project_id && (t.status == "running" || t.status == "paused"))
        .cloned()
        .collect();
    Ok(result)
}

/// Get all tasks (for bookshelf overview).
#[tauri::command]
pub fn list_all_tasks(registry: State<'_, TaskRegistry>) -> Result<Vec<BackgroundTask>, String> {
    let tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    let result: Vec<BackgroundTask> = tasks
        .values()
        .filter(|t| t.status == "running" || t.status == "paused")
        .cloned()
        .collect();
    Ok(result)
}

/// Cancel all tasks for a project (used when switching projects).
/// Returns the number of tasks cancelled.
#[tauri::command]
pub fn cancel_project_tasks(
    registry: State<'_, TaskRegistry>,
    project_id: String,
) -> Result<u32, String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    let mut count = 0u32;
    for task in tasks.values_mut() {
        if task.project_id == project_id && (task.status == "running" || task.status == "paused") {
            task.status = "cancelled".to_string();
            task.updated_at = chrono::Utc::now().to_rfc3339();
            count += 1;
        }
    }
    Ok(count)
}

/// Pause all tasks for a project (used when switching projects).
/// Returns the number of tasks paused.
#[tauri::command]
pub fn pause_project_tasks(
    registry: State<'_, TaskRegistry>,
    project_id: String,
) -> Result<u32, String> {
    pause_project_tasks_inner(&registry, &project_id)
}

/// Inner function usable from other commands without requiring State wrapper.
pub fn pause_project_tasks_inner(registry: &TaskRegistry, project_id: &str) -> Result<u32, String> {
    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    let mut count = 0u32;
    for task in tasks.values_mut() {
        if task.project_id == project_id && task.status == "running" {
            task.status = "paused".to_string();
            task.updated_at = chrono::Utc::now().to_rfc3339();
            count += 1;
        }
    }
    Ok(count)
}

/// Clean up completed/failed/cancelled tasks older than a given age.
#[tauri::command]
pub fn cleanup_tasks(
    registry: State<'_, TaskRegistry>,
    max_age_hours: Option<u64>,
) -> Result<u32, String> {
    let max_age = max_age_hours.unwrap_or(24);
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(max_age as i64);
    let cutoff_rfc = cutoff.to_rfc3339();

    let mut tasks = registry.tasks.lock().map_err(|e| e.to_string())?;
    let before = tasks.len();
    tasks.retain(|_, task| {
        if task.status == "running" || task.status == "paused" {
            return true; // Never clean up active tasks
        }
        task.updated_at.as_str() >= cutoff_rfc.as_str()
    });
    let removed = (before - tasks.len()) as u32;
    Ok(removed)
}
