use lofty::file::TaggedFileExt;
use lofty::read_from_path;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;

use crate::sidecar_lyrics;

#[derive(Serialize)]
pub struct LyricsResult {
    pub raw_text: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LrclibItem {
    pub id: Option<u64>,
    #[serde(rename = "trackName")]
    pub track_name: Option<String>,
    #[serde(rename = "artistName")]
    pub artist_name: Option<String>,
    #[serde(rename = "albumName")]
    pub album_name: Option<String>,
    pub duration: Option<f64>,
    pub instrumental: Option<bool>,
    #[serde(rename = "plainLyrics")]
    pub plain_lyrics: Option<String>,
    #[serde(rename = "syncedLyrics")]
    pub synced_lyrics: Option<String>,
}

fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

#[tauri::command]
pub fn get_lyrics(file_path: String) -> Result<Option<LyricsResult>, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(None);
    }

    // 1. Check for .lrc file in the same directory
    let lrc_path = path.with_extension("lrc");
    if lrc_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lrc_path) {
            if !content.trim().is_empty() {
                return Ok(Some(LyricsResult {
                    raw_text: content,
                    source: "lrc_file".to_string(),
                }));
            }
        }
    }

    // 2. Check for embedded lyrics tag via lofty
    if let Ok(tagged_file) = read_from_path(path) {
        if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
            for item in tag.items() {
                let key_str = format!("{:?}", item.key());
                if key_str.contains("Lyrics") || key_str.contains("UnsyncLyrics") {
                    if let lofty::tag::ItemValue::Text(val) = item.value() {
                        if !val.trim().is_empty() {
                            return Ok(Some(LyricsResult {
                                raw_text: val.clone(),
                                source: "embedded".to_string(),
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn search_online_lyrics(query: String) -> Result<Vec<LrclibItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let url = format!("https://lrclib.net/api/search?q={}", url_encode(trimmed));
    let req = ureq::get(&url).set("User-Agent", "Symvonia/1.0.6 (https://github.com/Eszuri/symvonia)");
    match req.call() {
        Ok(res) => {
            let body = res.into_string().map_err(|e| format!("Failed to read response: {}", e))?;
            let items: Vec<LrclibItem> = serde_json::from_str(&body).map_err(|e| format!("Failed to parse search response: {}", e))?;
            Ok(items)
        }
        Err(e) => Err(format!("Search request failed: {}", e)),
    }
}

#[tauri::command]
pub fn fetch_online_lyrics(
    track_name: String,
    artist_name: Option<String>,
    album_name: Option<String>,
    duration: Option<f64>,
) -> Result<Option<LyricsResult>, String> {
    if track_name.trim().is_empty() {
        return Ok(None);
    }
    let mut query_params = vec![format!("track_name={}", url_encode(track_name.trim()))];
    if let Some(artist) = &artist_name {
        if !artist.trim().is_empty() {
            query_params.push(format!("artist_name={}", url_encode(artist.trim())));
        }
    }
    if let Some(album) = &album_name {
        if !album.trim().is_empty() {
            query_params.push(format!("album_name={}", url_encode(album.trim())));
        }
    }
    if let Some(dur) = duration {
        if dur > 0.0 {
            query_params.push(format!("duration={}", dur.round() as u64));
        }
    }

    let get_url = format!("https://lrclib.net/api/get?{}", query_params.join("&"));
    let req = ureq::get(&get_url).set("User-Agent", "Symvonia/1.0.6 (https://github.com/Eszuri/symvonia)");

    if let Ok(res) = req.call() {
        if let Ok(body) = res.into_string() {
            if let Ok(item) = serde_json::from_str::<LrclibItem>(&body) {
                let text = item.synced_lyrics.or(item.plain_lyrics);
                if let Some(raw_text) = text {
                    if !raw_text.trim().is_empty() {
                        return Ok(Some(LyricsResult {
                            raw_text,
                            source: "lrclib".to_string(),
                        }));
                    }
                }
            }
        }
    }

    // Fallback search
    let search_q = format!("{} {}", track_name.trim(), artist_name.as_deref().unwrap_or("").trim());
    if let Ok(items) = search_online_lyrics(search_q) {
        for item in items {
            let text = item.synced_lyrics.or(item.plain_lyrics);
            if let Some(raw_text) = text {
                if !raw_text.trim().is_empty() {
                    return Ok(Some(LyricsResult {
                        raw_text,
                        source: "lrclib".to_string(),
                    }));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn save_lrc_file(file_path: String, lrc_content: String) -> Result<(), String> {
    let audio_path = Path::new(&file_path);
    if !audio_path.exists() {
        return Err("File audio tidak ditemukan".to_string());
    }
    let lrc_path = audio_path.with_extension("lrc");
    std::fs::write(&lrc_path, lrc_content).map_err(|e| format!("Gagal menyimpan file LRC: {}", e))?;
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn generate_ai_lyrics(
    app: AppHandle,
    filePath: String,
    modelName: Option<String>,
    language: Option<String>,
    isolateVocals: Option<bool>,
) -> Result<(), String> {
    sidecar_lyrics::generate_ai_lyrics(&app, filePath, modelName, language, isolateVocals)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn extract_vocal_ai(
    app: AppHandle,
    filePath: String,
    outputPath: Option<String>,
) -> Result<(), String> {
    sidecar_lyrics::extract_vocal_ai(&app, filePath, outputPath)
}

#[tauri::command]
pub fn cancel_ai_lyrics(app: AppHandle) -> Result<(), String> {
    sidecar_lyrics::cancel_ai_lyrics(&app)
}

#[tauri::command]
pub fn get_ai_lyrics_current_state() -> sidecar_lyrics::AiLyricsState {
    sidecar_lyrics::get_current_state()
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn download_ai_model(app: AppHandle, modelName: String) -> Result<(), String> {
    sidecar_lyrics::download_ai_model(&app, modelName)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn cancel_ai_model_download(app: AppHandle, modelName: String) -> Result<(), String> {
    sidecar_lyrics::cancel_ai_model_download(&app, modelName)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_ai_model(app: AppHandle, modelName: String) -> Result<(), String> {
    sidecar_lyrics::delete_ai_model(&app, modelName)
}

#[tauri::command]
pub fn open_ai_models_folder(app: AppHandle) -> Result<(), String> {
    sidecar_lyrics::open_ai_models_folder(&app)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn import_ai_model_file(app: AppHandle, srcPath: Option<String>, path: Option<String>, modelCode: String) -> Result<(), String> {
    let p = srcPath.or(path).ok_or_else(|| "Missing path parameter".to_string())?;
    sidecar_lyrics::import_ai_model_file(&app, p, modelCode)
}
