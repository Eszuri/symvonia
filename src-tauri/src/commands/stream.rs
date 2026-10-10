use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

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

const YOUTUBE_ADBLOCK_SCRIPT: &str = r#"
(function() {
    function injectAdblockStyle() {
        if (!document.head && !document.documentElement) return;
        if (document.getElementById('symvonia-adblock-style')) return;
        const style = document.createElement('style');
        style.id = 'symvonia-adblock-style';
        style.textContent = `
            .video-ads, .ytp-ad-module, .ytp-ad-overlay-container,
            ytd-promoted-video-renderer, ytd-compact-promoted-video-renderer,
            ytd-promoted-sparkles-web-renderer, ytd-banner-promo-renderer,
            ytd-in-feed-ad-layout-renderer, ytd-ad-slot-renderer,
            #player-ads, #masthead-ad, .ytp-ad-message-container,
            tp-yt-paper-dialog:has(#feedback),
            ytd-enforcement-message-view-model,
            .yt-badge-shape--ad, ad-badge-view-model {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function autoSkipAds() {
        injectAdblockStyle();
        const video = document.querySelector('video');
        const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
        if (video && adShowing) {
            video.muted = true;
            video.playbackRate = 16.0;
            if (isFinite(video.duration) && video.duration > 0) {
                video.currentTime = video.duration;
            }
        }

        const skipButtons = [
            '.ytp-ad-skip-button',
            '.ytp-ad-skip-button-modern',
            '.ytp-skip-ad-button',
            '.ytp-ad-skip-button-text',
            '.ytp-ad-overlay-close-button',
            'button.ytp-ad-skip-button'
        ];
        for (const selector of skipButtons) {
            const btn = document.querySelector(selector);
            if (btn) {
                btn.click();
            }
        }

        const antiAdblockModal = document.querySelector('ytd-enforcement-message-view-model');
        if (antiAdblockModal) {
            antiAdblockModal.remove();
            if (video && video.paused) {
                video.play();
            }
        }
    }

    injectAdblockStyle();
    setInterval(autoSkipAds, 250);
    document.addEventListener('DOMContentLoaded', injectAdblockStyle);
})();
"#;

#[tauri::command]
pub async fn open_webview_stream(
    app: AppHandle,
    url: String,
    label: String,
    title: String,
) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "Invalid stream URL".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host().is_none() {
        return Err("Only http and https stream URLs are allowed".to_string());
    }

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.navigate(parsed);
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(parsed),
    )
    .title(&title)
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .devtools(true)
    .initialization_script(YOUTUBE_ADBLOCK_SCRIPT);

    let _window = builder
        .build()
        .map_err(|e| e.to_string())?;

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
