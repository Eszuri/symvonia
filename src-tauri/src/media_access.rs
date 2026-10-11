use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct MediaAccess {
    files: Mutex<HashSet<PathBuf>>,
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp3"
                    | "flac"
                    | "wav"
                    | "ogg"
                    | "m4a"
                    | "aac"
                    | "opus"
                    | "wma"
                    | "webm"
                    | "mp4"
                    | "aiff"
                    | "aif"
            )
        })
}

impl MediaAccess {
    pub fn allow_file(&self, path: &Path) {
        if is_audio(path) && path.is_file() {
            if let (Ok(path), Ok(mut files)) = (path.canonicalize(), self.files.lock()) {
                files.insert(path);
            }
        }
    }

    pub fn resolve(&self, path: &Path, root: Option<&Path>) -> Option<PathBuf> {
        if !is_audio(path) {
            return None;
        }
        let path = path.canonicalize().ok()?;
        if !is_audio(&path) || !path.is_file() {
            return None;
        }
        // Canonicalize before checking containment to reject traversal and symlink escapes.
        let in_library = root
            .and_then(|root| root.canonicalize().ok())
            .is_some_and(|root| path.starts_with(root));
        let explicitly_allowed = self.files.lock().ok()?.contains(&path);
        (in_library || explicitly_allowed).then_some(path)
    }
}

pub fn trusted_origin(origin: &str) -> bool {
    matches!(
        origin,
        "http://tauri.localhost" | "https://tauri.localhost" | "tauri://localhost"
    ) || (cfg!(debug_assertions)
        && matches!(origin, "http://localhost:3000" | "http://127.0.0.1:3000"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_origins_are_rejected() {
        assert!(trusted_origin("http://tauri.localhost"));
        assert!(!trusted_origin("https://example.com"));
        assert!(!trusted_origin("http://tauri.localhost.evil.com"));
        assert!(!trusted_origin("null"));
    }

    #[test]
    fn only_library_or_explicit_audio_files_are_allowed() {
        let dir = std::env::temp_dir().join(format!("symvonia-access-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("library")).unwrap();
        let song = dir.join("library/song.mp3");
        let outside = dir.join("outside.flac");
        let secret = dir.join("library/config.json");
        for file in [&song, &outside, &secret] {
            std::fs::write(file, b"test").unwrap();
        }
        let access = MediaAccess::default();
        let root = dir.join("library");
        assert!(access.resolve(&song, Some(&root)).is_some());
        assert!(access.resolve(&outside, Some(&root)).is_none());
        assert!(access
            .resolve(&root.join("../outside.flac"), Some(&root))
            .is_none());
        assert!(access.resolve(&secret, Some(&root)).is_none());
        access.allow_file(&outside);
        assert!(access.resolve(&outside, None).is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
