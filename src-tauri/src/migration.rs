use std::fs;
use tauri::{AppHandle, Manager};

/// Runs once on Tauri startup to clean up obsolete standalone audio engine,
/// bit-perfect, equalizer, and tag-editor plugin directories now that the
/// audio engine and tag writer are built natively into the Rust backend.
pub fn migrate_legacy_plugins(app: &AppHandle) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let plugins_dir = base.join("plugins");
    if !plugins_dir.exists() {
        return Ok(());
    }

    for legacy_folder in [
        "engine",
        "bit-perfect",
        "equalizer",
        "tag-editor",
        "wallpaper-engine",
    ] {
        let dir = plugins_dir.join(legacy_folder);
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
        }
    }

    Ok(())
}
