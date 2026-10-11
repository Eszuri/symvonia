use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::wallpaper_plugin_manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WallpaperEngineState {
    pub is_running: bool,
    pub state: String,
    pub scene: String,
    pub texture_path: Option<String>,
    pub fit_mode: String,
    pub effect: String,
    pub transition: String,
    pub fps: f64,
    pub intensity: f64,
    pub monitor_count: i32,
    pub last_error: Option<String>,
}

impl Default for WallpaperEngineState {
    fn default() -> Self {
        Self {
            is_running: false,
            state: "stopped".to_string(),
            scene: "cover-reactive".to_string(),
            texture_path: None,
            fit_mode: "fill".to_string(),
            effect: "none".to_string(),
            transition: "fade".to_string(),
            fps: 30.0,
            intensity: 1.0,
            monitor_count: 0,
            last_error: None,
        }
    }
}

static WALLPAPER_STATE: Mutex<WallpaperEngineState> = Mutex::new(WallpaperEngineState {
    is_running: false,
    state: String::new(),
    scene: String::new(),
    texture_path: None,
    fit_mode: String::new(),
    effect: String::new(),
    transition: String::new(),
    fps: 30.0,
    intensity: 1.0,
    monitor_count: 0,
    last_error: None,
});

pub fn get_state() -> WallpaperEngineState {
    WALLPAPER_STATE
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}

pub fn is_running() -> bool {
    WALLPAPER_STATE
        .lock()
        .map(|s| s.is_running)
        .unwrap_or(false)
}

pub struct WallpaperEngineProcess {
    child: Child,
    stdin: ChildStdin,
}

impl WallpaperEngineProcess {
    fn send(&mut self, json_line: &str) -> Result<(), String> {
        self.stdin
            .write_all(json_line.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("Failed to write to wallpaper engine stdin: {}", e))
    }
}

static WALLPAPER_ENGINE: Mutex<Option<WallpaperEngineProcess>> = Mutex::new(None);

pub fn start_engine(
    app: &AppHandle,
    fps: Option<f64>,
    intensity: Option<f64>,
    texture_path: Option<String>,
    fit_mode: Option<String>,
    effect: Option<String>,
    transition: Option<String>,
) -> Result<WallpaperEngineState, String> {
    stop_engine();

    let exe = wallpaper_plugin_manager::plugin_exe_path(app)?;
    if !exe.exists() {
        return Err(
            "Plugin Wallpaper Engine belum terpasang. Pasang plugin terlebih dahulu di Pengaturan -> Plugin.".to_string(),
        );
    }

    wallpaper_plugin_manager::verify_with_cache(&exe)?;

    wallpaper_plugin_manager::ensure_bundled_shaders(app)?;
    let shaders_dir = wallpaper_plugin_manager::plugin_shaders_dir(app)?;
    let target_fps = fps.unwrap_or(30.0).clamp(1.0, 120.0);
    let target_intensity = intensity.unwrap_or(1.0).clamp(0.0, 2.0);
    let target_fit = fit_mode.unwrap_or_else(|| "fill".to_string());
    let target_effect = effect.unwrap_or_else(|| "none".to_string());
    let target_transition = transition.unwrap_or_else(|| "fade".to_string());

    let mut cmd = Command::new(&exe);
    cmd.arg("--stdio");
    if shaders_dir.exists() {
        cmd.arg("--shader-dir").arg(&shaders_dir);
    }
    cmd.arg("--fps").arg(target_fps.to_string());
    cmd.arg("--fit").arg(&target_fit);
    cmd.arg("--effect").arg(&target_effect);
    cmd.arg("--transition").arg(&target_transition);
    if let Some(ref tex) = texture_path {
        if std::path::Path::new(tex).exists() {
            cmd.arg("--texture").arg(tex);
        }
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start wallpaper engine: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to open wallpaper engine stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open wallpaper engine stdout".to_string())?;

    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.is_running = true;
        state.state = "playing".to_string();
        state.fps = target_fps;
        state.intensity = target_intensity;
        state.texture_path = texture_path.clone();
        state.fit_mode = target_fit.clone();
        state.effect = target_effect.clone();
        state.transition = target_transition.clone();
        state.last_error = None;
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.trim().is_empty() => {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&l) {
                        if let Some(evt) = parsed.get("event").and_then(|v| v.as_str()) {
                            if let Ok(mut state) = WALLPAPER_STATE.lock() {
                                match evt {
                                    "state" => {
                                        if let Some(st) = parsed.get("state").and_then(|v| v.as_str()) {
                                            state.state = st.to_string();
                                        }
                                        if let Some(sc) = parsed.get("scene").and_then(|v| v.as_str()) {
                                            state.scene = sc.to_string();
                                        }
                                        if let Some(tp) = parsed.get("texturePath").and_then(|v| v.as_str()) {
                                            state.texture_path = if tp.is_empty() { None } else { Some(tp.to_string()) };
                                        }
                                        if let Some(fm) = parsed.get("fitMode").and_then(|v| v.as_str()) {
                                            state.fit_mode = fm.to_string();
                                        }
                                        if let Some(eff) = parsed.get("effect").and_then(|v| v.as_str()) {
                                            state.effect = eff.to_string();
                                        }
                                        if let Some(tr) = parsed.get("transition").and_then(|v| v.as_str()) {
                                            state.transition = tr.to_string();
                                        }
                                        if let Some(fps_val) = parsed.get("fps").and_then(|v| v.as_f64()) {
                                            state.fps = fps_val;
                                        }
                                        if let Some(mc) = parsed.get("monitorCount").and_then(|v| v.as_i64()) {
                                            state.monitor_count = mc as i32;
                                        }
                                        if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
                                            state.last_error = Some(err.to_string());
                                        }
                                    }
                                    "error" => {
                                        if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
                                            state.last_error = Some(msg.to_string());
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    let _ = app_handle.emit("wallpaper-engine-event", l);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }

        if let Ok(mut state) = WALLPAPER_STATE.lock() {
            state.is_running = false;
            state.state = "stopped".to_string();
        }
        let _ = app_handle.emit("wallpaper-engine-stopped", ());
    });

    let mut process = WallpaperEngineProcess { child, stdin };
    if (target_intensity - 1.0).abs() > 0.001 {
        let set_param_cmd = json!({
            "command": "set_param",
            "name": "intensity",
            "value": target_intensity
        })
        .to_string();
        let _ = process.send(&set_param_cmd);
    }

    if let Ok(mut guard) = WALLPAPER_ENGINE.lock() {
        *guard = Some(process);
    }

    Ok(get_state())
}

pub fn stop_engine() {
    if let Ok(mut guard) = WALLPAPER_ENGINE.lock() {
        if let Some(mut proc) = guard.take() {
            let quit_cmd = json!({ "command": "quit" }).to_string();
            let _ = proc.send(&quit_cmd);

            std::thread::sleep(std::time::Duration::from_millis(100));
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "symvonia-wallpaper.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.is_running = false;
        state.state = "stopped".to_string();
    }
}

pub fn pause_engine() -> Result<(), String> {
    send_command(&json!({ "command": "pause" }).to_string())
}

pub fn resume_engine() -> Result<(), String> {
    send_command(&json!({ "command": "resume" }).to_string())
}

pub fn set_texture(path: &str) -> Result<(), String> {
    send_command(&json!({ "command": "set_texture", "path": path }).to_string())
}

pub fn set_fit_mode(mode: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.fit_mode = mode.to_string();
    }
    send_command(&json!({ "command": "set_fit_mode", "mode": mode }).to_string())
}

pub fn set_effect(effect: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.effect = effect.to_string();
    }
    send_command(&json!({ "command": "set_effect", "effect": effect }).to_string())
}

pub fn set_transition(transition: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.transition = transition.to_string();
    }
    send_command(&json!({ "command": "set_transition", "transition": transition }).to_string())
}

pub fn set_fps(fps: f64) -> Result<(), String> {
    let clamped = fps.clamp(1.0, 120.0);
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.fps = clamped;
    }
    send_command(&json!({ "command": "set_fps", "fps": clamped }).to_string())
}

pub fn set_intensity(intensity: f64) -> Result<(), String> {
    let clamped = intensity.clamp(0.0, 2.0);
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.intensity = clamped;
    }
    send_command(
        &json!({ "command": "set_param", "name": "intensity", "value": clamped }).to_string(),
    )
}

pub fn send_command(json_line: &str) -> Result<(), String> {
    let mut guard = WALLPAPER_ENGINE
        .lock()
        .map_err(|e| format!("Failed to lock wallpaper engine: {}", e))?;
    if let Some(ref mut proc) = *guard {
        proc.send(json_line)
    } else {
        Err("Wallpaper engine is not running".to_string())
    }
}
