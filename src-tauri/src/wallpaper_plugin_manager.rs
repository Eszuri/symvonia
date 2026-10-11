use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn cancel_download() {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

pub const PLUGIN_DOWNLOAD_URL: &str =
    "https://github.com/Eszuri/symvonia/releases/latest/download/symvonia-wallpaper-engine.exe";

pub const PLUGIN_EXPECTED_SHA256: &str = match option_env!("SYMVONIA_WALLPAPER_PLUGIN_SHA256") {
    Some(value) => value,
    None => "",
};

pub const PLUGIN_EXE_NAME: &str = "symvonia-wallpaper-engine.exe";

fn default_plugin_download_url() -> String {
    match option_env!("SYMVONIA_PLUGIN_RELEASE_TAG") {
        Some(tag) if !tag.is_empty() => format!(
            "https://github.com/Eszuri/symvonia/releases/download/{tag}/{PLUGIN_EXE_NAME}"
        ),
        _ => PLUGIN_DOWNLOAD_URL.to_string(),
    }
}

fn verify_download_hash(path: &Path, expected: &str) -> Result<(), String> {
    if expected.is_empty() {
        return Ok(());
    }
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Configured plugin SHA-256 must contain exactly 64 hexadecimal characters.".into());
    }

    let actual = compute_sha256(&path.to_path_buf())?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(format!(
            "Hash mismatch. Expected {}, got {}. The file may be corrupted or tampered with.",
            expected, actual
        ));
    }
    Ok(())
}

#[derive(Serialize, Clone, Debug)]
pub struct PluginStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

/// Directory where the Wallpaper Engine plugin lives: <app_data>/plugins/wallpaper-engine/
pub fn plugin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(base.join("plugins").join("wallpaper-engine"))
}

pub fn plugin_exe_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(plugin_dir(app)?.join(PLUGIN_EXE_NAME))
}

pub fn plugin_shaders_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(plugin_dir(app)?.join("shaders"))
}

fn write_bundled_shaders(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create shader directory: {e}"))?;
    for (name, source) in [
        ("fullscreen_vs.hlsl", include_bytes!("../../plugin/src-wallpaper-engine/shaders/fullscreen_vs.hlsl").as_slice()),
        ("cover_reactive_ps.hlsl", include_bytes!("../../plugin/src-wallpaper-engine/shaders/cover_reactive_ps.hlsl").as_slice()),
    ] {
        fs::write(dir.join(name), source)
            .map_err(|e| format!("Failed to install shader {name}: {e}"))?;
    }
    Ok(())
}

pub fn ensure_bundled_shaders(app: &AppHandle) -> Result<(), String> {
    write_bundled_shaders(&plugin_shaders_dir(app)?)
}

pub fn get_status(app: &AppHandle) -> Result<PluginStatus, String> {
    let exe = plugin_exe_path(app)?;
    if !exe.exists() {
        return Ok(PluginStatus {
            installed: false,
            path: None,
            size_bytes: None,
            sha256: None,
        });
    }
    let size = fs::metadata(&exe).ok().map(|m| m.len());
    Ok(PluginStatus {
        installed: true,
        path: Some(exe.to_string_lossy().to_string()),
        size_bytes: size,
        sha256: None,
    })
}

pub fn compute_sha256(path: &PathBuf) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Failed to open exe: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("Failed to read exe: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>())
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn validate_plugin_file(src: &Path) -> Result<(), String> {
    if !src.is_file() {
        return Err(format!(
            "Berkas plugin tidak ditemukan atau bukan file biasa: {}",
            src.display()
        ));
    }
    Ok(())
}

fn validate_manual_import_source(src: &Path) -> Result<(), String> {
    validate_plugin_file(src)?;
    if !src.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("exe")) {
        return Err("Berkas plugin harus berekstensi .exe.".into());
    }
    Ok(())
}

pub fn verify_plugin_executable(src: &Path) -> Result<(), String> {
    validate_plugin_file(src)?;

    let meta = fs::metadata(src).map_err(|e| format!("Gagal membaca metadata berkas: {}", e))?;
    let len = meta.len();
    if !(50 * 1024..=500 * 1024 * 1024).contains(&len) {
        return Err(format!(
            "Ukuran berkas ({:.2} MB) tidak valid untuk plugin Symvonia Wallpaper Engine.",
            len as f64 / (1024.0 * 1024.0)
        ));
    }

    let mut file = fs::File::open(src).map_err(|e| format!("Gagal membuka berkas: {}", e))?;
    let mut header = [0u8; 512];
    let n = file.read(&mut header).map_err(|e| format!("Gagal membaca header berkas: {}", e))?;
    if n < 64 || &header[0..2] != b"MZ" {
        return Err("Berkas bukan merupakan executable Windows yang valid (Missing MZ header).".into());
    }

    let pe_offset = u32::from_le_bytes([header[60], header[61], header[62], header[63]]) as usize;
    if pe_offset + 4 > n || &header[pe_offset..pe_offset + 4] != b"PE\0\0" {
        return Err("Berkas bukan merupakan PE Executable Windows yang valid (Missing PE signature).".into());
    }

    let mut command = Command::new(src);
    command
        .arg("--help")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    if let Ok(mut child) = command.spawn() {
        if let Some(stdout) = child.stdout.take() {
            use std::io::BufRead;
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = String::new();
            let start = std::time::Instant::now();
            while start.elapsed().as_millis() < 4000 {
                if reader.read_line(&mut line).unwrap_or(0) > 0 {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            let _ = child.kill();
            if line.contains("Wallpaper Engine") || line.contains("Symvonia") {
                return Ok(());
            }
        } else {
            let _ = child.kill();
        }
    }

    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileFingerprint {
    pub path: PathBuf,
    pub size: u64,
    pub modified: std::time::SystemTime,
}

static VERIFIED_CACHE: Mutex<Option<FileFingerprint>> = Mutex::new(None);

pub fn invalidate_cache() {
    if let Ok(mut guard) = VERIFIED_CACHE.lock() {
        *guard = None;
    }
}

pub fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

pub fn verify_with_cache(path: &Path) -> Result<(), String> {
    if is_dev_mode() {
        return Ok(());
    }

    let meta = fs::metadata(path)
        .map_err(|e| format!("Gagal membaca metadata berkas plugin ({}): {}", path.display(), e))?;
    let size = meta.len();
    let modified = meta
        .modified()
        .map_err(|e| format!("Gagal membaca timestamp berkas plugin: {}", e))?;

    if let Ok(guard) = VERIFIED_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            if cached.path == path && cached.size == size && cached.modified == modified {
                return Ok(());
            }
        }
    }

    verify_plugin_executable(path)?;

    if let Ok(mut guard) = VERIFIED_CACHE.lock() {
        *guard = Some(FileFingerprint {
            path: path.to_path_buf(),
            size,
            modified,
        });
    }

    Ok(())
}

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn kill_existing_plugin_process() {
    crate::sidecar_wallpaper::stop_engine();
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/F", "/IM", "symvonia-wallpaper-engine.exe", "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.status();
    }
}

pub fn download_and_install(app: &AppHandle, url: Option<String>) -> Result<PluginStatus, String> {
    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
    let url = url.unwrap_or_else(default_plugin_download_url);
    let dir = plugin_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create plugin dir: {}", e))?;

    let tmp_path = dir.join(format!("{}.download", PLUGIN_EXE_NAME));
    let final_path = dir.join(PLUGIN_EXE_NAME);

    let response = match ureq::get(&url).call() {
        Ok(res) => res,
        Err(e) => {
            let candidate_paths = [
                PathBuf::from("plugin/src-wallpaper-engine/publish/symvonia-wallpaper-engine.exe"),
                PathBuf::from("../plugin/src-wallpaper-engine/publish/symvonia-wallpaper-engine.exe"),
                PathBuf::from("../../plugin/src-wallpaper-engine/publish/symvonia-wallpaper-engine.exe"),
            ];
            for candidate in &candidate_paths {
                if candidate.exists() {
                    if let Ok(status) = install_from_file(app, &candidate.to_string_lossy()) {
                        return Ok(status);
                    }
                }
            }
            return Err(format!("Download failed: {}", e));
        }
    };

    let total: u64 = response
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut reader = response.into_reader();
    let mut file = fs::File::create(&tmp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 65536];
    let mut last_emit = std::time::Instant::now();
    loop {
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            drop(file);
            let _ = fs::remove_file(&tmp_path);
            let _ = app.emit(
                "wallpaper-download-progress",
                DownloadProgress { downloaded: 0, total: 0 },
            );
            return Err("Pengunduhan plugin Wallpaper Engine dibatalkan oleh pengguna.".into());
        }

        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                drop(file);
                let _ = fs::remove_file(&tmp_path);
                return Err(format!("Download stream error: {}", e));
            }
        };

        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            drop(file);
            let _ = fs::remove_file(&tmp_path);
            let _ = app.emit(
                "wallpaper-download-progress",
                DownloadProgress { downloaded: 0, total: 0 },
            );
            return Err("Pengunduhan plugin Wallpaper Engine dibatalkan oleh pengguna.".into());
        }

        file.write_all(&buf[..n])
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        downloaded += n as u64;
        if last_emit.elapsed().as_millis() >= 100 {
            last_emit = std::time::Instant::now();
            let _ = app.emit(
                "wallpaper-download-progress",
                DownloadProgress { downloaded, total },
            );
        }
    }

    if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
        drop(file);
        let _ = fs::remove_file(&tmp_path);
        return Err("Pengunduhan plugin Wallpaper Engine dibatalkan oleh pengguna.".into());
    }

    file.flush().ok();
    drop(file);
    let _ = app.emit(
        "wallpaper-download-progress",
        DownloadProgress { downloaded, total },
    );

    if total > 0 && downloaded != total {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "Incomplete download: got {} of {} bytes",
            downloaded, total
        ));
    }

    if let Err(error) = verify_download_hash(&tmp_path, PLUGIN_EXPECTED_SHA256) {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }
    if let Err(error) = verify_plugin_executable(&tmp_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }

    ensure_bundled_shaders(app)?;
    kill_existing_plugin_process();
    invalidate_cache();
    let _ = fs::remove_file(&final_path);
    fs::rename(&tmp_path, &final_path)
        .map_err(|e| format!("Failed to move plugin into place: {}", e))?;
    let _ = verify_with_cache(&final_path);

    get_status(app)
}

pub fn install_from_file(app: &AppHandle, source: &str) -> Result<PluginStatus, String> {
    let src = PathBuf::from(source);
    validate_manual_import_source(&src)?;

    if !is_dev_mode() {
        verify_download_hash(&src, PLUGIN_EXPECTED_SHA256)?;
        verify_plugin_executable(&src)?;
    }

    kill_existing_plugin_process();
    invalidate_cache();

    let dir = plugin_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create plugin dir: {}", e))?;
    let dest = dir.join(PLUGIN_EXE_NAME);
    fs::copy(&src, &dest).map_err(|e| format!("Failed to copy plugin exe: {}", e))?;

    if let Some(parent) = src.parent() {
        let shaders_src = parent.join("shaders");
        if shaders_src.exists() && shaders_src.is_dir() {
            let shaders_dst = dir.join("shaders");
            let _ = copy_dir_all(&shaders_src, &shaders_dst);
        } else {
            let fallback_shaders = [
                PathBuf::from("plugin/src-wallpaper-engine/shaders"),
                PathBuf::from("../plugin/src-wallpaper-engine/shaders"),
                PathBuf::from("../../plugin/src-wallpaper-engine/shaders"),
            ];
            for candidate in &fallback_shaders {
                if candidate.exists() && candidate.is_dir() {
                    let shaders_dst = dir.join("shaders");
                    let _ = copy_dir_all(candidate, &shaders_dst);
                    break;
                }
            }
        }

        let manifest_src = parent.join("manifest.json");
        if manifest_src.exists() {
            let _ = fs::copy(&manifest_src, dir.join("manifest.json"));
        }
    }

    let _ = verify_with_cache(&dest);
    get_status(app)
}

pub fn uninstall(app: &AppHandle) -> Result<(), String> {
    kill_existing_plugin_process();
    invalidate_cache();
    let exe = plugin_exe_path(app)?;
    if exe.exists() {
        fs::remove_file(&exe).map_err(|e| format!("Failed to remove plugin: {}", e))?;
    }
    let shaders_dir = plugin_dir(app)?.join("shaders");
    if shaders_dir.exists() {
        let _ = fs::remove_dir_all(&shaders_dir);
    }
    let manifest_file = plugin_dir(app)?.join("manifest.json");
    if manifest_file.exists() {
        let _ = fs::remove_file(&manifest_file);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_shaders_repair_an_exe_only_installation() {
        let dir = std::env::temp_dir().join(format!("symvonia-shaders-{}", std::process::id()));
        let shaders = dir.join("shaders");
        write_bundled_shaders(&shaders).unwrap();
        for name in ["fullscreen_vs.hlsl", "cover_reactive_ps.hlsl"] {
            assert!(fs::read_to_string(shaders.join(name)).unwrap().contains("main("));
        }
        fs::write(shaders.join("fullscreen_vs.hlsl"), b"outdated").unwrap();
        fs::remove_file(shaders.join("cover_reactive_ps.hlsl")).unwrap();
        write_bundled_shaders(&shaders).unwrap();
        assert_ne!(fs::read(shaders.join("fullscreen_vs.hlsl")).unwrap(), b"outdated");
        assert!(shaders.join("cover_reactive_ps.hlsl").is_file());
        fs::remove_dir_all(dir).unwrap();
    }
}
