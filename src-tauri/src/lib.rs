use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

use base64::Engine;
use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::read_from_path;
use lofty::tag::Accessor;
use serde::Serialize;

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    ext: String,
    mtime: u64,
}

#[derive(Serialize)]
struct SongMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    cover_b64: Option<String>,
    cover_mime: Option<String>,
}

#[tauri::command]
fn list_files(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Gagal membaca folder: {}", e))?;

    let mut files: Vec<FileEntry> = Vec::new();
    let audio_exts = ["mp3", "flac", "ogg", "wav", "m4a", "wma"];

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

        if is_dir || audio_exts.contains(&ext.as_str()) {
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            files.push(FileEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
                ext,
                mtime,
            });
        }
    }

    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.mtime.cmp(&b.mtime)
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

    let duration = tagged_file.properties().duration().as_secs_f64();
    let tag = tagged_file.primary_tag();

    let (title, artist, album) = tag
        .map(|t| {
            (
                t.title().map(|s| s.to_string()),
                t.artist().map(|s| s.to_string()),
                t.album().map(|s| s.to_string()),
            )
        })
        .unwrap_or((None, None, None));

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
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_files, get_metadata])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
