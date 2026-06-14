use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

use base64::Engine;
use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::read_from_path;
use lofty::tag::Accessor;
use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Url};

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

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    ext: String,
    mtime: u64,
    size: u64,
    ctime: u64,
}

static RESET_ON_CLOSE: AtomicBool = AtomicBool::new(true);
static DEFAULT_WALLPAPER_PATH: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn set_reset_on_close(enabled: bool) {
    RESET_ON_CLOSE.store(enabled, Ordering::SeqCst);
}

#[derive(Serialize)]
struct SongMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    cover_b64: Option<String>,
    cover_mime: Option<String>,
    genre: Option<String>,
    year: Option<u32>,
    track_number: Option<u32>,
    total_tracks: Option<u32>,
    disc_number: Option<u32>,
    total_discs: Option<u32>,
    comment: Option<String>,
    bitrate: Option<u32>,
    sample_rate: Option<u32>,
    channels: Option<u8>,
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Pilih folder musik")
        .pick_folder()
        .await;

    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn pick_wallpaper() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Pilih gambar wallpaper default")
        .add_filter("Images", &["png", "jpg", "jpeg", "bmp", "webp"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn set_default_wallpaper_path(path: Option<String>) -> Result<(), String> {
    let mut guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    *guard = path;
    Ok(())
}

#[tauri::command]
fn get_default_wallpaper_path() -> Result<Option<String>, String> {
    let guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn list_files(
    path: String,
    folder_sort: String,
    file_sort: String,
    sort_dir: String,
    formats: Vec<String>,
) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Gagal membaca folder: {}", e))?;

    let mut files: Vec<FileEntry> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Gagal membaca entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| format!("Gagal baca metadata: {}", e))?;
        let file_type = metadata.file_type();
        let is_dir = file_type.is_dir();
        let ext = entry
            .path()
            .extension()
            .unwrap_or(OsStr::new(""))
            .to_string_lossy()
            .to_lowercase()
            .to_string();

        if is_dir || formats.contains(&ext) {
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let ctime = metadata
                .created()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let size = metadata.len();

            files.push(FileEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
                ext,
                mtime,
                size,
                ctime,
            });
        }
    }

    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            let key = if a.is_dir { &folder_sort } else { &file_sort };
            let cmp = match key.as_str() {
                "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                "size" => a.size.cmp(&b.size),
                "ext" => a.ext.cmp(&b.ext),
                "ctime" => a.ctime.cmp(&b.ctime),
                _ => a.mtime.cmp(&b.mtime),
            };
            if sort_dir == "desc" { cmp.reverse() } else { cmp }
        }
    });

    Ok(files)
}

#[tauri::command]
fn get_metadata(file_path: String) -> Result<SongMetadata, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File tidak ditemukan".to_string());
    }

    let tagged_file = read_from_path(path).map_err(|e| format!("Gagal baca metadata: {}", e))?;

    let props = tagged_file.properties();
    let duration = props.duration().as_secs_f64();
    let bitrate = props.audio_bitrate();
    let sample_rate = props.sample_rate();
    let channels = props.channels();

    let tag = tagged_file.primary_tag();

    let (title, artist, album, genre, year, track_number, total_tracks, disc_number, total_discs, comment) = tag
        .map(|t| {
            (
                t.title().map(|s| s.to_string()),
                t.artist().map(|s| s.to_string()),
                t.album().map(|s| s.to_string()),
                t.genre().map(|s| s.to_string()),
                t.year(),
                t.track(),
                t.track_total(),
                t.disk(),
                t.disk_total(),
                t.comment().map(|s| s.to_string()),
            )
        })
        .unwrap_or((None, None, None, None, None, None, None, None, None, None));

    let (cover_b64, cover_mime) = if let Some(t) = tag {
        if let Some(pic) = t.pictures().first() {
            let engine = base64::engine::general_purpose::STANDARD;
            let b64 = Some(engine.encode(pic.data()));
            let mime = pic.mime_type().map(|m| m.to_string());
            (b64, mime)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    Ok(SongMetadata {
        title,
        artist,
        album,
        duration: Some(duration),
        cover_b64,
        cover_mime,
        genre,
        year,
        track_number,
        total_tracks,
        disc_number,
        total_discs,
        comment,
        bitrate,
        sample_rate,
        channels,
    })
}

#[cfg(windows)]
fn apply_wallpaper(bmp_path: &Path) -> Result<(), String> {
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

    if result != 0 { Ok(()) } else { Err("Gagal set wallpaper".into()) }
}

#[cfg(windows)]
fn clear_wallpaper_internal() -> Result<(), String> {
    let guard = DEFAULT_WALLPAPER_PATH.lock().map_err(|e| e.to_string())?;
    if let Some(img_path) = guard.as_ref() {
        let path = Path::new(img_path);
        if !path.exists() {
            return Err("File wallpaper default tidak ditemukan".to_string());
        }
        let img = image::open(path).map_err(|e| format!("Gagal buka gambar: {}", e))?;
        let temp_dir = std::env::temp_dir();
        let bmp_path = temp_dir.join("mw-def.bmp");
        img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
            .map_err(|e| format!("Gagal save BMP: {}", e))?;
        apply_wallpaper(&bmp_path)
    } else {
        Ok(())
    }
}

#[tauri::command]
fn clear_wallpaper() -> Result<(), String> {
    clear_wallpaper_internal()
}

#[tauri::command]
fn set_wallpaper(cover_b64: String) -> Result<(), String> {
    let engine = base64::engine::general_purpose::STANDARD;
    let data = engine.decode(&cover_b64).map_err(|e| format!("Base64 decode error: {}", e))?;

    let img = image::load_from_memory(&data)
        .map_err(|e| format!("Gagal decode image: {}", e))?;

    let temp_dir = std::env::temp_dir();
    let bmp_path = temp_dir.join("mw-cover.bmp");

    img.save_with_format(&bmp_path, image::ImageFormat::Bmp)
        .map_err(|e| format!("Gagal save BMP: {}", e))?;

    apply_wallpaper(&bmp_path)
}

#[tauri::command]
async fn open_webview_stream(
    app: tauri::AppHandle,
    url: String,
    label: String,
    title: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        let _ = window.navigate(parsed);
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let _window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(Url::parse(&url).map_err(|e| e.to_string())?),
    )
    .title(&title)
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    // Poll URL periodically to catch SPA navigations (pushState/replaceState)
    // that on_navigation doesn't intercept
    let app_clone = app.clone();
    let label_clone = label.clone();
    std::thread::spawn(move || {
        let mut last_url: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            if let Some(w) = app_clone.get_webview_window(&label_clone) {
                match w.url() {
                    Ok(current_url) => {
                        let url_str = current_url.as_str().to_string();
                        let is_new = match &last_url {
                            Some(prev) => &url_str != prev,
                            None => true,
                        };
                        if is_new && is_media_url(&url_str) {
                            let _ = app_clone.emit("stream-url-changed", &url_str);
                        }
                        last_url = Some(url_str);
                    }
                    Err(_) => {
                        // webview not ready yet, skip
                    }
                }
            } else {
                break; // window closed
            }
        }
    });

    Ok(())
}

fn is_media_url(url: &str) -> bool {
    if url.contains("youtube.com/watch?v=")
        || url.contains("youtu.be/")
        || url.contains("/shorts/")
    {
        return true;
    }
    if url.contains("music.youtube.com/watch?v=")
        || url.contains("music.youtube.com/playlist?list=")
    {
        return true;
    }
    if url.contains("open.spotify.com/track/")
        || url.contains("open.spotify.com/album/")
        || url.contains("open.spotify.com/playlist/")
        || url.contains("open.spotify.com/episode/")
        || url.contains("open.spotify.com/show/")
    {
        return true;
    }
    if url.contains("soundcloud.com/") {
        let path = url.split("soundcloud.com/").nth(1).unwrap_or("");
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if segments.len() >= 2 {
            return true;
        }
    }
    if url.contains("bandcamp.com/track/")
        || url.contains(".bandcamp.com/track/")
        || url.contains("bandcamp.com/album/")
        || url.contains(".bandcamp.com/album/")
    {
        return true;
    }
    if url.contains("deezer.com/track/")
        || url.contains("deezer.com/album/")
        || url.contains("deezer.com/playlist/")
    {
        return true;
    }
    if url.contains("tidal.com/track/")
        || url.contains("tidal.com/album/")
        || url.contains("tidal.com/playlist/")
    {
        return true;
    }
    if url.contains("music.apple.com/") {
        let path_segments: Vec<&str> = url.split('/').filter(|s| !s.is_empty()).collect();
        if path_segments.iter().any(|s| *s == "album" || *s == "song" || *s == "playlist") {
            return true;
        }
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_files,
            get_metadata,
            set_wallpaper,
            clear_wallpaper,
            pick_folder,
            pick_wallpaper,
            set_default_wallpaper_path,
            get_default_wallpaper_path,
            set_reset_on_close,
            open_webview_stream
        ])
        .plugin(tauri_plugin_updater::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let window = app.get_webview_window("main").unwrap();
            let icon_bytes = include_bytes!("../icons/icon.png");
            let img = image::load_from_memory(icon_bytes).unwrap().to_rgba8();
            let (w, h) = (img.width(), img.height());
            let icon = tauri::image::Image::new(img.as_raw(), w, h);
            window.set_icon(icon).unwrap();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_handle, event| {
        #[cfg(windows)]
        if let tauri::RunEvent::Exit = event {
            if RESET_ON_CLOSE.load(Ordering::SeqCst) {
                let has_default = DEFAULT_WALLPAPER_PATH.lock()
                    .map(|p| p.is_some())
                    .unwrap_or(false);
                if has_default {
                    let _ = clear_wallpaper_internal();
                }
            }
        }
    });
}
