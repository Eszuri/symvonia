use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use windows::core::implement;
#[cfg(windows)]
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
#[cfg(windows)]
use windows::Win32::Media::Audio::AUDIO_VOLUME_NOTIFICATION_DATA;
#[cfg(windows)]
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance, CoInitializeEx, COINIT_MULTITHREADED};
#[cfg(windows)]
use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, eRender, eMultimedia};

#[cfg(windows)]
#[cfg(windows)]
#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn SetWindowPos(
        hwnd: *mut std::ffi::c_void,
        hwnd_insert_after: *mut std::ffi::c_void,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        u_flags: u32,
    ) -> i32;

    fn ShowWindow(hwnd: *mut std::ffi::c_void, n_cmd_show: i32) -> i32;
    fn IsWindowVisible(hwnd: *mut std::ffi::c_void) -> i32;
    fn SystemParametersInfoW(uiAction: u32, uiParam: u32, pvParam: *mut std::ffi::c_void, fWinIni: u32) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
}

#[cfg(windows)]
const SPI_GETWORKAREA: u32 = 0x0030;
#[cfg(windows)]
const SM_CXSCREEN: i32 = 0;
#[cfg(windows)]
const SM_CYSCREEN: i32 = 1;

#[cfg(windows)]
const HWND_TOPMOST: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;
#[cfg(windows)]
const SWP_NOACTIVATE: u32 = 0x0010;
#[cfg(windows)]
const SWP_SHOWWINDOW: u32 = 0x0040;
#[cfg(windows)]
const SW_HIDE: i32 = 0;
#[cfg(windows)]
const SWP_NOZORDER: u32 = 0x0004;

pub fn calculate_overlay_bounds(app: &AppHandle) -> (i32, i32, i32, i32) {
    let config = crate::commands::config::load_config(app);
    let (w, h) = match config.overlay_size.as_str() {
        "s" => (280, 115),
        "l" => (400, 160),
        "xl" => (460, 180),
        _ => (340, 140),
    };

    #[cfg(windows)]
    {
        let mut rc = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        let ok = unsafe {
            SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut rc as *mut _ as *mut std::ffi::c_void, 0)
        };
        let (work_left, work_top, work_right, work_bottom) = if ok != 0 {
            (rc.left, rc.top, rc.right, rc.bottom)
        } else {
            let cx = unsafe { GetSystemMetrics(SM_CXSCREEN) }.max(800);
            let cy = unsafe { GetSystemMetrics(SM_CYSCREEN) }.max(600);
            (0, 0, cx, cy - 40)
        };

        let margin = 20;
        let x = match config.overlay_position.as_str() {
            "top_center" | "bottom_center" => work_left + (work_right - work_left - w) / 2,
            "top_right" | "bottom_right" => work_right - w - margin,
            _ => work_left + margin,
        };
        let y = match config.overlay_position.as_str() {
            "bottom_left" | "bottom_center" | "bottom_right" => work_bottom - h - margin,
            _ => work_top + margin,
        };

        (x, y, w, h)
    }

    #[cfg(not(windows))]
    {
        (20, 20, w, h)
    }
}

#[cfg(windows)]
static VOLUME_CALLBACK_REGISTERED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
#[derive(Serialize, Clone)]
struct VolumeChangeEvent {
    volume: u32,
    muted: bool,
}

#[cfg(windows)]
#[implement(IAudioEndpointVolumeCallback)]
struct VolumeCallback {
    app_handle: AppHandle,
}

#[cfg(windows)]
#[allow(non_snake_case)]
impl IAudioEndpointVolumeCallback_Impl for VolumeCallback_Impl {
    fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
        unsafe {
            if pnotify.is_null() {
                return Ok(());
            }
            
            let notification = &*pnotify;
            let volume_pct = (notification.fMasterVolume * 100.0).round() as u32;
            let is_muted = notification.bMuted.as_bool();
            let vol_clamped = volume_pct.clamp(0, 100);
            
            let _ = self.app_handle.emit("system-volume-changed", VolumeChangeEvent {
                volume: vol_clamped,
                muted: is_muted,
            });

            let handle = self.app_handle.clone();
            let _ = self.app_handle.run_on_main_thread(move || {
                let config = crate::commands::config::load_config(&handle);
                if !config.overlay_enabled {
                    return;
                }
                if let Some(overlay) = handle.get_webview_window("media-overlay") {
                    let (x, y, w, h) = calculate_overlay_bounds(&handle);
                    if let Ok(hwnd) = overlay.hwnd() {
                        if IsWindowVisible(hwnd.0 as *mut _) == 0 {
                            SetWindowPos(
                                hwnd.0 as *mut _,
                                HWND_TOPMOST,
                                x,
                                y,
                                w,
                                h,
                                SWP_SHOWWINDOW | SWP_NOACTIVATE,
                            );
                        }
                    } else {
                        let _ = overlay.unminimize();
                        let _ = overlay.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w as f64, height: h as f64 }));
                        let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
                        let _ = overlay.show();
                        let _ = overlay.set_always_on_top(true);
                    }
                }
            });
        }
        Ok(())
    }
}

#[cfg(windows)]
struct VolumeCallbackWrapper {
    callback: IAudioEndpointVolumeCallback,
    endpoint: IAudioEndpointVolume,
}

#[cfg(windows)]
impl Drop for VolumeCallbackWrapper {
    fn drop(&mut self) {
        unsafe {
            let _ = self.endpoint.UnregisterControlChangeNotify(&self.callback);
        }
    }
}

#[cfg(windows)]
unsafe fn with_endpoint_volume<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> Result<T, String>,
{
    let _ = windows::Win32::System::Com::CoInitializeEx(
        None,
        windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
    );

    let enumerator: windows::Win32::Media::Audio::IMMDeviceEnumerator =
        windows::Win32::System::Com::CoCreateInstance(
            &windows::Win32::Media::Audio::MMDeviceEnumerator,
            None,
            windows::Win32::System::Com::CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| format!("CoCreateInstance IMMDeviceEnumerator failed: {}", e))?;

    let device = enumerator
        .GetDefaultAudioEndpoint(
            windows::Win32::Media::Audio::eRender,
            windows::Win32::Media::Audio::eMultimedia,
        )
        .map_err(|e| format!("GetDefaultAudioEndpoint failed: {}", e))?;

    let endpoint: windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume = device
        .Activate(
            windows::Win32::System::Com::CLSCTX_INPROC_SERVER,
            None,
        )
        .map_err(|e| format!("Activate IAudioEndpointVolume failed: {}", e))?;

    f(&endpoint)
}

#[tauri::command]
pub fn get_system_volume() -> Result<u32, String> {
    #[cfg(windows)]
    {
        unsafe {
            with_endpoint_volume(|endpoint| {
                let level = endpoint
                    .GetMasterVolumeLevelScalar()
                    .map_err(|e| format!("GetMasterVolumeLevelScalar failed: {}", e))?;
                let pct = (level as f64 * 100.0).round() as u32;
                Ok(pct.clamp(0, 100))
            })
        }
    }
    #[cfg(not(windows))]
    {
        Err("System volume only available on Windows".to_string())
    }
}

#[tauri::command]
pub fn set_system_volume(app: AppHandle, value: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        unsafe {
            with_endpoint_volume(|endpoint| {
                let pct = value.clamp(0, 100) as f32 / 100.0;
                endpoint
                    .SetMasterVolumeLevelScalar(pct, std::ptr::null())
                    .map_err(|e| format!("SetMasterVolumeLevelScalar failed: {}", e))
            })?;
        }

        let config = crate::commands::config::load_config(&app);
        if config.overlay_enabled {
            let _ = show_media_overlay(app.clone());
        }
        let _ = app.emit("system-volume-changed", VolumeChangeEvent {
            volume: value.clamp(0, 100),
            muted: value == 0,
        });

        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = value;
        Err("System volume only available on Windows".to_string())
    }
}

#[tauri::command]
pub fn get_system_mute() -> Result<bool, String> {
    #[cfg(windows)]
    {
        unsafe {
            with_endpoint_volume(|endpoint| {
                let muted = endpoint
                    .GetMute()
                    .map_err(|e| format!("GetMute failed: {}", e))?;
                Ok(muted.as_bool())
            })
        }
    }
    #[cfg(not(windows))]
    {
        Err("System mute only available on Windows".to_string())
    }
}

#[tauri::command]
pub fn set_system_mute(app: AppHandle, mute: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let current_vol = get_system_volume().unwrap_or(0);
        unsafe {
            with_endpoint_volume(|endpoint| {
                endpoint
                    .SetMute(windows::Win32::Foundation::BOOL::from(mute), std::ptr::null())
                    .map_err(|e| format!("SetMute failed: {}", e))
            })?;
        }

        let config = crate::commands::config::load_config(&app);
        if config.overlay_enabled {
            let _ = show_media_overlay(app.clone());
        }
        let _ = app.emit("system-volume-changed", VolumeChangeEvent {
            volume: current_vol,
            muted: mute,
        });

        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = mute;
        Err("System mute only available on Windows".to_string())
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn register_volume_callback(app: AppHandle) -> Result<(), String> {
    if VOLUME_CALLBACK_REGISTERED.load(Ordering::SeqCst) {
        return Ok(());
    }

    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            for _attempt in 0..20 {
                if VOLUME_CALLBACK_REGISTERED.load(Ordering::SeqCst) {
                    return;
                }

                let enumerator: Result<IMMDeviceEnumerator, _> = CoCreateInstance(
                    &MMDeviceEnumerator,
                    None,
                    CLSCTX_INPROC_SERVER,
                );

                if let Ok(enumerator) = enumerator {
                    if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                        if let Ok(endpoint) = device.Activate::<IAudioEndpointVolume>(CLSCTX_INPROC_SERVER, None) {
                            let callback_impl = VolumeCallback {
                                app_handle: app.clone(),
                            };
                            let callback: IAudioEndpointVolumeCallback = callback_impl.into();

                            if endpoint.RegisterControlChangeNotify(&callback).is_ok() {
                                VOLUME_CALLBACK_REGISTERED.store(true, Ordering::SeqCst);
                                
                                let _ = Box::leak(Box::new(VolumeCallbackWrapper {
                                    callback,
                                    endpoint,
                                }));

                                loop {
                                    std::thread::sleep(Duration::from_secs(1));
                                    if !VOLUME_CALLBACK_REGISTERED.load(Ordering::SeqCst) {
                                        break;
                                    }
                                }
                                return;
                            }
                        }
                    }
                }

                std::thread::sleep(Duration::from_millis(250));
            }
        }
    });

    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn register_volume_callback(_app: AppHandle) -> Result<(), String> {
    Err("Volume callback only available on Windows".to_string())
}

#[cfg(windows)]
#[tauri::command]
pub fn unregister_volume_callback() -> Result<(), String> {
    VOLUME_CALLBACK_REGISTERED.store(false, Ordering::SeqCst);
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn unregister_volume_callback() -> Result<(), String> {
    Err("Volume callback only available on Windows".to_string())
}

#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Pilih folder musik")
        .pick_folder()
        .await;

    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pick_audio_file(app: AppHandle) -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Pilih file audio")
        .add_filter("Audio", &["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma"])
        .pick_file()
        .await;
    Ok(file.map(|f| {
        app.state::<crate::media_access::MediaAccess>().allow_file(f.path());
        f.path().to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub async fn pick_single_file(
    app: AppHandle,
    title: Option<String>,
    filters: Option<Vec<serde_json::Value>>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_title(title.as_deref().unwrap_or("Pilih file"));

    if let Some(filters) = filters {
        for f in &filters {
            let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("File");
            let exts: Vec<&str> = f
                .get("extensions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_str()).collect())
                .unwrap_or_default();
            if !exts.is_empty() {
                dialog = dialog.add_filter(name, &exts);
            }
        }
    }

    let file = dialog.pick_file().await;
    Ok(file.map(|f| {
        app.state::<crate::media_access::MediaAccess>().allow_file(f.path());
        f.path().to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("Main webview window not found".to_string())
    }
}

fn validate_external_url(url: &str) -> Result<(), String> {
    let parsed = tauri::Url::parse(url).map_err(|_| "Invalid external URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" if parsed.host().is_some() => Ok(()),
        _ => Err("Only http and https URLs are allowed".to_string()),
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new("rundll32.exe");
        cmd.args(["url.dll,FileProtocolHandler", &url]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
            .map_err(|e| format!("Failed to open external URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open external URL: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod url_tests {
    use super::validate_external_url;

    #[test]
    fn accepts_http_and_https_urls() {
        assert!(validate_external_url("https://example.com/path").is_ok());
        assert!(validate_external_url("http://localhost:3000").is_ok());
    }

    #[test]
    fn rejects_non_http_schemes_and_invalid_urls() {
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///C:/secret.txt").is_err());
        assert!(validate_external_url("not-a-url").is_err());
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(non_snake_case)]
pub struct SystemSpecsInfo {
    pub cpuCores: usize,
    pub cpuThreads: usize,
    pub ramGb: usize,
    pub cpuName: String,
    pub gpuName: String,
}

#[cfg(windows)]
#[repr(C)]
#[allow(non_snake_case)]
struct MEMORYSTATUSEX {
    dwLength: u32,
    dwMemoryLoad: u32,
    ullTotalPhys: u64,
    ullAvailPhys: u64,
    ullTotalPageFile: u64,
    ullAvailPageFile: u64,
    ullTotalVirtual: u64,
    ullAvailVirtual: u64,
    ullAvailExtendedVirtual: u64,
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GlobalMemoryStatusEx(lpBuffer: *mut MEMORYSTATUSEX) -> i32;
}

#[cfg(windows)]
#[link(name = "advapi32")]
extern "system" {
    fn RegGetValueW(
        hkey: isize,
        lpSubKey: *const u16,
        lpValue: *const u16,
        dwFlags: u32,
        pdwType: *mut u32,
        pvData: *mut u8,
        pcbData: *mut u32,
    ) -> i32;
}

#[cfg(windows)]
fn read_reg_string(hkey: isize, subkey: &str, value_name: &str) -> Option<String> {
    let subkey_utf16: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
    let value_utf16: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = [0u16; 256];
    let mut buf_len = (buf.len() * 2) as u32;
    let mut val_type = 0u32;
    // RRF_RT_REG_SZ (0x00000002) | RRF_RT_REG_EXPAND_SZ (0x00000004)
    let status = unsafe {
        RegGetValueW(
            hkey,
            subkey_utf16.as_ptr(),
            value_utf16.as_ptr(),
            0x00000002 | 0x00000004,
            &mut val_type,
            buf.as_mut_ptr() as *mut u8,
            &mut buf_len,
        )
    };
    if status == 0 {
        let len = (buf_len / 2) as usize;
        let slice = if len > 0 && buf[len - 1] == 0 {
            &buf[..len - 1]
        } else {
            &buf[..len]
        };
        let s = String::from_utf16_lossy(slice).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    None
}

#[cfg(windows)]
fn detect_ram_gb() -> usize {
    let mut mem_status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        dwMemoryLoad: 0,
        ullTotalPhys: 0,
        ullAvailPhys: 0,
        ullTotalPageFile: 0,
        ullAvailPageFile: 0,
        ullTotalVirtual: 0,
        ullAvailVirtual: 0,
        ullAvailExtendedVirtual: 0,
    };
    if unsafe { GlobalMemoryStatusEx(&mut mem_status) } != 0 {
        let gb = ((mem_status.ullTotalPhys + 536_870_912) / (1024 * 1024 * 1024)) as usize;
        if gb > 0 {
            return gb;
        }
    }
    8
}

#[cfg(windows)]
fn detect_cpu_name() -> Option<String> {
    read_reg_string(
        -2147483646, // HKEY_LOCAL_MACHINE
        "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
        "ProcessorNameString",
    )
}

#[cfg(windows)]
fn detect_gpu_name() -> Option<String> {
    for i in 0..4 {
        let key = format!(
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{{4d36e968-e325-11ce-bfc1-08002be10318}}\\{:04}",
            i
        );
        if let Some(gpu) = read_reg_string(-2147483646, &key, "DriverDesc") {
            let lower = gpu.to_lowercase();
            if !lower.contains("basic display") && !lower.contains("rdp") && !gpu.is_empty() {
                return Some(gpu);
            }
        }
    }
    read_reg_string(
        -2147483646,
        "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000",
        "DriverDesc",
    )
}

#[cfg(not(windows))]
fn detect_ram_gb() -> usize {
    8
}

#[cfg(not(windows))]
fn detect_cpu_name() -> Option<String> {
    None
}

#[cfg(not(windows))]
fn detect_gpu_name() -> Option<String> {
    None
}

static CACHED_SPECS: std::sync::OnceLock<SystemSpecsInfo> = std::sync::OnceLock::new();

#[tauri::command]
pub fn get_system_specs() -> SystemSpecsInfo {
    CACHED_SPECS
        .get_or_init(|| {
            let cpu_threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
            let mut cpu_cores = cpu_threads.div_ceil(2);
            if cpu_cores == 0 {
                cpu_cores = 1;
            }
            let ram_gb = detect_ram_gb();
            let cpu_name = detect_cpu_name().unwrap_or_else(|| "Processor CPU".to_string());
            let gpu_name = detect_gpu_name().unwrap_or_else(|| "Graphics GPU".to_string());

            SystemSpecsInfo {
                cpuCores: cpu_cores,
                cpuThreads: cpu_threads,
                ramGb: ram_gb,
                cpuName: cpu_name,
                gpuName: gpu_name,
            }
        })
        .clone()
}

#[derive(Serialize, Clone, Debug)]
pub struct AppEnvironmentInfo {
    pub is_dev: bool,
    pub environment: String,
}

#[tauri::command]
pub fn get_app_environment() -> AppEnvironmentInfo {
    let is_dev = cfg!(debug_assertions);
    AppEnvironmentInfo {
        is_dev,
        environment: if is_dev {
            "development".to_string()
        } else {
            "production".to_string()
        },
    }
}

#[tauri::command]
pub fn show_media_overlay(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("media-overlay") {
            let (x, y, w, h) = calculate_overlay_bounds(&handle);
            #[cfg(windows)]
            {
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        if IsWindowVisible(hwnd.0 as *mut _) == 0 {
                            SetWindowPos(
                                hwnd.0 as *mut _,
                                HWND_TOPMOST,
                                x,
                                y,
                                w,
                                h,
                                SWP_SHOWWINDOW | SWP_NOACTIVATE,
                            );
                        }
                        return;
                    }
                }
            }
            let _ = window.unminimize();
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w as f64, height: h as f64 }));
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
            let _ = window.show();
            let _ = window.set_always_on_top(true);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn update_media_overlay_bounds(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("media-overlay") {
            let (x, y, w, h) = calculate_overlay_bounds(&handle);
            #[cfg(windows)]
            {
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        SetWindowPos(
                            hwnd.0 as *mut _,
                            HWND_TOPMOST,
                            x,
                            y,
                            w,
                            h,
                            SWP_NOACTIVATE | SWP_NOZORDER,
                        );
                        return;
                    }
                }
            }
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w as f64, height: h as f64 }));
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
        }
    });
    Ok(())
}

#[tauri::command]
pub fn hide_media_overlay(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("media-overlay") {
            #[cfg(windows)]
            {
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        ShowWindow(hwnd.0 as *mut _, SW_HIDE);
                        return;
                    }
                }
            }
            let _ = window.hide();
        }
    });
    Ok(())
}


