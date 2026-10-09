use std::io::{Read, Seek};
use std::sync::atomic::Ordering;
use tauri::Manager;

pub mod ai_lyrics_plugin_manager;
pub mod audio;
pub mod commands;
pub mod library_cache;
pub mod migration;
pub mod sidecar;
pub mod sidecar_lyrics;
pub mod sidecar_wallpaper;
pub mod unified_engine_manager;
pub mod wallpaper_plugin_manager;

pub use commands::*;
pub use library_cache::{clear_library_cache, invalidate_library_directory, set_library_root};

fn parse_byte_range(header: Option<&str>, file_size: u64) -> Option<(u64, u64)> {
    let spec = header?.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (start_text, end_text) = spec.split_once('-')?;

    if start_text.is_empty() {
        let suffix = end_text.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        let length = suffix.min(file_size);
        return Some((file_size - length, file_size - 1));
    }

    let start = start_text.parse::<u64>().ok()?;
    if start >= file_size {
        return None;
    }
    let end = match end_text.parse::<u64>() {
        Ok(end) => end.min(file_size - 1),
        Err(_) if end_text.is_empty() => file_size - 1,
        Err(_) => return None,
    };
    (start <= end).then_some((start, end))
}

fn decode_percent(s: &str) -> String {
    let mut bytes = Vec::new();
    let input = s.as_bytes();
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'%' && i + 2 < input.len() {
            if let (Ok(h), Ok(l)) = (
                std::str::from_utf8(&input[i + 1..i + 2]),
                std::str::from_utf8(&input[i + 2..i + 3]),
            ) {
                let hex_str = format!("{}{}", h, l);
                if let Ok(val) = u8::from_str_radix(&hex_str, 16) {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        bytes.push(input[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(library_cache::LibraryCacheState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is launched, focus the existing main window
            // instead of starting a duplicate process.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let handle = app.handle();
            let _ = migration::migrate_legacy_plugins(handle);
            let initial_config = commands::config::load_config(handle);
            let json_str =
                serde_json::to_string(&initial_config).unwrap_or_else(|_| "{}".to_string());
            if let Some(window) = app.get_webview_window("main") {
                let script = format!("window.__SYMVONIA_INITIAL_CONFIG__ = {};", json_str);
                let _ = window.eval(&script);
            }
            Ok(())
        })
        .on_page_load(|window, _payload| {
            let handle = window.app_handle();
            let initial_config = commands::config::load_config(handle);
            if let Ok(json_str) = serde_json::to_string(&initial_config) {
                let script = format!("window.__SYMVONIA_INITIAL_CONFIG__ = {};", json_str);
                let _ = window.eval(&script);
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            set_library_root,
            clear_library_cache,
            invalidate_library_directory,
            get_metadata,
            get_lyrics,
            fetch_online_lyrics,
            search_online_lyrics,
            save_lrc_file,
            save_metadata,
            get_system_volume,
            set_system_volume,
            get_system_mute,
            set_system_mute,
            register_volume_callback,
            unregister_volume_callback,
            set_wallpaper,
            clear_wallpaper,
            pick_folder,
            pick_wallpaper,
            pick_audio_file,
            pick_single_file,
            open_devtools,
            save_cover_image,
            set_default_wallpaper_path,
            get_default_wallpaper_path,
            set_reset_on_close,
            open_webview_stream,
            get_bit_perfect_plugin_status,
            download_bit_perfect_plugin,
            cancel_bit_perfect_plugin_download,
            install_bit_perfect_plugin_from_file,
            uninstall_bit_perfect_plugin,
            send_audio_command,
            get_audio_devices,
            stop_audio_engine,
            is_audio_engine_running,
            get_ai_lyrics_plugin_status,
            download_ai_lyrics_plugin,
            cancel_ai_lyrics_plugin_download,
            install_ai_lyrics_plugin_from_file,
            uninstall_ai_lyrics_plugin,
            generate_ai_lyrics,
            extract_vocal_ai,
            cancel_ai_lyrics,
            get_ai_lyrics_current_state,
            get_downloaded_ai_models,
            download_ai_model,
            cancel_ai_model_download,
            delete_ai_model,
            open_ai_models_folder,
            import_ai_model_file,
            open_external_url,
            get_system_specs,
            get_app_config,
            save_app_config,
            set_app_config_key,
            save_config_value,
            reset_app_config,
            open_config_folder,
            get_storage_usage,
            clean_library_cache,
            clean_ai_models_data,
            clean_all_app_data,
            get_app_environment,
            get_equalizer_plugin_status,
            download_equalizer_plugin,
            cancel_equalizer_plugin_download,
            install_equalizer_plugin_from_file,
            uninstall_equalizer_plugin,
            get_dsp_curve,
            get_tag_editor_plugin_status,
            download_tag_editor_plugin,
            cancel_tag_editor_plugin_download,
            install_tag_editor_plugin_from_file,
            uninstall_tag_editor_plugin,
            get_wallpaper_plugin_status,
            download_wallpaper_plugin,
            cancel_wallpaper_plugin_download,
            install_wallpaper_plugin_from_file,
            uninstall_wallpaper_plugin,
            start_wallpaper_engine,
            stop_wallpaper_engine,
            pause_wallpaper_engine,
            resume_wallpaper_engine,
            set_wallpaper_engine_texture,
            set_wallpaper_engine_fps,
            set_wallpaper_engine_intensity,
            set_wallpaper_engine_fit_mode,
            set_wallpaper_engine_effect,
            set_wallpaper_effect,
            get_wallpaper_effect,
            set_wallpaper_engine_transition,
            set_wallpaper_transition,
            get_wallpaper_transition,
            set_wallpaper_fit_mode,
            get_wallpaper_fit_mode,
            get_wallpaper_engine_state,
            is_wallpaper_engine_running
        ])
        .register_uri_scheme_protocol("stream", |_app, request| {
            if request.method() == tauri::http::Method::OPTIONS {
                return tauri::http::Response::builder()
                    .status(200)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD")
                    .header("Access-Control-Allow-Headers", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            let raw_path = request.uri().path();
            let decoded = decode_percent(raw_path);
            let clean_path =
                if cfg!(windows) && decoded.starts_with('/') && decoded.chars().nth(2) == Some(':')
                {
                    &decoded[1..]
                } else {
                    &decoded[..]
                };

            let path_buf = std::path::PathBuf::from(clean_path);
            if !path_buf.exists() || !path_buf.is_file() {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            let file_size = match std::fs::metadata(&path_buf) {
                Ok(m) => m.len(),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap()
                }
            };

            let ext = path_buf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let mime = match ext.as_str() {
                "mp3" => "audio/mpeg",
                "flac" => "audio/flac",
                "wav" => "audio/wav",
                "ogg" => "audio/ogg",
                "m4a" | "aac" | "mp4" => "audio/mp4",
                "opus" => "audio/opus",
                "webm" => "audio/webm",
                _ => "audio/mpeg",
            };

            let range_header = request.headers().get("range").and_then(|v| v.to_str().ok());
            if file_size == 0 {
                return tauri::http::Response::builder()
                    .status(416)
                    .header("Content-Range", "bytes */0")
                    .body(Vec::new())
                    .unwrap();
            }

            let requested_range = range_header.is_some();
            let (start, requested_end) = match parse_byte_range(range_header, file_size) {
                Some(range) => range,
                None if requested_range => {
                    return tauri::http::Response::builder()
                        .status(416)
                        .header("Accept-Ranges", "bytes")
                        .header("Content-Range", format!("bytes */{}", file_size))
                        .body(Vec::new())
                        .unwrap();
                }
                None => (0, file_size - 1),
            };

            let mut file = match std::fs::File::open(&path_buf) {
                Ok(f) => f,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new())
                        .unwrap()
                }
            };

            const MAX_CHUNK: u64 = 2 * 1024 * 1024;
            let end = std::cmp::min(requested_end, start.saturating_add(MAX_CHUNK - 1));
            let length = (end - start + 1) as usize;
            if file.seek(std::io::SeekFrom::Start(start)).is_err() {
                return tauri::http::Response::builder()
                    .status(500)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            let mut buffer = vec![0u8; length];
            if file.read_exact(&mut buffer).is_err() {
                return tauri::http::Response::builder()
                    .status(500)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new())
                    .unwrap();
            }

            tauri::http::Response::builder()
                .status(206)
                .header("Access-Control-Allow-Origin", "*")
                .header("Accept-Ranges", "bytes")
                .header(
                    "Content-Range",
                    format!("bytes {}-{}/{}", start, end, file_size),
                )
                .header("Content-Length", length.to_string())
                .header("Content-Type", mime)
                .body(buffer)
                .unwrap()
        })
        .plugin(tauri_plugin_updater::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/icon.png");
                if let Ok(img) = image::load_from_memory(icon_bytes) {
                    let img = img.to_rgba8();
                    let (w, h) = (img.width(), img.height());
                    let icon = tauri::image::Image::new(img.as_raw(), w, h);
                    let _ = window.set_icon(icon);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_handle, event| {
        #[cfg(windows)]
        if let tauri::RunEvent::Exit = event {
            // Kill all sidecar engines and downloads so they never outlive the host app.
            let _ = sidecar::stop_engine();
            sidecar_lyrics::stop_engine();
            sidecar_wallpaper::stop_engine();
            unified_engine_manager::cancel_download();
            ai_lyrics_plugin_manager::cancel_download();
            wallpaper_plugin_manager::cancel_download();
            if commands::wallpaper::RESET_ON_CLOSE.load(Ordering::SeqCst) {
                let _ = commands::wallpaper::clear_wallpaper_internal(true);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::parse_byte_range;

    #[test]
    fn parses_explicit_and_open_ended_ranges() {
        assert_eq!(parse_byte_range(Some("bytes=10-20"), 100), Some((10, 20)));
        assert_eq!(parse_byte_range(Some("bytes=10-"), 100), Some((10, 99)));
        assert_eq!(parse_byte_range(Some("bytes=-10"), 100), Some((90, 99)));
    }

    #[test]
    fn clamps_and_rejects_invalid_ranges() {
        assert_eq!(parse_byte_range(Some("bytes=90-200"), 100), Some((90, 99)));
        assert_eq!(parse_byte_range(Some("bytes=100-"), 100), None);
        assert_eq!(parse_byte_range(Some("bytes=20-10"), 100), None);
        assert_eq!(parse_byte_range(Some("items=0-1"), 100), None);
    }
}
