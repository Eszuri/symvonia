use base64::Engine;
use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::read_from_path;
use lofty::tag::Accessor;
use rayon::prelude::*;
use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::time::SystemTime;
use tauri::{AppHandle, Manager, State};

use crate::audio::engine;
use crate::library_cache::{self, CachedEntry, DirectorySnapshot, LibraryCacheState};

/// Enumerate active output devices in the host process via Windows MMDevice API.
#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<crate::audio::output::AudioDeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::audio::output::get_audio_hosts_and_devices)
        .await
        .map_err(|e| format!("Audio device enumeration task failed: {}", e))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WasapiSupportResult {
    pub device_name: String,
    pub supported_exclusive: bool,
    pub supported_shared: bool,
    pub default_sample_rate: Option<u32>,
    pub supported_sample_rates: Vec<u32>,
    pub exclusive_not_allowed: bool,
    pub in_use: bool,
    pub message: String,
}

#[cfg(windows)]
pub fn probe_wasapi_device(device_id: Option<String>) -> Result<WasapiSupportResult, String> {
    use crate::audio::wasapi::{
        build_waveformat_extensible, build_waveformat_plain, exclusive_format_candidates,
    };
    use windows::core::HSTRING;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        DEVICE_STATE_ACTIVE, WAVEFORMATEX,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED, STGM_READ,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator = CoCreateInstance(
            &MMDeviceEnumerator,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| format!("Gagal menginisialisasi MMDeviceEnumerator: {}", e))?;

        let pkey_device_friendly_name = PROPERTYKEY {
            fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
            pid: 14,
        };

        let mut matched_device: Option<IMMDevice> = None;
        let mut resolved_name = String::new();

        if let Some(ref target) = device_id {
            let target_trimmed = target.trim();
            if !target_trimmed.is_empty() {
                // 1. Coba cari langsung berdasarkan ID endpoint
                if let Ok(dev) = enumerator.GetDevice(&HSTRING::from(target_trimmed)) {
                    if let Ok(store) = dev.OpenPropertyStore(STGM_READ) {
                        if let Ok(var) = store.GetValue(&pkey_device_friendly_name) {
                            resolved_name = var.to_string();
                        }
                    }
                    matched_device = Some(dev);
                }

                // 2. Jika tidak ditemukan lewat ID langsung, cari lewat daftar endpoint aktif
                // berdasarkan nama friendly atau ID
                if matched_device.is_none() {
                    if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                        if let Ok(count) = collection.GetCount() {
                            for i in 0..count {
                                if let Ok(dev) = collection.Item(i) {
                                    let mut name = String::new();
                                    if let Ok(store) = dev.OpenPropertyStore(STGM_READ) {
                                        if let Ok(var) = store.GetValue(&pkey_device_friendly_name) {
                                            name = var.to_string();
                                        }
                                    }
                                    let id_str = dev
                                        .GetId()
                                        .map(|pwstr| {
                                            let s = pwstr.to_string().unwrap_or_default();
                                            CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
                                            s
                                        })
                                        .unwrap_or_default();

                                    if !name.is_empty()
                                        && (name.eq_ignore_ascii_case(target_trimmed)
                                            || target_trimmed.contains(&name)
                                            || name.contains(target_trimmed))
                                        || (!id_str.is_empty() && id_str == target_trimmed)
                                    {
                                        resolved_name = if name.is_empty() {
                                            target_trimmed.to_string()
                                        } else {
                                            name
                                        };
                                        matched_device = Some(dev);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallback jika tidak ditentukan atau tidak ditemukan: gunakan default multimedia audio endpoint
        let device = match matched_device {
            Some(d) => d,
            None => {
                let def = enumerator
                    .GetDefaultAudioEndpoint(eRender, eMultimedia)
                    .map_err(|e| format!("Perangkat audio default tidak ditemukan: {}", e))?;
                if resolved_name.is_empty() {
                    if let Ok(store) = def.OpenPropertyStore(STGM_READ) {
                        if let Ok(var) = store.GetValue(&pkey_device_friendly_name) {
                            resolved_name = var.to_string();
                        }
                    }
                    if resolved_name.is_empty() {
                        resolved_name = "Perangkat Sistem Default".to_string();
                    }
                }
                def
            }
        };

        let client: IAudioClient = device
            .Activate(CLSCTX_INPROC_SERVER, None)
            .map_err(|e| format!("Gagal mengaktifkan IAudioClient pada {}: {}", resolved_name, e))?;

        // 1. Pengujian Mode Shared
        let mix_format_ptr = client
            .GetMixFormat()
            .map_err(|e| format!("Gagal membaca mix format WASAPI: {}", e))?;

        let mix_format = &*mix_format_ptr;
        let default_sample_rate = mix_format.nSamplesPerSec;

        let mut closest_match_ptr: *mut WAVEFORMATEX = std::ptr::null_mut();
        let hr_shared = client.IsFormatSupported(
            AUDCLNT_SHAREMODE_SHARED,
            mix_format_ptr,
            Some(&mut closest_match_ptr),
        );
        if !closest_match_ptr.is_null() {
            CoTaskMemFree(Some(closest_match_ptr as *const _));
        }
        let supported_shared = hr_shared.0 == 0 || default_sample_rate > 0;

        // 2. Pengujian Mode Exclusive
        let mut supported_exclusive = false;
        let mut exclusive_not_allowed = false;
        let mut in_use = false;
        let mut supported_rates: Vec<u32> = Vec::new();
        let mut hardware_init_verified = false;

        // Helper untuk menguji apakah IAudioClient benar-benar bisa diinisialisasi
        // dalam mode Exclusive pada perangkat ini (dilakukan sekali pada format pertama yang lolos).
        // Mengembalikan: (verified_ok, not_allowed, device_in_use)
        let verify_exclusive_init = |dev: &IMMDevice, wfx: *const WAVEFORMATEX| -> (bool, bool, bool) {
            if let Ok(tc) = dev.Activate::<IAudioClient>(CLSCTX_INPROC_SERVER, None) {
                let mut def_p: i64 = 0;
                let mut min_p: i64 = 0;
                let _ = tc.GetDevicePeriod(Some(&mut def_p), Some(&mut min_p));
                let period = if def_p > 0 { def_p } else { 500_000 };
                let init_res = tc.Initialize(
                    AUDCLNT_SHAREMODE_EXCLUSIVE,
                    AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                    period,
                    period,
                    wfx,
                    None,
                );
                match init_res {
                    Ok(()) => (true, false, false),
                    Err(e) => {
                        let code = e.code().0;
                        if code == -2004287474 {
                            // 0x8889000E AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED
                            (false, true, false)
                        } else if code == -2004287478 {
                            // 0x8889000A AUDCLNT_E_DEVICE_IN_USE
                            (true, false, true)
                        } else if code == -2004287463 {
                            // 0x88890019 AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED
                            (true, false, false)
                        } else {
                            // Retry once without EVENTCALLBACK in case driver prefers polling for probe
                            if let Ok(tc2) = dev.Activate::<IAudioClient>(CLSCTX_INPROC_SERVER, None) {
                                match tc2.Initialize(
                                    AUDCLNT_SHAREMODE_EXCLUSIVE,
                                    0,
                                    period,
                                    period,
                                    wfx,
                                    None,
                                ) {
                                    Ok(()) => (true, false, false),
                                    Err(e2) => {
                                        let c2 = e2.code().0;
                                        if c2 == -2004287474 {
                                            (false, true, false)
                                        } else if c2 == -2004287478 {
                                            (true, false, true)
                                        } else if c2 == -2004287463 {
                                            (true, false, false)
                                        } else {
                                            (false, false, false)
                                        }
                                    }
                                }
                            } else {
                                (false, false, false)
                            }
                        }
                    }
                }
            } else {
                (false, false, false)
            }
        };

        // Cek seluruh kandidat sample rate menggunakan seluruh kandidat bit-depth WASAPI Exclusive
        // (Float32, Pcm24In32, Pcm24Packed, Pcm32, Pcm16 — baik Extensible maupun Plain)
        let mut candidate_rates = vec![44100u32, 48000, 88200, 96000, 176400, 192000];
        if !candidate_rates.contains(&default_sample_rate) {
            candidate_rates.push(default_sample_rate);
        }

        'rate_loop: for &rate in &candidate_rates {
            for &(fmt, use_extensible) in exclusive_format_candidates() {
                let wfx_ext = build_waveformat_extensible(rate, 2, fmt);
                let wfx_plain = build_waveformat_plain(rate, 2, fmt);
                let wfx_ptr: *const WAVEFORMATEX = if use_extensible {
                    &wfx_ext.Format
                } else {
                    &wfx_plain
                };

                let hr = client.IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, wfx_ptr, None);
                if hr.0 == -2004287474 {
                    // 0x8889000E AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED
                    exclusive_not_allowed = true;
                    break 'rate_loop;
                } else if hr.0 == -2004287478 {
                    // 0x8889000A AUDCLNT_E_DEVICE_IN_USE
                    in_use = true;
                    supported_exclusive = true;
                    hardware_init_verified = true;
                    supported_rates.push(rate);
                    break;
                } else if hr.0 == 0 {
                    // S_OK: format didukung oleh driver
                    if !hardware_init_verified {
                        let (ok, not_allowed, busy) = verify_exclusive_init(&device, wfx_ptr);
                        if not_allowed {
                            exclusive_not_allowed = true;
                            supported_rates.clear();
                            supported_exclusive = false;
                            break 'rate_loop;
                        }
                        if busy {
                            in_use = true;
                        }
                        if ok {
                            hardware_init_verified = true;
                            supported_exclusive = true;
                            supported_rates.push(rate);
                            break;
                        }
                    } else {
                        supported_exclusive = true;
                        supported_rates.push(rate);
                        break;
                    }
                }
            }
        }

        supported_rates.sort_unstable();
        supported_rates.dedup();

        CoTaskMemFree(Some(mix_format_ptr as *const _));

        let message = if exclusive_not_allowed {
            "Mode Eksklusif dinonaktifkan di pengaturan Windows untuk perangkat ini (Shared didukung)".to_string()
        } else if supported_exclusive && supported_shared {
            "Mendukung WASAPI Exclusive & Shared".to_string()
        } else if supported_shared && !supported_exclusive {
            "Hanya mendukung WASAPI Shared (Exclusive tidak didukung oleh perangkat/driver)".to_string()
        } else if supported_exclusive {
            "Mendukung WASAPI Exclusive".to_string()
        } else {
            "Perangkat tidak mendukung mode WASAPI (Gunakan HTML5 Audio)".to_string()
        };

        Ok(WasapiSupportResult {
            device_name: resolved_name,
            supported_exclusive,
            supported_shared,
            default_sample_rate: Some(default_sample_rate),
            supported_sample_rates: supported_rates,
            exclusive_not_allowed,
            in_use,
            message,
        })
    }
}

#[cfg(not(windows))]
pub fn probe_wasapi_device(_device_id: Option<String>) -> Result<WasapiSupportResult, String> {
    Err("WASAPI hanya tersedia di sistem operasi Windows".to_string())
}

#[tauri::command]
pub async fn test_wasapi_device(device_id: Option<String>) -> Result<WasapiSupportResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe_wasapi_device(device_id))
        .await
        .map_err(|e| format!("WASAPI test task failed: {}", e))?
}










#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub mtime: u64,
    pub size: u64,
    pub ctime: u64,
    pub display_name: String,
    pub sort_key: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
}

#[derive(Serialize)]
pub struct SongMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub cover_b64: Option<String>,
    pub cover_mime: Option<String>,
    pub genre: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub total_tracks: Option<u32>,
    pub disc_number: Option<u32>,
    pub total_discs: Option<u32>,
    pub comment: Option<String>,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub bit_depth: Option<u8>,
}

struct PartialAudioMeta {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    track_number: Option<u32>,
    year: Option<u32>,
    genre: Option<String>,
    duration: Option<f64>,
}

fn extract_audio_meta(path: &Path) -> PartialAudioMeta {
    let tagged_file = match read_from_path(path) {
        Ok(t) => Some(t),
        Err(_) => {
            if let Ok(probe) = lofty::probe::Probe::open(path) {
                let probe = probe.options(
                    lofty::config::ParseOptions::new()
                        .parsing_mode(lofty::config::ParsingMode::Relaxed),
                );
                probe.read().ok()
            } else {
                None
            }
        }
    };

    if let Some(t) = tagged_file {
        let tag = t.primary_tag().or_else(|| t.first_tag());
        let title = tag
            .and_then(|tag| tag.title().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty());
        let artist = tag
            .and_then(|tag| tag.artist().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty());
        let album = tag
            .and_then(|tag| tag.album().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty());
        let track_number = tag.and_then(|tag| tag.track());
        let year = tag.and_then(|tag| tag.year());
        let genre = tag
            .and_then(|tag| tag.genre().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty());
        let duration = Some(t.properties().duration().as_secs_f64()).filter(|d| *d > 0.0);
        PartialAudioMeta {
            title,
            artist,
            album,
            track_number,
            year,
            genre,
            duration,
        }
    } else {
        PartialAudioMeta {
            title: None,
            artist: None,
            album: None,
            track_number: None,
            year: None,
            genre: None,
            duration: None,
        }
    }
}

fn filename_display_name(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.to_string())
}

fn scan_directory(root_path: &str, directory_path: &str) -> Result<DirectorySnapshot, String> {
    let entries =
        fs::read_dir(directory_path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let entries: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .collect();

    let cached_entries: Vec<CachedEntry> = entries
        .into_par_iter()
        .filter_map(|entry| {
            let path_buf = entry.path();
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = metadata.is_dir();
            let ext = path_buf
                .extension()
                .unwrap_or(OsStr::new(""))
                .to_string_lossy()
                .to_lowercase();
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

            let (title, artist, album, track_number, year, genre, duration) = if is_dir {
                (None, None, None, None, None, None, None)
            } else {
                let meta = extract_audio_meta(&path_buf);
                (
                    meta.title,
                    meta.artist,
                    meta.album,
                    meta.track_number,
                    meta.year,
                    meta.genre,
                    meta.duration,
                )
            };

            Some(CachedEntry {
                name,
                path: path_buf.to_string_lossy().to_string(),
                is_dir,
                ext,
                mtime,
                size: metadata.len(),
                ctime,
                title,
                artist,
                album,
                track_number,
                year,
                genre,
                duration,
                title_loaded: true,
                meta_loaded: true,
            })
        })
        .collect();

    library_cache::make_snapshot(root_path, directory_path, cached_entries)
}

fn project_snapshot(
    snapshot: &mut DirectorySnapshot,
    folder_sort: &str,
    file_sort: &str,
    sort_dir: &str,
    name_source: &str,
    formats: &[String],
) -> Vec<FileEntry> {
    let mut files: Vec<FileEntry> = snapshot
        .entries
        .iter_mut()
        .filter_map(|entry| {
            if !entry.is_dir && !formats.iter().any(|format| format == &entry.ext) {
                return None;
            }
            if !entry.is_dir && !entry.meta_loaded {
                let meta = extract_audio_meta(Path::new(&entry.path));
                entry.title = meta.title;
                entry.artist = meta.artist;
                entry.album = meta.album;
                entry.track_number = meta.track_number;
                entry.year = meta.year;
                entry.genre = meta.genre;
                entry.duration = meta.duration;
                entry.title_loaded = true;
                entry.meta_loaded = true;
            }

            let display_name = if entry.is_dir {
                entry.name.clone()
            } else if name_source == "title" {
                entry
                    .title
                    .clone()
                    .unwrap_or_else(|| filename_display_name(&entry.name))
            } else {
                filename_display_name(&entry.name)
            };

            Some(FileEntry {
                name: entry.name.clone(),
                path: entry.path.clone(),
                is_dir: entry.is_dir,
                ext: entry.ext.clone(),
                mtime: entry.mtime,
                size: entry.size,
                ctime: entry.ctime,
                sort_key: display_name.to_lowercase(),
                display_name,
                artist: entry.artist.clone(),
                album: entry.album.clone(),
                track_number: entry.track_number,
                year: entry.year,
                genre: entry.genre.clone(),
                duration: entry.duration,
            })
        })
        .collect();

    let desc = sort_dir == "desc";
    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            let key = if a.is_dir { folder_sort } else { file_sort };
            let cmp = match key {
                "name" => a.sort_key.cmp(&b.sort_key),
                "artist" => {
                    let a_val = a.artist.as_deref().unwrap_or("").to_lowercase();
                    let b_val = b.artist.as_deref().unwrap_or("").to_lowercase();
                    match (a_val.is_empty(), b_val.is_empty()) {
                        (false, false) => a_val.cmp(&b_val).then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (true, false) => std::cmp::Ordering::Greater,
                        (false, true) => std::cmp::Ordering::Less,
                        (true, true) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "album" => {
                    let a_val = a.album.as_deref().unwrap_or("").to_lowercase();
                    let b_val = b.album.as_deref().unwrap_or("").to_lowercase();
                    match (a_val.is_empty(), b_val.is_empty()) {
                        (false, false) => a_val.cmp(&b_val).then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (true, false) => std::cmp::Ordering::Greater,
                        (false, true) => std::cmp::Ordering::Less,
                        (true, true) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "track" | "track_no" => {
                    let a_t = a.track_number;
                    let b_t = b.track_number;
                    match (a_t, b_t) {
                        (Some(x), Some(y)) => x.cmp(&y).then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, None) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "year" => {
                    let a_y = a.year;
                    let b_y = b.year;
                    match (a_y, b_y) {
                        (Some(x), Some(y)) => x.cmp(&y).then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, None) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "genre" => {
                    let a_val = a.genre.as_deref().unwrap_or("").to_lowercase();
                    let b_val = b.genre.as_deref().unwrap_or("").to_lowercase();
                    match (a_val.is_empty(), b_val.is_empty()) {
                        (false, false) => a_val.cmp(&b_val).then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (true, false) => std::cmp::Ordering::Greater,
                        (false, true) => std::cmp::Ordering::Less,
                        (true, true) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "duration" => {
                    let a_d = a.duration.unwrap_or(0.0);
                    let b_d = b.duration.unwrap_or(0.0);
                    match (a_d > 0.0, b_d > 0.0) {
                        (true, true) => a_d
                            .partial_cmp(&b_d)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then_with(|| a.sort_key.cmp(&b.sort_key)),
                        (false, true) => std::cmp::Ordering::Greater,
                        (true, false) => std::cmp::Ordering::Less,
                        (false, false) => a.sort_key.cmp(&b.sort_key),
                    }
                }
                "size" => a.size.cmp(&b.size).then_with(|| a.sort_key.cmp(&b.sort_key)),
                "ext" => a.ext.cmp(&b.ext).then_with(|| a.sort_key.cmp(&b.sort_key)),
                "ctime" => a.ctime.cmp(&b.ctime).then_with(|| a.sort_key.cmp(&b.sort_key)),
                _ => a.mtime.cmp(&b.mtime).then_with(|| a.sort_key.cmp(&b.sort_key)),
            };
            if desc {
                cmp.reverse()
            } else {
                cmp
            }
        }
    });
    files
}

fn list_files_inner(
    app: AppHandle,
    cache: LibraryCacheState,
    path: String,
    folder_sort: String,
    file_sort: String,
    sort_dir: String,
    name_source: String,
    formats: Vec<String>,
) -> Result<Vec<FileEntry>, String> {
    let root_path = cache.active_root().unwrap_or_else(|| path.clone());
    let mut snapshot = cache.load_or_scan(&app, &root_path, &path, || {
        scan_directory(&root_path, &path)
    })?;
    let before_meta: Vec<_> = snapshot
        .entries
        .iter()
        .map(|entry| (entry.path.clone(), entry.meta_loaded))
        .collect();
    let files = project_snapshot(
        &mut snapshot,
        &folder_sort,
        &file_sort,
        &sort_dir,
        &name_source,
        &formats,
    );
    let meta_changed = before_meta
        != snapshot
            .entries
            .iter()
            .map(|entry| (entry.path.clone(), entry.meta_loaded))
            .collect::<Vec<_>>();
    if meta_changed {
        let _ = library_cache::write_snapshot(&app, &snapshot);
        cache.update_snapshot(snapshot)?;
    }
    Ok(files)
}

#[tauri::command]
pub async fn list_files(
    app: AppHandle,
    cache: State<'_, LibraryCacheState>,
    path: String,
    folder_sort: String,
    file_sort: String,
    sort_dir: String,
    name_source: String,
    formats: Vec<String>,
) -> Result<Vec<FileEntry>, String> {
    let cache = cache.inner().clone();
    let handle = app.clone();
    let files = tauri::async_runtime::spawn_blocking(move || {
        list_files_inner(
            app,
            cache,
            path,
            folder_sort,
            file_sort,
            sort_dir,
            name_source,
            formats,
        )
    })
    .await
    .map_err(|e| format!("Task error: {}", e))??;
    let access = handle.state::<crate::media_access::MediaAccess>();
    let root = handle.state::<LibraryCacheState>().active_root();
    for file in &files {
        if !file.is_dir {
            if let Some(path) = access.resolve(Path::new(&file.path), root.as_deref().map(Path::new)) {
                access.allow_file(&path);
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn get_metadata(file_path: String) -> Result<SongMetadata, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let tagged_file = match read_from_path(path) {
        Ok(t) => t,
        Err(_) => {
            if let Ok(probe) = lofty::probe::Probe::open(path) {
                let probe = probe.options(
                    lofty::config::ParseOptions::new()
                        .parsing_mode(lofty::config::ParsingMode::Relaxed),
                );
                match probe.read() {
                    Ok(t) => t,
                    Err(_) => {
                        return Ok(SongMetadata {
                            title: None,
                            artist: None,
                            album: None,
                            duration: None,
                            cover_b64: None,
                            cover_mime: None,
                            genre: None,
                            year: None,
                            track_number: None,
                            total_tracks: None,
                            disc_number: None,
                            total_discs: None,
                            comment: None,
                            bitrate: None,
                            sample_rate: None,
                            channels: None,
                            bit_depth: None,
                        });
                    }
                }
            } else {
                return Ok(SongMetadata {
                    title: None,
                    artist: None,
                    album: None,
                    duration: None,
                    cover_b64: None,
                    cover_mime: None,
                    genre: None,
                    year: None,
                    track_number: None,
                    total_tracks: None,
                    disc_number: None,
                    total_discs: None,
                    comment: None,
                    bitrate: None,
                    sample_rate: None,
                    channels: None,
                    bit_depth: None,
                });
            }
        }
    };

    let props = tagged_file.properties();
    let duration = props.duration().as_secs_f64();
    let bitrate = props.audio_bitrate();
    let sample_rate = props.sample_rate();
    let channels = props.channels();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let is_lossy = matches!(ext.as_str(), "mp3" | "ogg" | "opus" | "aac");
    let bit_depth = if is_lossy { None } else { props.bit_depth() };

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (
        title,
        artist,
        album,
        genre,
        year,
        track_number,
        total_tracks,
        disc_number,
        total_discs,
        comment,
    ) = tag
        .map(|t| {
            (
                t.title()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                t.artist()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                t.album()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                t.genre()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                t.year(),
                t.track(),
                t.track_total(),
                t.disk(),
                t.disk_total(),
                t.comment()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
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
        duration: if duration > 0.0 { Some(duration) } else { None },
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
        bit_depth,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn write_tags_native(
    file_path: &str,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    year: Option<u32>,
    track_number: Option<u32>,
    total_tracks: Option<u32>,
    disc_number: Option<u32>,
    total_discs: Option<u32>,
    comment: Option<String>,
    cover_b64: Option<String>,
    cover_mime: Option<String>,
) -> Result<(), String> {
    use lofty::config::WriteOptions;
    use lofty::picture::{MimeType, Picture, PictureType};
    use lofty::tag::Tag;

    let path = Path::new(file_path);
    if file_path.trim().is_empty() || !path.exists() {
        return Err("File not found".to_string());
    }

    let mut tagged_file = match read_from_path(path) {
        Ok(t) => t,
        Err(_) => {
            let probe = lofty::probe::Probe::open(path)
                .map_err(|e| format!("Failed to open audio file for tagging: {}", e))?
                .options(
                    lofty::config::ParseOptions::new()
                        .parsing_mode(lofty::config::ParsingMode::Relaxed),
                );
            probe
                .read()
                .map_err(|e| format!("Failed to read audio tags: {}", e))?
        }
    };

    let tag_type = tagged_file.primary_tag_type();
    if tagged_file.primary_tag().is_none() && tagged_file.first_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let has_primary = tagged_file.primary_tag().is_some();
    let tag = if has_primary {
        tagged_file.primary_tag_mut()
    } else {
        tagged_file.first_tag_mut()
    }
    .ok_or_else(|| "Unsupported tag format for this audio file".to_string())?;

    match title.filter(|s| !s.trim().is_empty()) {
        Some(v) => tag.set_title(v),
        None => tag.remove_title(),
    }
    match artist.filter(|s| !s.trim().is_empty()) {
        Some(v) => tag.set_artist(v),
        None => tag.remove_artist(),
    }
    match album.filter(|s| !s.trim().is_empty()) {
        Some(v) => tag.set_album(v),
        None => tag.remove_album(),
    }
    match genre.filter(|s| !s.trim().is_empty()) {
        Some(v) => tag.set_genre(v),
        None => tag.remove_genre(),
    }
    match comment.filter(|s| !s.trim().is_empty()) {
        Some(v) => tag.set_comment(v),
        None => tag.remove_comment(),
    }
    match year {
        Some(v) => tag.set_year(v),
        None => tag.remove_year(),
    }
    match track_number {
        Some(v) => tag.set_track(v),
        None => tag.remove_track(),
    }
    match total_tracks {
        Some(v) => tag.set_track_total(v),
        None => tag.remove_track_total(),
    }
    match disc_number {
        Some(v) => tag.set_disk(v),
        None => tag.remove_disk(),
    }
    match total_discs {
        Some(v) => tag.set_disk_total(v),
        None => tag.remove_disk_total(),
    }

    match cover_b64.filter(|s| !s.trim().is_empty()) {
        Some(b64) => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b64.trim())
                .map_err(|e| format!("Invalid cover image base64: {}", e))?;
            let mime_str = cover_mime.as_deref().unwrap_or("image/jpeg");
            let mime = MimeType::from_str(mime_str);
            let pic = Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime),
                Some("Front Cover".to_string()),
                bytes,
            );
            tag.remove_picture_type(PictureType::CoverFront);
            while !tag.pictures().is_empty() {
                tag.remove_picture(0);
            }
            tag.push_picture(pic);
        }
        None => {
            tag.remove_picture_type(PictureType::CoverFront);
            while !tag.pictures().is_empty() {
                tag.remove_picture(0);
            }
        }
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Failed to save metadata tags: {}", e))?;

    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn save_metadata(
    app: tauri::AppHandle,
    file_path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    year: Option<u32>,
    track_number: Option<u32>,
    total_tracks: Option<u32>,
    disc_number: Option<u32>,
    total_discs: Option<u32>,
    comment: Option<String>,
    cover_b64: Option<String>,
    cover_mime: Option<String>,
) -> Result<(), String> {
    write_tags_native(
        &file_path,
        title,
        artist,
        album,
        genre,
        year,
        track_number,
        total_tracks,
        disc_number,
        total_discs,
        comment,
        cover_b64,
        cover_mime,
    )?;

    if let Some(parent) = Path::new(&file_path).parent() {
        let cache = app.state::<LibraryCacheState>();
        let _ = library_cache::invalidate_library_directory(
            cache,
            parent.to_string_lossy().to_string(),
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn save_cover_image(cover_b64: String, mime: String) -> Result<(), String> {
    let engine = base64::engine::general_purpose::STANDARD;
    let data = engine
        .decode(&cover_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let ext = match mime.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        _ => "png",
    };

    let file = rfd::AsyncFileDialog::new()
        .set_title("Save Cover Image")
        .set_file_name(format!("cover.{}", ext))
        .add_filter("Image", &[ext])
        .save_file()
        .await;

    if let Some(path) = file {
        fs::write(path.path(), &data).map_err(|e| format!("Failed to save file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn send_audio_command(app: AppHandle, json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || engine::send_command(&app, &json))
        .await
        .map_err(|e| format!("Audio engine command task failed: {}", e))?
}

#[tauri::command]
pub async fn stop_audio_engine() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(engine::stop_engine)
        .await
        .map_err(|e| format!("Audio engine stop task failed: {}", e))?
}

#[tauri::command]
pub fn is_audio_engine_running() -> bool {
    engine::is_running()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library_cache::DirectorySignature;

    fn snapshot() -> DirectorySnapshot {
        DirectorySnapshot {
            schema_version: 1,
            root_path: "C:/Music".to_string(),
            directory_path: "C:/Music".to_string(),
            signature: DirectorySignature {
                mtime: 1,
                entry_count: 3,
                fingerprint: 1,
            },
            cached_at: 1,
            entries: vec![
                CachedEntry {
                    name: "song.mp3".to_string(),
                    path: "C:/Music/song.mp3".to_string(),
                    is_dir: false,
                    ext: "mp3".to_string(),
                    mtime: 1,
                    size: 10,
                    ctime: 1,
                    title: Some("A Song".to_string()),
                    artist: None,
                    album: None,
                    track_number: None,
                    year: None,
                    genre: None,
                    duration: None,
                    title_loaded: true,
                    meta_loaded: true,
                },
                CachedEntry {
                    name: "Album".to_string(),
                    path: "C:/Music/Album".to_string(),
                    is_dir: true,
                    ext: String::new(),
                    mtime: 1,
                    size: 0,
                    ctime: 1,
                    title: None,
                    artist: None,
                    album: None,
                    track_number: None,
                    year: None,
                    genre: None,
                    duration: None,
                    title_loaded: true,
                    meta_loaded: true,
                },
                CachedEntry {
                    name: "notes.txt".to_string(),
                    path: "C:/Music/notes.txt".to_string(),
                    is_dir: false,
                    ext: "txt".to_string(),
                    mtime: 1,
                    size: 4,
                    ctime: 1,
                    title: None,
                    artist: None,
                    album: None,
                    track_number: None,
                    year: None,
                    genre: None,
                    duration: None,
                    title_loaded: false,
                    meta_loaded: false,
                },
            ],
        }
    }

    #[test]
    fn projection_keeps_folders_and_applies_audio_formats() {
        let mut snapshot = snapshot();
        let result = project_snapshot(
            &mut snapshot,
            "name",
            "name",
            "asc",
            "filename",
            &["mp3".to_string()],
        );
        assert_eq!(result.len(), 2);
        assert!(result[0].is_dir);
        assert_eq!(result[1].display_name, "song");
    }

    #[test]
    fn projection_uses_cached_title_without_rescanning_file() {
        let mut snapshot = snapshot();
        let result = project_snapshot(
            &mut snapshot,
            "name",
            "name",
            "asc",
            "title",
            &["mp3".to_string()],
        );
        assert_eq!(result[1].display_name, "A Song");
        assert_eq!(snapshot.entries[0].title.as_deref(), Some("A Song"));
    }

    #[test]
    fn write_tags_native_roundtrip_on_wav_file() {
        let temp_path = std::env::temp_dir().join(format!(
            "symvonia_tag_test_{}.wav",
            std::process::id()
        ));

        // Build a minimal valid 44-byte + 4-byte PCM WAV file (44.1kHz, 16-bit mono, 2 samples)
        let mut wav: Vec<u8> = Vec::with_capacity(48);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&40u32.to_le_bytes()); // file size - 8
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
        wav.extend_from_slice(&1u16.to_le_bytes()); // 1 channel
        wav.extend_from_slice(&44100u32.to_le_bytes()); // sample rate
        wav.extend_from_slice(&88200u32.to_le_bytes()); // byte rate
        wav.extend_from_slice(&2u16.to_le_bytes()); // block align
        wav.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&4u32.to_le_bytes()); // 4 bytes of audio data
        wav.extend_from_slice(&[0u8, 0, 0, 0]);
        std::fs::write(&temp_path, &wav).expect("write temp wav");

        let path_str = temp_path.to_string_lossy().to_string();
        let fake_png_b64 = base64::engine::general_purpose::STANDARD.encode([137u8, 80, 78, 71]);

        write_tags_native(
            &path_str,
            Some("Native Title".to_string()),
            Some("Native Artist".to_string()),
            Some("Native Album".to_string()),
            Some("Electronic".to_string()),
            Some(2026),
            Some(3),
            Some(12),
            Some(1),
            Some(2),
            Some("Tagged in Rust".to_string()),
            Some(fake_png_b64.clone()),
            Some("image/png".to_string()),
        )
        .expect("write_tags_native should succeed");

        let meta = get_metadata(path_str.clone()).expect("get_metadata should succeed");
        assert_eq!(meta.title.as_deref(), Some("Native Title"));
        assert_eq!(meta.artist.as_deref(), Some("Native Artist"));
        assert_eq!(meta.album.as_deref(), Some("Native Album"));
        assert_eq!(meta.genre.as_deref(), Some("Electronic"));
        assert_eq!(meta.year, Some(2026));
        assert_eq!(meta.track_number, Some(3));
        assert_eq!(meta.total_tracks, Some(12));
        assert_eq!(meta.disc_number, Some(1));
        assert_eq!(meta.total_discs, Some(2));
        assert_eq!(meta.comment.as_deref(), Some("Tagged in Rust"));
        assert_eq!(meta.cover_b64.as_deref(), Some(fake_png_b64.as_str()));

        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn probe_wasapi_and_list_devices_smoke_test() {
        let devices = crate::audio::output::get_audio_hosts_and_devices();
        for d in &devices {
            println!("Device: id={} name={} default={}", d.id, d.name, d.is_default);
            if let Ok(res) = probe_wasapi_device(Some(d.id.clone())) {
                println!(
                    "  -> Probe: shared={} exclusive={} rates={:?} not_allowed={} in_use={} msg={}",
                    res.supported_shared,
                    res.supported_exclusive,
                    res.supported_sample_rates,
                    res.exclusive_not_allowed,
                    res.in_use,
                    res.message
                );
            }
        }
    }
}
