use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const CACHE_SCHEMA_VERSION: u32 = 3;
const CACHE_DIR_NAME: &str = "library-cache";
const INVALIDATION_EVENT: &str = "library-cache-invalidated";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub mtime: u64,
    pub size: u64,
    pub ctime: u64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub title_loaded: bool,
    pub meta_loaded: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DirectorySignature {
    pub mtime: u64,
    pub entry_count: usize,
    pub fingerprint: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectorySnapshot {
    pub schema_version: u32,
    pub root_path: String,
    pub directory_path: String,
    pub signature: DirectorySignature,
    pub cached_at: u64,
    pub entries: Vec<CachedEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryCacheInvalidatedPayload {
    pub root_path: String,
    pub affected_paths: Vec<String>,
}

struct WatchHandle {
    stop_tx: mpsc::Sender<()>,
    thread: thread::JoinHandle<()>,
}

#[derive(Clone)]
pub struct LibraryCacheState {
    inner: Arc<Mutex<LibraryCacheInner>>,
}

struct LibraryCacheInner {
    root_path: Option<String>,
    memory: HashMap<String, DirectorySnapshot>,
    dirty: HashSet<String>,
    watcher: Option<WatchHandle>,
}

impl Default for LibraryCacheState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(LibraryCacheInner {
                root_path: None,
                memory: HashMap::new(),
                dirty: HashSet::new(),
                watcher: None,
            })),
        }
    }
}

impl LibraryCacheState {
    pub fn set_root(&self, app: &AppHandle, root: Option<String>) -> Result<(), String> {
        self.stop_watcher();
        let normalized_root = root.filter(|path| !path.trim().is_empty());
        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "Cache lock poisoned".to_string())?;
            inner.root_path = normalized_root.clone();
            inner.memory.clear();
            inner.dirty.clear();
        }
        if let Some(root_path) = normalized_root {
            self.start_watcher(app.clone(), root_path)?;
        }
        Ok(())
    }

    pub fn clear_snapshots(&self, app: &AppHandle) -> Result<(), String> {
        let cache_dir = cache_base_dir(app)?;
        if cache_dir.exists() {
            fs::remove_dir_all(&cache_dir)
                .map_err(|e| format!("Failed to clear library cache: {}", e))?;
        }
        let current_root = {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "Cache lock poisoned".to_string())?;
            inner.memory.clear();
            inner.dirty.clear();
            inner.root_path.clone()
        };

        if let Some(root_path) = current_root {
            let has_watcher = self
                .inner
                .lock()
                .map(|inner| inner.watcher.is_some())
                .unwrap_or(false);
            if !has_watcher {
                let _ = self.start_watcher(app.clone(), root_path.clone());
            }

            let payload = LibraryCacheInvalidatedPayload {
                root_path: root_path.clone(),
                affected_paths: vec![root_path, "*".to_string()],
            };
            let _ = app.emit(INVALIDATION_EVENT, payload);
        }
        Ok(())
    }

    /// Detaches the library: stops the filesystem watcher and resets active root, memory, and dirty state.
    pub fn detach(&self) -> Result<(), String> {
        self.stop_watcher();
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        inner.root_path = None;
        inner.memory.clear();
        inner.dirty.clear();
        Ok(())
    }

    /// Clears directory snapshots while retaining root and watcher.
    pub fn clear(&self, app: &AppHandle) -> Result<(), String> {
        self.clear_snapshots(app)
    }

    pub fn active_root(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.root_path.clone())
    }

    pub fn mark_dirty(&self, paths: &[String]) {
        if let Ok(mut inner) = self.inner.lock() {
            for path in paths {
                inner.dirty.insert(normalize_path(path));
            }
        }
    }

    pub fn invalidate_path(&self, path: &str) {
        self.mark_dirty(&[path.to_string()]);
    }

    pub fn load_or_scan<F>(
        &self,
        app: &AppHandle,
        root_path: &str,
        directory_path: &str,
        scan: F,
    ) -> Result<DirectorySnapshot, String>
    where
        F: FnOnce() -> Result<DirectorySnapshot, String>,
    {
        let key = normalize_path(directory_path);
        let is_dirty = self
            .inner
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?
            .dirty
            .contains(&key);
        if !is_dirty {
            if let Some(snapshot) = self
                .inner
                .lock()
                .map_err(|_| "Cache lock poisoned".to_string())?
                .memory
                .get(&key)
                .cloned()
            {
                return Ok(snapshot);
            }
            if let Some(snapshot) = read_snapshot(app, root_path, directory_path)? {
                if snapshot_is_current(&snapshot) {
                    self.inner
                        .lock()
                        .map_err(|_| "Cache lock poisoned".to_string())?
                        .memory
                        .insert(key.clone(), snapshot.clone());
                    return Ok(snapshot);
                }
            }
        }

        let snapshot = scan()?;
        let _ = write_snapshot(app, &snapshot);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        inner.memory.insert(key.clone(), snapshot.clone());
        inner.dirty.remove(&key);
        Ok(snapshot)
    }

    pub fn update_snapshot(&self, snapshot: DirectorySnapshot) -> Result<(), String> {
        let key = normalize_path(&snapshot.directory_path);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        inner.memory.insert(key.clone(), snapshot);
        inner.dirty.remove(&key);
        Ok(())
    }

    fn start_watcher(&self, app: AppHandle, root_path: String) -> Result<(), String> {
        let (stop_tx, stop_rx) = mpsc::channel();
        let watcher_root = root_path.clone();
        let inner = Arc::clone(&self.inner);
        let thread = thread::Builder::new()
            .name("library-cache-watcher".to_string())
            .spawn(move || {
                let (event_tx, event_rx) = mpsc::channel();
                let mut watcher = match RecommendedWatcher::new(
                    move |result| {
                        let _ = event_tx.send(result);
                    },
                    Config::default().with_poll_interval(Duration::from_millis(500)),
                ) {
                    Ok(watcher) => watcher,
                    Err(error) => {
                        eprintln!("[Symvonia Cache] Failed to create watcher: {}", error);
                        return;
                    }
                };
                if let Err(error) =
                    watcher.watch(Path::new(&watcher_root), RecursiveMode::Recursive)
                {
                    eprintln!("[Symvonia Cache] Failed to watch library root: {}", error);
                    return;
                }

                let mut pending_paths = HashSet::new();
                let mut last_event_at: Option<Instant> = None;
                loop {
                    if stop_rx.try_recv().is_ok() {
                        break;
                    }
                    match event_rx.recv_timeout(Duration::from_millis(100)) {
                        Ok(Ok(event)) => {
                            pending_paths.extend(affected_directories(&event, &watcher_root));
                            last_event_at = Some(Instant::now());
                        }
                        Ok(Err(error)) => {
                            eprintln!("[Symvonia Cache] Watcher event error: {}", error);
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if let Some(last) = last_event_at {
                                if last.elapsed() >= Duration::from_millis(350)
                                    && !pending_paths.is_empty()
                                {
                                    let paths: Vec<String> = pending_paths.drain().collect();
                                    if let Ok(mut cache) = inner.lock() {
                                        for path in &paths {
                                            cache.dirty.insert(normalize_path(path));
                                        }
                                    }
                                    let payload = LibraryCacheInvalidatedPayload {
                                        root_path: watcher_root.clone(),
                                        affected_paths: paths,
                                    };
                                    let _ = app.emit(INVALIDATION_EVENT, payload);
                                    last_event_at = None;
                                }
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .map_err(|e| format!("Failed to start library watcher: {}", e))?;

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        inner.watcher = Some(WatchHandle { stop_tx, thread });
        Ok(())
    }

    fn stop_watcher(&self) {
        let handle = self
            .inner
            .lock()
            .ok()
            .and_then(|mut inner| inner.watcher.take());
        if let Some(handle) = handle {
            let _ = handle.stop_tx.send(());
            let _ = handle.thread.join();
        }
    }
}

pub fn cache_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;
    Ok(base.join(CACHE_DIR_NAME))
}

fn root_cache_dir(app: &AppHandle, root_path: &str) -> Result<PathBuf, String> {
    Ok(cache_base_dir(app)?.join(hash_path(root_path)))
}

fn snapshot_path(
    app: &AppHandle,
    root_path: &str,
    directory_path: &str,
) -> Result<PathBuf, String> {
    Ok(root_cache_dir(app, root_path)?.join(format!("{}.json", hash_path(directory_path))))
}

fn hash_path(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_path(path).as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

pub fn directory_signature(path: &Path) -> Result<DirectorySignature, String> {
    let metadata =
        fs::metadata(path).map_err(|e| format!("Failed to read directory metadata: {}", e))?;
    let mtime = metadata
        .modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let mut entry_count = 0usize;
    let mut fingerprint = 0u64;
    for entry in fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        entry_count += 1;
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let child_mtime = metadata
            .modified()
            .unwrap_or(UNIX_EPOCH)
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        for byte in name.as_bytes() {
            fingerprint = fingerprint.rotate_left(5) ^ u64::from(*byte);
        }
        fingerprint = fingerprint.rotate_left(7) ^ child_mtime ^ metadata.len();
    }
    Ok(DirectorySignature {
        mtime,
        entry_count,
        fingerprint,
    })
}

pub fn snapshot_is_current(snapshot: &DirectorySnapshot) -> bool {
    let path = Path::new(&snapshot.directory_path);
    directory_signature(path)
        .map(|signature| signature == snapshot.signature)
        .unwrap_or(false)
}

fn read_snapshot(
    app: &AppHandle,
    root_path: &str,
    directory_path: &str,
) -> Result<Option<DirectorySnapshot>, String> {
    let path = match snapshot_path(app, root_path, directory_path) {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };
    let snapshot = match serde_json::from_str::<DirectorySnapshot>(&content) {
        Ok(snapshot) => snapshot,
        Err(_) => return Ok(None),
    };
    if snapshot.schema_version != CACHE_SCHEMA_VERSION
        || normalize_path(&snapshot.root_path) != normalize_path(root_path)
        || normalize_path(&snapshot.directory_path) != normalize_path(directory_path)
    {
        return Ok(None);
    }
    Ok(Some(snapshot))
}

pub fn write_snapshot(app: &AppHandle, snapshot: &DirectorySnapshot) -> Result<(), String> {
    let path = snapshot_path(app, &snapshot.root_path, &snapshot.directory_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("snapshot.json");
    let temp_path = path.with_file_name(format!(".{}.tmp-{}", file_name, now_nanos()));
    let bytes =
        serde_json::to_vec(snapshot).map_err(|e| format!("Failed to serialize cache: {}", e))?;
    fs::write(&temp_path, bytes).map_err(|e| format!("Failed to write cache: {}", e))?;
    if let Err(error) = fs::rename(&temp_path, &path) {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to replace cache: {} ({})", error, e))?;
            fs::rename(&temp_path, &path).map_err(|e| format!("Failed to replace cache: {}", e))?;
        } else {
            return Err(format!("Failed to replace cache: {}", error));
        }
    }
    Ok(())
}

pub fn make_snapshot(
    root_path: &str,
    directory_path: &str,
    entries: Vec<CachedEntry>,
) -> Result<DirectorySnapshot, String> {
    Ok(DirectorySnapshot {
        schema_version: CACHE_SCHEMA_VERSION,
        root_path: root_path.to_string(),
        directory_path: directory_path.to_string(),
        signature: directory_signature(Path::new(directory_path))?,
        cached_at: now_secs(),
        entries,
    })
}

fn is_within_root(path: &Path, root_path: &str) -> bool {
    let path = normalize_path(&path.to_string_lossy());
    let root = normalize_path(root_path);
    path == root || path.starts_with(&(root + "/"))
}

fn affected_directories(event: &Event, root_path: &str) -> Vec<String> {
    let mut affected = HashSet::new();
    for path in &event.paths {
        if !is_within_root(path, root_path) {
            continue;
        }
        affected.insert(path.to_string_lossy().to_string());
        if let Some(parent) = path.parent() {
            if is_within_root(parent, root_path) {
                affected.insert(parent.to_string_lossy().to_string());
            }
        }
    }
    affected.into_iter().collect()
}

#[tauri::command]
pub fn set_library_root(
    app: AppHandle,
    state: State<'_, LibraryCacheState>,
    path: Option<String>,
) -> Result<(), String> {
    state.set_root(&app, path)
}

#[tauri::command]
pub fn clear_library_cache(
    app: AppHandle,
    state: State<'_, LibraryCacheState>,
) -> Result<(), String> {
    state.clear(&app)
}

#[tauri::command]
pub fn invalidate_library_directory(
    state: State<'_, LibraryCacheState>,
    path: String,
) -> Result<(), String> {
    state.invalidate_path(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{EventKind, ModifyKind};

    #[test]
    fn normalize_path_is_case_insensitive_and_slash_agnostic() {
        assert_eq!(normalize_path(r"C:\Music\Album\"), "c:/music/album");
    }

    #[test]
    fn hash_path_is_stable_for_equivalent_windows_paths() {
        assert_eq!(hash_path(r"C:\Music\"), hash_path("c:/music"));
    }

    #[test]
    fn cache_payload_round_trips() {
        let snapshot = DirectorySnapshot {
            schema_version: CACHE_SCHEMA_VERSION,
            root_path: "C:/Music".to_string(),
            directory_path: "C:/Music".to_string(),
            signature: DirectorySignature {
                mtime: 1,
                entry_count: 2,
                fingerprint: 3,
            },
            cached_at: 4,
            entries: Vec::new(),
        };
        let encoded = serde_json::to_string(&snapshot).unwrap();
        let decoded: DirectorySnapshot = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded.schema_version, CACHE_SCHEMA_VERSION);
        assert_eq!(decoded.signature.entry_count, 2);
    }

    #[test]
    fn file_changes_invalidate_parent_directory() {
        let event = Event {
            kind: EventKind::Modify(ModifyKind::Any),
            paths: vec![PathBuf::from("C:/Music/Album/song.mp3")],
            attrs: Default::default(),
        };
        let affected = affected_directories(&event, "C:/Music");
        assert!(affected.iter().any(|path| path == "C:/Music/Album"));
    }

    #[test]
    fn detach_resets_root_and_state() {
        let state = LibraryCacheState::default();
        {
            let mut inner = state.inner.lock().unwrap();
            inner.root_path = Some("C:/Music".to_string());
            inner.dirty.insert("c:/music".to_string());
        }
        assert_eq!(state.active_root(), Some("C:/Music".to_string()));
        state.detach().unwrap();
        assert_eq!(state.active_root(), None);
        let inner = state.inner.lock().unwrap();
        assert!(inner.dirty.is_empty());
        assert!(inner.memory.is_empty());
    }
}
