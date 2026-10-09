use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn SystemParametersInfoW(
        uiAction: u32,
        uiParam: u32,
        pvParam: *const u16,
        fWinIni: u32,
    ) -> i32;
}

pub static RESET_ON_CLOSE: AtomicBool = AtomicBool::new(true);
pub static DEFAULT_WALLPAPER_PATH: Mutex<Option<String>> = Mutex::new(None);
pub static WALLPAPER_FIT_MODE: Mutex<String> = Mutex::new(String::new());
pub static WALLPAPER_EFFECT: Mutex<String> = Mutex::new(String::new());
pub static WALLPAPER_TRANSITION: Mutex<String> = Mutex::new(String::new());
pub static CURRENT_WALLPAPER_BMP_PATH: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
pub fn set_reset_on_close(enabled: bool) {
    RESET_ON_CLOSE.store(enabled, Ordering::SeqCst);
}

#[tauri::command]
pub async fn pick_wallpaper() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Pilih gambar wallpaper default")
        .add_filter("Images", &["png", "jpg", "jpeg", "bmp", "webp"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub fn set_default_wallpaper_path(path: Option<String>) -> Result<(), String> {
    let mut guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    *guard = path;
    Ok(())
}

#[tauri::command]
pub fn get_default_wallpaper_path() -> Result<Option<String>, String> {
    let guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn set_wallpaper_fit_mode(mode: String) -> Result<(), String> {
    let normalized = match mode.to_lowercase().as_str() {
        "fit" => "fit",
        "stretch" => "stretch",
        "center" => "center",
        "tile" => "tile",
        "span" => "span",
        _ => "fill",
    };

    if let Ok(mut guard) = WALLPAPER_FIT_MODE.lock() {
        *guard = normalized.to_string();
    }

    #[cfg(windows)]
    set_wallpaper_registry_fit(normalized);

    // Reapply current wallpaper to immediately update desktop display
    reapply_current_wallpaper();

    if crate::sidecar_wallpaper::is_running() {
        let _ = crate::sidecar_wallpaper::set_fit_mode(normalized);
    }

    Ok(())
}

#[tauri::command]
pub fn get_wallpaper_fit_mode() -> Result<String, String> {
    let guard = WALLPAPER_FIT_MODE.lock().map_err(|e| e.to_string())?;
    if guard.is_empty() {
        Ok("fill".to_string())
    } else {
        Ok(guard.clone())
    }
}

#[tauri::command]
pub fn set_wallpaper_effect(effect: String) -> Result<(), String> {
    let normalized = match effect.to_lowercase().as_str() {
        "reactive_glow" | "glow" => "reactive_glow",
        "subtle_pulse" | "pulse" | "breathing" => "subtle_pulse",
        "cinematic_vignette" | "vignette" => "cinematic_vignette",
        "grayscale" | "black_white" => "grayscale",
        "dimmed" | "dim" => "dimmed",
        _ => "none",
    };

    if let Ok(mut guard) = WALLPAPER_EFFECT.lock() {
        *guard = normalized.to_string();
    }

    if crate::sidecar_wallpaper::is_running() {
        let _ = crate::sidecar_wallpaper::set_effect(normalized);
    }

    Ok(())
}

#[tauri::command]
pub fn get_wallpaper_effect() -> Result<String, String> {
    let guard = WALLPAPER_EFFECT.lock().map_err(|e| e.to_string())?;
    if guard.is_empty() {
        Ok("none".to_string())
    } else {
        Ok(guard.clone())
    }
}

#[tauri::command]
pub fn set_wallpaper_transition(transition: String) -> Result<(), String> {
    let normalized = match transition.to_lowercase().as_str() {
        "zoom_in" | "zoom-in" | "zoomin" => "zoom_in",
        "zoom_out" | "zoom-out" | "zoomout" => "zoom_out",
        "slide" | "push" => "slide",
        "none" | "instant" => "none",
        _ => "fade",
    };

    if let Ok(mut guard) = WALLPAPER_TRANSITION.lock() {
        *guard = normalized.to_string();
    }

    if crate::sidecar_wallpaper::is_running() {
        let _ = crate::sidecar_wallpaper::set_transition(normalized);
    }

    Ok(())
}

#[tauri::command]
pub fn get_wallpaper_transition() -> Result<String, String> {
    let guard = WALLPAPER_TRANSITION.lock().map_err(|e| e.to_string())?;
    if guard.is_empty() {
        Ok("fade".to_string())
    } else {
        Ok(guard.clone())
    }
}

fn reapply_current_wallpaper() {
    if let Ok(guard) = CURRENT_WALLPAPER_BMP_PATH.lock() {
        if let Some(ref path_str) = *guard {
            let path = Path::new(path_str);
            if path.exists() {
                let _ = apply_wallpaper(path);
                return;
            }
        }
    }
    if let Ok(def_guard) = DEFAULT_WALLPAPER_PATH.lock() {
        if let Some(ref def_path) = *def_guard {
            let path = Path::new(def_path);
            if path.exists() {
                let _ = clear_wallpaper_internal(true);
            }
        }
    }
}

#[cfg(windows)]
fn set_wallpaper_registry_fit(mode: &str) {
    use std::process::Command;
    let (style, tile) = match mode {
        "fit" => ("6", "0"),
        "stretch" => ("2", "0"),
        "center" => ("0", "0"),
        "tile" => ("0", "1"),
        "span" => ("22", "0"),
        _ => ("10", "0"), // fill
    };

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    use std::os::windows::process::CommandExt;

    let mut cmd1 = Command::new("reg");
    cmd1.args([
        "add",
        "HKCU\\Control Panel\\Desktop",
        "/v",
        "WallpaperStyle",
        "/t",
        "REG_SZ",
        "/d",
        style,
        "/f",
    ])
    .creation_flags(CREATE_NO_WINDOW);
    let _ = cmd1.output();

    let mut cmd2 = Command::new("reg");
    cmd2.args([
        "add",
        "HKCU\\Control Panel\\Desktop",
        "/v",
        "TileWallpaper",
        "/t",
        "REG_SZ",
        "/d",
        tile,
        "/f",
    ])
    .creation_flags(CREATE_NO_WINDOW);
    let _ = cmd2.output();
}

#[cfg(windows)]
pub fn apply_wallpaper(bmp_path: &Path) -> Result<(), String> {
    let mode = WALLPAPER_FIT_MODE
        .lock()
        .map(|g| if g.is_empty() { "fill".to_string() } else { g.clone() })
        .unwrap_or_else(|_| "fill".to_string());

    set_wallpaper_registry_fit(&mode);

    let path_wide: Vec<u16> = OsStr::new(&bmp_path.to_string_lossy().as_ref())
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    const SPI_SETDESKWALLPAPER: u32 = 0x0014;
    const SPIF_UPDATEINIFILE: u32 = 0x01;
    const SPIF_SENDCHANGE: u32 = 0x02;

    let result = unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            path_wide.as_ptr(),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
    };

    if result != 0 { Ok(()) } else { Err("Failed to set wallpaper".into()) }
}

#[cfg(not(windows))]
pub fn apply_wallpaper(_bmp_path: &Path) -> Result<(), String> {
    Ok(())
}

pub fn clear_wallpaper_internal(apply_to_system: bool) -> Result<(), String> {
    let guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let (bmp_path, res) = if let Some(img_path) = guard.as_ref() {
        let path = Path::new(img_path);
        if path.exists() {
            let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;
            let bmp_path = temp_dir.join(format!("mw-def-{}.bmp", timestamp));
            img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
                .map_err(|e| format!("Failed to save BMP: {}", e))?;
            let res = if apply_to_system {
                apply_wallpaper(&bmp_path)
            } else {
                Ok(())
            };
            (bmp_path, res)
        } else {
            // Fallback: Solid black wallpaper
            let bmp_path = temp_dir.join(format!("mw-black-{}.bmp", timestamp));
            let black_img = image::RgbImage::new(1920, 1080);
            black_img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
                .map_err(|e| format!("Failed to save solid black BMP: {}", e))?;
            let res = if apply_to_system {
                apply_wallpaper(&bmp_path)
            } else {
                Ok(())
            };
            (bmp_path, res)
        }
    } else {
        // Fallback: Solid black wallpaper
        let bmp_path = temp_dir.join(format!("mw-black-{}.bmp", timestamp));
        let black_img = image::RgbImage::new(1920, 1080);
        black_img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
            .map_err(|e| format!("Failed to save solid black BMP: {}", e))?;
        let res = if apply_to_system {
            apply_wallpaper(&bmp_path)
        } else {
            Ok(())
        };
        (bmp_path, res)
    };

    if let Ok(mut cur_guard) = CURRENT_WALLPAPER_BMP_PATH.lock() {
        *cur_guard = Some(bmp_path.to_string_lossy().to_string());
    }

    if crate::sidecar_wallpaper::is_running() {
        let _ = crate::sidecar_wallpaper::set_texture(&bmp_path.to_string_lossy());
    }

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                if (name.starts_with("mw-def-") || name.starts_with("mw-black-") || name == "mw-def.bmp") && name.ends_with(".bmp") && p != bmp_path {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }

    res
}

#[tauri::command]
pub async fn clear_wallpaper(apply_to_system: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        clear_wallpaper_internal(apply_to_system.unwrap_or(true))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn set_wallpaper(cover_b64: String, apply_to_system: Option<bool>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::engine::general_purpose::STANDARD as engine;
        use base64::Engine;

        let should_apply_system = apply_to_system.unwrap_or(true);
        let data = engine.decode(&cover_b64).map_err(|e| format!("Base64 decode error: {}", e))?;

        let img = image::load_from_memory(&data)
            .map_err(|e| format!("Failed to decode image: {}", e))?;

        let temp_dir = std::env::temp_dir();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let bmp_path = temp_dir.join(format!("mw-cover-{}.bmp", timestamp));

        img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
            .map_err(|e| format!("Gagal save BMP: {}", e))?;

        let res = if should_apply_system {
            apply_wallpaper(&bmp_path)
        } else {
            Ok(())
        };

        if let Ok(mut cur_guard) = CURRENT_WALLPAPER_BMP_PATH.lock() {
            *cur_guard = Some(bmp_path.to_string_lossy().to_string());
        }

        if crate::sidecar_wallpaper::is_running() {
            let _ = crate::sidecar_wallpaper::set_texture(&bmp_path.to_string_lossy());
        }

        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if (name.starts_with("mw-cover-") || name == "mw-cover.bmp") && name.ends_with(".bmp") && p != bmp_path {
                        let _ = std::fs::remove_file(p);
                    }
                }
            }
        }

        res
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

// ─── Dynamic Live Wallpaper Engine Commands ─────────────────────────────────

#[tauri::command]
pub fn start_wallpaper_engine(
    app: tauri::AppHandle,
    fps: Option<f64>,
    intensity: Option<f64>,
    texture_path: Option<String>,
    fit_mode: Option<String>,
    effect: Option<String>,
    transition: Option<String>,
) -> Result<crate::sidecar_wallpaper::WallpaperEngineState, String> {
    let mode = fit_mode.or_else(|| {
        WALLPAPER_FIT_MODE.lock().ok().and_then(|m| if m.is_empty() { None } else { Some(m.clone()) })
    });
    let eff = effect.or_else(|| {
        WALLPAPER_EFFECT.lock().ok().and_then(|e| if e.is_empty() { None } else { Some(e.clone()) })
    });
    let tr = transition.or_else(|| {
        WALLPAPER_TRANSITION.lock().ok().and_then(|t| if t.is_empty() { None } else { Some(t.clone()) })
    });
    let tex = texture_path
        .filter(|p| !p.trim().is_empty())
        .or_else(|| {
            CURRENT_WALLPAPER_BMP_PATH
                .lock()
                .ok()
                .and_then(|c| c.clone())
                .filter(|p| Path::new(p).exists())
        })
        .or_else(|| {
            DEFAULT_WALLPAPER_PATH
                .lock()
                .ok()
                .and_then(|d| d.clone())
                .filter(|p| Path::new(p).exists())
        });
    crate::sidecar_wallpaper::start_engine(&app, fps, intensity, tex, mode, eff, tr)
}

#[tauri::command]
pub fn stop_wallpaper_engine() -> Result<(), String> {
    crate::sidecar_wallpaper::stop_engine();

    // Reapply native wallpaper so WorkerW DirectX overlay is removed immediately
    if let Ok(guard) = CURRENT_WALLPAPER_BMP_PATH.lock() {
        if let Some(ref p) = *guard {
            let path = Path::new(p);
            if path.exists() {
                let _ = apply_wallpaper(path);
            } else {
                let _ = clear_wallpaper_internal(true);
            }
        } else {
            let _ = clear_wallpaper_internal(true);
        }
    } else {
        let _ = clear_wallpaper_internal(true);
    }

    Ok(())
}

#[tauri::command]
pub fn pause_wallpaper_engine() -> Result<(), String> {
    crate::sidecar_wallpaper::pause_engine()
}

#[tauri::command]
pub fn resume_wallpaper_engine() -> Result<(), String> {
    crate::sidecar_wallpaper::resume_engine()
}

#[tauri::command]
pub fn set_wallpaper_engine_texture(path: String) -> Result<(), String> {
    crate::sidecar_wallpaper::set_texture(&path)
}

#[tauri::command]
pub fn set_wallpaper_engine_fit_mode(mode: String) -> Result<(), String> {
    if let Ok(mut guard) = WALLPAPER_FIT_MODE.lock() {
        *guard = mode.clone();
    }
    crate::sidecar_wallpaper::set_fit_mode(&mode)
}

#[tauri::command]
pub fn set_wallpaper_engine_effect(effect: String) -> Result<(), String> {
    if let Ok(mut guard) = WALLPAPER_EFFECT.lock() {
        *guard = effect.clone();
    }
    crate::sidecar_wallpaper::set_effect(&effect)
}

#[tauri::command]
pub fn set_wallpaper_engine_transition(transition: String) -> Result<(), String> {
    if let Ok(mut guard) = WALLPAPER_TRANSITION.lock() {
        *guard = transition.clone();
    }
    crate::sidecar_wallpaper::set_transition(&transition)
}

#[tauri::command]
pub fn set_wallpaper_engine_fps(fps: f64) -> Result<(), String> {
    crate::sidecar_wallpaper::set_fps(fps)
}

#[tauri::command]
pub fn set_wallpaper_engine_intensity(intensity: f64) -> Result<(), String> {
    crate::sidecar_wallpaper::set_intensity(intensity)
}

#[tauri::command]
pub fn get_wallpaper_engine_state() -> crate::sidecar_wallpaper::WallpaperEngineState {
    crate::sidecar_wallpaper::get_state()
}

#[tauri::command]
pub fn is_wallpaper_engine_running() -> bool {
    crate::sidecar_wallpaper::is_running()
}
