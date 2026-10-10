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
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance, CoInitializeEx, COINIT_APARTMENTTHREADED};
#[cfg(windows)]
use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, eRender, eMultimedia};

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
            
            let _ = self.app_handle.emit("system-volume-changed", VolumeChangeEvent {
                volume: volume_pct.clamp(0, 100),
                muted: is_muted,
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
pub fn set_system_volume(value: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        unsafe {
            with_endpoint_volume(|endpoint| {
                let pct = value.clamp(0, 100) as f32 / 100.0;
                endpoint
                    .SetMasterVolumeLevelScalar(pct, std::ptr::null())
                    .map_err(|e| format!("SetMasterVolumeLevelScalar failed: {}", e))
            })
        }
    }
    #[cfg(not(windows))]
    {
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
pub fn set_system_mute(mute: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        unsafe {
            with_endpoint_volume(|endpoint| {
                endpoint
                    .SetMute(windows::Win32::Foundation::BOOL::from(mute), std::ptr::null())
                    .map_err(|e| format!("SetMute failed: {}", e))
            })
        }
    }
    #[cfg(not(windows))]
    {
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
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let enumerator: IMMDeviceEnumerator = match CoCreateInstance(
                &MMDeviceEnumerator,
                None,
                CLSCTX_INPROC_SERVER,
            ) {
                Ok(e) => e,
                Err(_) => return,
            };

            let device = match enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                Ok(d) => d,
                Err(_) => return,
            };

            let endpoint: IAudioEndpointVolume = match device.Activate(CLSCTX_INPROC_SERVER, None) {
                Ok(e) => e,
                Err(_) => return,
            };

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
pub async fn pick_audio_file() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Pilih file audio")
        .add_filter("Audio", &["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pick_single_file(
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
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
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

