#![cfg(windows)]

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender, SyncSender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

use super::renderer::{RenderOutcome, Renderer};
use super::window_host::WindowHost;

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

enum WorkerCmd {
    Pause,
    Resume,
    SetTexture(String),
    SetFitMode(String),
    SetEffect(String),
    SetTransition(String),
    SetFps(f64),
    SetIntensity(f64),
    Stop(SyncSender<()>),
}

static WORKER_TX: Mutex<Option<Sender<WorkerCmd>>> = Mutex::new(None);

pub fn get_state() -> WallpaperEngineState {
    WALLPAPER_STATE
        .lock()
        .map(|s| {
            let mut copy = s.clone();
            if copy.state.is_empty() {
                copy.state = "stopped".to_string();
            }
            if copy.scene.is_empty() {
                copy.scene = "cover-reactive".to_string();
            }
            if copy.fit_mode.is_empty() {
                copy.fit_mode = "fill".to_string();
            }
            if copy.effect.is_empty() {
                copy.effect = "none".to_string();
            }
            if copy.transition.is_empty() {
                copy.transition = "fade".to_string();
            }
            copy
        })
        .unwrap_or_default()
}

pub fn is_running() -> bool {
    WALLPAPER_STATE
        .lock()
        .map(|s| s.is_running)
        .unwrap_or(false)
}

fn emit_state_snapshot(app: &AppHandle) {
    let snap = get_state();
    let payload = json!({
        "event": "state",
        "state": snap.state,
        "scene": snap.scene,
        "texturePath": snap.texture_path.unwrap_or_default(),
        "fitMode": snap.fit_mode,
        "effect": snap.effect,
        "transition": snap.transition,
        "fps": snap.fps,
        "monitorCount": snap.monitor_count,
        "error": snap.last_error,
    })
    .to_string();
    let _ = app.emit("wallpaper-engine-event", payload);
}

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

    let target_fps = fps.unwrap_or(30.0).clamp(1.0, 120.0);
    let target_intensity = intensity.unwrap_or(1.0).clamp(0.0, 2.0);
    let target_fit = fit_mode.unwrap_or_else(|| "fill".to_string());
    let target_effect = effect.unwrap_or_else(|| "none".to_string());
    let target_transition = transition.unwrap_or_else(|| "fade".to_string());

    let (cmd_tx, cmd_rx) = mpsc::channel::<WorkerCmd>();
    let (init_tx, init_rx) = mpsc::sync_channel::<Result<i32, String>>(1);

    let app_handle = app.clone();
    let init_tex = texture_path.clone();
    let init_fit = target_fit.clone();
    let init_eff = target_effect.clone();
    let init_tr = target_transition.clone();

    std::thread::Builder::new()
        .name("symvonia-d3d11-wallpaper".to_string())
        .spawn(move || {
            let panic_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_worker_loop(
                    app_handle.clone(),
                    cmd_rx,
                    init_tx,
                    target_fps,
                    target_intensity,
                    init_tex,
                    init_fit,
                    init_eff,
                    init_tr,
                );
            }));

            if let Err(panic_err) = panic_res {
                let msg = if let Some(s) = panic_err.downcast_ref::<&str>() {
                    (*s).to_string()
                } else if let Some(s) = panic_err.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unexpected panic in Direct3D 11 wallpaper thread".to_string()
                };
                log::error!("[Symvonia Wallpaper] Worker thread panic recovered: {}", msg);
                if let Ok(mut st) = WALLPAPER_STATE.lock() {
                    st.is_running = false;
                    st.state = "error".to_string();
                    st.last_error = Some(msg);
                }
            }

            if let Ok(mut st) = WALLPAPER_STATE.lock() {
                st.is_running = false;
                if st.state != "error" {
                    st.state = "stopped".to_string();
                }
            }
            if let Ok(mut tx_guard) = WORKER_TX.lock() {
                *tx_guard = None;
            }
            let _ = app_handle.emit("wallpaper-engine-stopped", ());
        })
        .map_err(|e| format!("Gagal membuat thread wallpaper engine: {}", e))?;

    match init_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(monitor_count)) => {
            if let Ok(mut st) = WALLPAPER_STATE.lock() {
                st.is_running = true;
                st.state = "playing".to_string();
                st.scene = "cover-reactive".to_string();
                st.fps = target_fps;
                st.intensity = target_intensity;
                st.texture_path = texture_path;
                st.fit_mode = target_fit;
                st.effect = target_effect;
                st.transition = target_transition;
                st.monitor_count = monitor_count;
                st.last_error = None;
            }
            if let Ok(mut tx_guard) = WORKER_TX.lock() {
                *tx_guard = Some(cmd_tx);
            }
            emit_state_snapshot(app);
            Ok(get_state())
        }
        Ok(Err(err)) => {
            if let Ok(mut st) = WALLPAPER_STATE.lock() {
                st.is_running = false;
                st.state = "error".to_string();
                st.last_error = Some(err.clone());
            }
            Err(err)
        }
        Err(_) => Err("Waktu inisialisasi Direct3D 11 Wallpaper Engine habis (timeout).".to_string()),
    }
}

#[allow(clippy::too_many_arguments)]
fn run_worker_loop(
    app: AppHandle,
    cmd_rx: Receiver<WorkerCmd>,
    init_tx: SyncSender<Result<i32, String>>,
    initial_fps: f64,
    initial_intensity: f64,
    initial_texture: Option<String>,
    initial_fit: String,
    initial_effect: String,
    initial_transition: String,
) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    let mut window_host = WindowHost::new();
    if let Err(e) = window_host.initialize() {
        let _ = init_tx.send(Err(e));
        unsafe { CoUninitialize() };
        return;
    }

    let mut renderer = Renderer::new();
    if let Err(e) = renderer.initialize() {
        window_host.destroy();
        let _ = init_tx.send(Err(e));
        unsafe { CoUninitialize() };
        return;
    }

    renderer.set_fit_mode(&initial_fit);
    renderer.set_effect(&initial_effect);
    renderer.set_transition(&initial_transition);

    for win in window_host.windows() {
        if let Err(e) = renderer.attach(win.handle) {
            renderer.release_resources();
            window_host.destroy();
            let _ = init_tx.send(Err(e));
            unsafe { CoUninitialize() };
            return;
        }
    }

    if let Some(ref tex_str) = initial_texture {
        let path = PathBuf::from(tex_str);
        if path.is_file() {
            let _ = renderer.set_texture(&path);
        }
    }

    let monitor_count = window_host.windows().len() as i32;
    let _ = init_tx.send(Ok(monitor_count));

    let mut fps = initial_fps;
    let mut intensity = initial_intensity as f32;
    let mut paused = false;
    let mut quit_requested = false;
    let mut stop_ack: Option<SyncSender<()>> = None;
    let mut elapsed_seconds = 0.0f32;
    let mut health_check_counter = 0u32;

    while !quit_requested {
        let frame_start = Instant::now();

        window_host.pump_messages(&mut quit_requested);
        if quit_requested {
            break;
        }

        // Proses seluruh perintah yang masuk dari antrean
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                WorkerCmd::Pause => {
                    paused = true;
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.state = "paused".to_string();
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::Resume => {
                    paused = false;
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.state = "playing".to_string();
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::SetTexture(path_str) => {
                    let path = PathBuf::from(&path_str);
                    if path.is_file() {
                        if let Err(e) = renderer.set_texture(&path) {
                            log::warn!("[Symvonia Wallpaper] set_texture gagal: {}", e);
                        } else {
                            if let Ok(mut st) = WALLPAPER_STATE.lock() {
                                st.texture_path = Some(path_str);
                                st.last_error = None;
                            }
                            emit_state_snapshot(&app);
                        }
                    }
                }
                WorkerCmd::SetFitMode(mode) => {
                    renderer.set_fit_mode(&mode);
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.fit_mode = renderer.fit_mode().to_string();
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::SetEffect(eff) => {
                    renderer.set_effect(&eff);
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.effect = renderer.effect().to_string();
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::SetTransition(tr) => {
                    renderer.set_transition(&tr);
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.transition = renderer.transition().to_string();
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::SetFps(new_fps) => {
                    fps = new_fps.clamp(1.0, 120.0);
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.fps = fps;
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::SetIntensity(new_int) => {
                    intensity = new_int.clamp(0.0, 2.0) as f32;
                    if let Ok(mut st) = WALLPAPER_STATE.lock() {
                        st.intensity = intensity as f64;
                    }
                    emit_state_snapshot(&app);
                }
                WorkerCmd::Stop(ack) => {
                    stop_ack = Some(ack);
                    quit_requested = true;
                    break;
                }
            }
        }

        if quit_requested {
            break;
        }

        // Periksa apakah resolusi monitor berubah atau Explorer baru saja di-restart
        health_check_counter = health_check_counter.wrapping_add(1);
        let need_rebuild = window_host.consume_display_change()
            || (health_check_counter % 60 == 0 && !window_host.is_host_alive());

        if need_rebuild {
            renderer.detach_all();
            if window_host.rebuild().is_ok() {
                for win in window_host.windows() {
                    let _ = renderer.attach(win.handle);
                }
                if let Ok(mut st) = WALLPAPER_STATE.lock() {
                    st.monitor_count = window_host.windows().len() as i32;
                }
                emit_state_snapshot(&app);
            }
        }

        if paused {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }

        let target_frame_duration = Duration::from_secs_f64(1.0 / fps.max(1.0));
        elapsed_seconds += target_frame_duration.as_secs_f32();

        let mut device_lost = false;
        let mut all_occluded = !window_host.windows().is_empty();

        for win in window_host.windows() {
            match renderer.render(win.handle, elapsed_seconds, intensity) {
                Ok(RenderOutcome::Presented) => {
                    all_occluded = false;
                }
                Ok(RenderOutcome::Occluded) => {}
                Ok(RenderOutcome::DeviceLost) => {
                    device_lost = true;
                    break;
                }
                Err(err) => {
                    log::warn!("[Symvonia Wallpaper] Render error: {}", err);
                    all_occluded = false;
                }
            }
        }

        // Auto-Recovery ketika terjadi GPU Crash / Driver Reset / Laptop Switch GPU
        if device_lost {
            log::warn!(
                "[Symvonia Wallpaper] DXGI Device Lost/Reset terdeteksi. Melakukan auto-recovery Direct3D 11..."
            );
            renderer.release_resources();
            std::thread::sleep(Duration::from_millis(500));

            if renderer.initialize().is_ok() && window_host.rebuild().is_ok() {
                for win in window_host.windows() {
                    let _ = renderer.attach(win.handle);
                }
                if let Ok(mut st) = WALLPAPER_STATE.lock() {
                    st.monitor_count = window_host.windows().len() as i32;
                    st.last_error = None;
                }
                emit_state_snapshot(&app);
                log::info!("[Symvonia Wallpaper] Auto-recovery Direct3D 11 berhasil.");
            } else {
                std::thread::sleep(Duration::from_millis(1000));
            }
            continue;
        }

        // Jika layar sedang terkunci/sleep (Occluded), hemat penggunaan GPU & baterai
        if all_occluded {
            std::thread::sleep(Duration::from_millis(200));
            continue;
        }

        let elapsed = frame_start.elapsed();
        if elapsed < target_frame_duration {
            std::thread::sleep(target_frame_duration - elapsed);
        }
    }

    renderer.release_resources();
    window_host.destroy();

    unsafe {
        CoUninitialize();
    }

    if let Some(ack) = stop_ack {
        let _ = ack.send(());
    }
}

pub fn stop_engine() {
    let tx_opt = WORKER_TX.lock().ok().and_then(|mut g| g.take());
    if let Some(tx) = tx_opt {
        let (ack_tx, ack_rx) = mpsc::sync_channel::<()>(1);
        if tx.send(WorkerCmd::Stop(ack_tx)).is_ok() {
            let _ = ack_rx.recv_timeout(Duration::from_secs(2));
        }
    }

    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.is_running = false;
        state.state = "stopped".to_string();
    }
}

fn send_worker_cmd(cmd: WorkerCmd) -> Result<(), String> {
    let guard = WORKER_TX
        .lock()
        .map_err(|e| format!("Gagal mengunci state wallpaper engine: {}", e))?;
    if let Some(ref tx) = *guard {
        tx.send(cmd)
            .map_err(|_| "Wallpaper engine sedang tidak berjalan.".to_string())
    } else {
        Err("Wallpaper engine sedang tidak berjalan.".to_string())
    }
}

pub fn pause_engine() -> Result<(), String> {
    send_worker_cmd(WorkerCmd::Pause)
}

pub fn resume_engine() -> Result<(), String> {
    send_worker_cmd(WorkerCmd::Resume)
}

pub fn set_texture(path: &str) -> Result<(), String> {
    send_worker_cmd(WorkerCmd::SetTexture(path.to_string()))
}

pub fn set_fit_mode(mode: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.fit_mode = mode.to_string();
    }
    send_worker_cmd(WorkerCmd::SetFitMode(mode.to_string()))
}

pub fn set_effect(effect: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.effect = effect.to_string();
    }
    send_worker_cmd(WorkerCmd::SetEffect(effect.to_string()))
}

pub fn set_transition(transition: &str) -> Result<(), String> {
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.transition = transition.to_string();
    }
    send_worker_cmd(WorkerCmd::SetTransition(transition.to_string()))
}

pub fn set_fps(fps: f64) -> Result<(), String> {
    let clamped = fps.clamp(1.0, 120.0);
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.fps = clamped;
    }
    send_worker_cmd(WorkerCmd::SetFps(clamped))
}

pub fn set_intensity(intensity: f64) -> Result<(), String> {
    let clamped = intensity.clamp(0.0, 2.0);
    if let Ok(mut state) = WALLPAPER_STATE.lock() {
        state.intensity = clamped;
    }
    send_worker_cmd(WorkerCmd::SetIntensity(clamped))
}
