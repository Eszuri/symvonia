#[cfg(windows)]
pub mod engine;
#[cfg(windows)]
pub mod renderer;
#[cfg(windows)]
pub mod window_host;

#[cfg(windows)]
pub use engine::{
    get_state, is_running, pause_engine, resume_engine, set_effect, set_fit_mode, set_fps,
    set_intensity, set_texture, set_transition, start_engine, stop_engine, WallpaperEngineState,
};

#[cfg(not(windows))]
mod stub {
    use serde::{Deserialize, Serialize};
    use tauri::AppHandle;

    #[derive(Serialize, Deserialize, Clone, Debug, Default)]
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

    pub fn get_state() -> WallpaperEngineState {
        WallpaperEngineState::default()
    }
    pub fn is_running() -> bool {
        false
    }
    pub fn start_engine(
        _app: &AppHandle,
        _fps: Option<f64>,
        _intensity: Option<f64>,
        _texture_path: Option<String>,
        _fit_mode: Option<String>,
        _effect: Option<String>,
        _transition: Option<String>,
    ) -> Result<WallpaperEngineState, String> {
        Err("Direct3D 11 Wallpaper Engine hanya tersedia di Windows.".to_string())
    }
    pub fn stop_engine() {}
    pub fn pause_engine() -> Result<(), String> {
        Ok(())
    }
    pub fn resume_engine() -> Result<(), String> {
        Ok(())
    }
    pub fn set_texture(_path: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn set_fit_mode(_mode: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn set_effect(_effect: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn set_transition(_transition: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn set_fps(_fps: f64) -> Result<(), String> {
        Ok(())
    }
    pub fn set_intensity(_intensity: f64) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(not(windows))]
pub use stub::*;
