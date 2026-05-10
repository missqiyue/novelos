/// Placeholder — window theme is now controlled entirely from the frontend
/// via getCurrentWindow().setTheme() + set_background_color().
/// Keeping the module to avoid breaking mod.rs.

#[tauri::command]
pub fn set_window_theme(_app: tauri::AppHandle, _theme: String) -> Result<(), String> {
    // No-op: handled by frontend via @tauri-apps/api/window setTheme()
    Ok(())
}
