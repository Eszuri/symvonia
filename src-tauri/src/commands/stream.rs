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

    let adPlaybackState = null;

    function restoreAdPlaybackState() {
        if (!adPlaybackState) return;
        adPlaybackState.video.muted = adPlaybackState.muted;
        adPlaybackState.video.playbackRate = adPlaybackState.playbackRate;
        adPlaybackState = null;
    }

    function autoSkipAds() {
        injectAdblockStyle();
        const video = document.querySelector('video');
        const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
        if (adPlaybackState && (!adShowing || adPlaybackState.video !== video)) {
            restoreAdPlaybackState();
        }
        if (video && adShowing) {
            if (!adPlaybackState) {
                adPlaybackState = {video, muted: video.muted, playbackRate: video.playbackRate};
            }
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
    window.addEventListener('pagehide', restoreAdPlaybackState);
    document.addEventListener('DOMContentLoaded', injectAdblockStyle);
})();
"#;

static LATEST_STREAM_META: std::sync::Mutex<Option<serde_json::Value>> = std::sync::Mutex::new(None);

const STREAM_EXTRACTOR_SCRIPT: &str = r#"
(function() {
    try {
        function clean(s) {
            return s ? String(s).replace(/\s+/g, ' ').trim() : '';
        }

        let title = '';
        let artist = '';
        let album = '';
        let cover = '';
        let isPlaying = false;
        let currentTime = 0;
        let duration = 0;

        const host = (window.location.hostname || '').toLowerCase();
        let platform = 'Web Stream';
        if (host.includes('music.youtube.com')) platform = 'YouTube Music';
        else if (host.includes('youtube.com') || host.includes('youtu.be')) platform = 'YouTube';
        else if (host.includes('spotify.com')) platform = 'Spotify';
        else if (host.includes('soundcloud.com')) platform = 'SoundCloud';
        else if (host.includes('apple.com')) platform = 'Apple Music';
        else if (host.includes('bandcamp.com')) platform = 'Bandcamp';
        else if (host.includes('deezer.com')) platform = 'Deezer';
        else if (host.includes('tidal.com')) platform = 'Tidal';

        // 1. Check navigator.mediaSession
        try {
            if (navigator.mediaSession && navigator.mediaSession.metadata) {
                const m = navigator.mediaSession.metadata;
                title = clean(m.title);
                artist = clean(m.artist);
                album = clean(m.album);
                if (m.artwork && m.artwork.length > 0) {
                    const best = m.artwork[m.artwork.length - 1];
                    if (best && best.src) cover = clean(best.src);
                }
            }
            if (navigator.mediaSession && navigator.mediaSession.playbackState) {
                if (navigator.mediaSession.playbackState === 'playing') isPlaying = true;
            }
        } catch (e) {}

        // 2. Check HTML5 <video> / <audio>
        try {
            const mediaList = Array.from(document.querySelectorAll('video, audio'));
            const activeMedia = mediaList.find(m => !m.paused && m.currentTime > 0) || mediaList[0];
            if (activeMedia) {
                if (!isPlaying) {
                    isPlaying = !activeMedia.paused && !activeMedia.ended && activeMedia.readyState > 0;
                }
                currentTime = Math.round(activeMedia.currentTime || 0);
                if (isFinite(activeMedia.duration) && activeMedia.duration > 0) {
                    duration = Math.round(activeMedia.duration);
                }
                if (!cover && activeMedia.poster) {
                    cover = clean(activeMedia.poster);
                }
            }
        } catch (e) {}

        // 3. Platform DOM heuristics
        try {
            if (platform === 'YouTube') {
                if (!title) {
                    const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, ytd-watch-metadata #title h1, h1.title.style-scope.ytd-video-primary-info-renderer, #above-the-fold #title h1, .ytp-title-link');
                    if (el) title = clean(el.innerText || el.textContent);
                }
                if (!artist) {
                    const ch = document.querySelector('#upload-info ytd-channel-name yt-formatted-string a, #channel-name a, #owner #channel-name a, ytd-video-owner-renderer #channel-name a');
                    if (ch) artist = clean(ch.innerText || ch.textContent);
                }
                if (!cover) {
                    const vMatch = window.location.search.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                    if (vMatch && vMatch[1]) {
                        cover = 'https://i.ytimg.com/vi/' + vMatch[1] + '/hqdefault.jpg';
                    }
                }
            } else if (platform === 'YouTube Music') {
                if (!title) {
                    const el = document.querySelector('ytmusic-player-bar .title, .ytmusic-player-bar .title, .middle-controls .title');
                    if (el) title = clean(el.innerText || el.textContent);
                }
                if (!artist) {
                    const ch = document.querySelector('ytmusic-player-bar .byline a, .ytmusic-player-bar .byline a, ytmusic-player-bar .byline');
                    if (ch) artist = clean(ch.innerText || ch.textContent);
                }
                if (!cover) {
                    const img = document.querySelector('ytmusic-player-bar .image, .ytmusic-player-bar img');
                    if (img && img.src) cover = clean(img.src);
                }
                const playBtn = document.querySelector('ytmusic-player-bar #play-pause-button, #play-pause-button');
                if (playBtn) {
                    const label = (playBtn.getAttribute('aria-label') || '').toLowerCase();
                    if (label.includes('pause') || label.includes('jeda')) isPlaying = true;
                    else if (label.includes('play') || label.includes('putar')) isPlaying = false;
                }
            } else if (platform === 'Spotify') {
                if (!title) {
                    const el = document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-link"], [data-testid="context-item-info-title"] a, [data-testid="now-playing-widget"] [data-testid="track-name"]');
                    if (el) title = clean(el.innerText || el.textContent);
                }
                if (!artist) {
                    const el = document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-info-artist"] a, [data-testid="now-playing-widget"] [data-testid="context-item-info-artist"]');
                    if (el) artist = clean(el.innerText || el.textContent);
                }
                if (!cover) {
                    const img = document.querySelector('[data-testid="now-playing-widget"] img, [data-testid="cover-art-image"]');
                    if (img && img.src) cover = clean(img.src);
                }
                const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
                if (playBtn) {
                    const label = (playBtn.getAttribute('aria-label') || '').toLowerCase();
                    if (label.includes('pause') || label.includes('jeda')) isPlaying = true;
                    else if (label.includes('play') || label.includes('putar')) isPlaying = false;
                }
                if (duration <= 0) {
                    const curEl = document.querySelector('[data-testid="playback-position"]');
                    const durEl = document.querySelector('[data-testid="playback-duration"]');
                    if (durEl && durEl.textContent) {
                        const parts = durEl.textContent.trim().split(':');
                        if (parts.length === 2) duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                    }
                    if (curEl && curEl.textContent) {
                        const parts = curEl.textContent.trim().split(':');
                        if (parts.length === 2) currentTime = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                    }
                }
            } else if (platform === 'SoundCloud') {
                if (!title) {
                    const el = document.querySelector('.playbackSoundBadge__titleLink');
                    if (el) title = clean(el.title || el.innerText);
                }
                if (!artist) {
                    const el = document.querySelector('.playbackSoundBadge__lightLink');
                    if (el) artist = clean(el.title || el.innerText);
                }
                if (!cover) {
                    const avatar = document.querySelector('.playbackSoundBadge__avatar span');
                    if (avatar && avatar.style && avatar.style.backgroundImage) {
                        const m = avatar.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (m && m[1]) cover = clean(m[1]);
                    }
                }
                const scPlay = document.querySelector('.playControl');
                if (scPlay) {
                    isPlaying = scPlay.classList.contains('playing');
                }
            } else if (platform === 'Apple Music') {
                if (!title) {
                    const el = document.querySelector('.web-chrome-playback-lcd__song-name, [data-testid="lcd-song-title"]');
                    if (el) title = clean(el.innerText || el.textContent);
                }
                if (!artist) {
                    const el = document.querySelector('.web-chrome-playback-lcd__sub-copy-scroll-inner a');
                    if (el) artist = clean(el.innerText || el.textContent);
                }
                if (!cover) {
                    const img = document.querySelector('.web-chrome-playback-lcd__artwork img');
                    if (img && img.src) cover = clean(img.src);
                }
            }
        } catch (e) {}

        // 4. Fallback document.title
        if (!title) {
            let docTitle = clean(document.title);
            if (docTitle) {
                docTitle = docTitle.replace(/^\(\d+\+?\)\s*/, '');
                if (platform === 'Spotify' && docTitle.includes(' | Spotify')) {
                    const cleanT = docTitle.replace(' | Spotify', '');
                    const parts = cleanT.split(' • ');
                    title = clean(parts[0]);
                    if (!artist && parts[1]) artist = clean(parts[1]);
                } else if (platform === 'YouTube Music' && docTitle.includes(' - YouTube Music')) {
                    const cleanT = docTitle.replace(' - YouTube Music', '');
                    const parts = cleanT.split(' - ');
                    title = clean(parts[0]);
                    if (!artist && parts[1]) artist = clean(parts[1]);
                } else if (platform === 'YouTube' && docTitle.includes(' - YouTube')) {
                    title = clean(docTitle.replace(' - YouTube', ''));
                } else if (platform === 'SoundCloud' && (docTitle.includes(' | Stream on SoundCloud') || docTitle.includes(' - SoundCloud'))) {
                    const cleanT = docTitle.replace(' | Stream on SoundCloud', '').replace(' - SoundCloud', '');
                    const parts = cleanT.split(' by ');
                    title = clean(parts[0]);
                    if (!artist && parts[1]) artist = clean(parts[1]);
                } else {
                    title = docTitle;
                }
            }
        }

        if (!artist) {
            artist = platform;
        }

        if (!cover) {
            try {
                const og = document.querySelector('meta[property="og:image"]');
                if (og && og.content) cover = clean(og.content);
            } catch (e) {}
        }

        const lowerTitle = title.toLowerCase();
        if (!title || lowerTitle === 'youtube' || lowerTitle === 'spotify' || lowerTitle === 'soundcloud' || lowerTitle === 'web player') {
            return null;
        }

        return JSON.stringify({
            platform: platform,
            title: title,
            artist: artist,
            album: album,
            cover: cover,
            isPlaying: isPlaying,
            currentTime: currentTime,
            duration: duration
        });
    } catch (err) {
        return null;
    }
})()
"#;

pub fn get_latest_stream_meta_value() -> Option<serde_json::Value> {
    if let Ok(lock) = LATEST_STREAM_META.lock() {
        lock.clone()
    } else {
        None
    }
}

#[tauri::command]
pub fn get_latest_stream_metadata() -> Option<serde_json::Value> {
    get_latest_stream_meta_value()
}

fn process_and_emit_stream_metadata(app: &AppHandle, label: &str, raw_json: &str) {
    if raw_json.trim().is_empty() || raw_json == "null" || raw_json == "\"null\"" {
        return;
    }
    let parsed: Option<serde_json::Value> = serde_json::from_str(raw_json)
        .ok()
        .and_then(|val| {
            if let serde_json::Value::String(s) = val {
                serde_json::from_str(&s).ok()
            } else {
                Some(val)
            }
        });

    if let Some(mut val) = parsed {
        if let Some(obj) = val.as_object_mut() {
            let title = obj.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
            if !title.is_empty() {
                obj.insert("label".to_string(), serde_json::Value::String(label.to_string()));
                if let Ok(mut lock) = LATEST_STREAM_META.lock() {
                    *lock = Some(val.clone());
                }
                let _ = app.emit("stream-metadata-sync", &val);
            }
        }
    }
}

#[tauri::command]
pub async fn open_webview_stream(
    app: AppHandle,
    url: String,
    label: String,
    title: String,
) -> Result<(), String> {
    if matches!(label.as_str(), "main" | "media-overlay") {
        return Err("This window label is reserved for the application".to_string());
    }
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

    let stream_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("streaming-webview");

    let app_for_title = app.clone();
    let label_for_title = label.clone();

    let builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(parsed),
    )
    .title(&title)
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .data_directory(stream_data_dir)
    .devtools(true)
    .initialization_script(YOUTUBE_ADBLOCK_SCRIPT)
    .on_document_title_changed(move |w, _doc_title| {
        let app_inner = app_for_title.clone();
        let label_inner = label_for_title.clone();
        let _ = w.eval_with_callback(
            STREAM_EXTRACTOR_SCRIPT,
            move |raw_json| {
                process_and_emit_stream_metadata(&app_inner, &label_inner, &raw_json);
            },
        );
    });

    let _window = builder
        .build()
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let label_clone = label.clone();
    std::thread::spawn(move || {
        let mut last_url: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            if let Some(w) = app_clone.get_webview_window(&label_clone) {
                if let Ok(current_url) = w.url() {
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

                let app_inner = app_clone.clone();
                let label_inner = label_clone.clone();
                let _ = w.eval_with_callback(
                    STREAM_EXTRACTOR_SCRIPT,
                    move |raw_json| {
                        process_and_emit_stream_metadata(&app_inner, &label_inner, &raw_json);
                    },
                );
            } else {
                if let Ok(mut lock) = LATEST_STREAM_META.lock() {
                    *lock = None;
                }
                let _ = app_clone.emit("stream-closed", serde_json::json!({
                    "label": label_clone
                }));
                break; // window closed
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn control_stream_playback(
    app: AppHandle,
    label: Option<String>,
    action: String,
) -> Result<(), String> {
    let target_window = if let Some(ref l) = label {
        app.get_webview_window(l)
    } else {
        app.webview_windows()
            .into_iter()
            .find(|(k, _)| k != "main" && k != "media-overlay")
            .map(|(_, w)| w)
    };

    if let Some(w) = target_window {
        match action.as_str() {
            "toggle_play_pause" => {
                let _ = w.eval(r#"
                    (function() {
                        // 1. Try Spotify play/pause button
                        const spotifyBtn = document.querySelector('button[data-testid="control-button-playpause"]');
                        if (spotifyBtn) { spotifyBtn.click(); return; }

                        // 2. Try YouTube Music play-pause button
                        const ytMusicBtn = document.querySelector('#play-pause-button');
                        if (ytMusicBtn) { ytMusicBtn.click(); return; }

                        // 3. Try YouTube standard video player button
                        const ytBtn = document.querySelector('.ytp-play-button');
                        if (ytBtn) { ytBtn.click(); return; }

                        // 4. Try SoundCloud play button
                        const scBtn = document.querySelector('.playControl');
                        if (scBtn) { scBtn.click(); return; }

                        // 5. Try HTML5 video/audio
                        const m = document.querySelector('video, audio');
                        if (m) {
                            if (m.paused) m.play(); else m.pause();
                        }
                    })();
                "#);
            }
            "next" => {
                let _ = w.eval(r#"
                    (function() {
                        // 1. Try Spotify next
                        const spotifyNext = document.querySelector('button[data-testid="control-button-skip-forward"]');
                        if (spotifyNext) { spotifyNext.click(); return; }

                        // 2. Try YouTube Music next
                        const ytMusicNext = document.querySelector('.next-button, ytmusic-player-bar .next-button');
                        if (ytMusicNext) { ytMusicNext.click(); return; }

                        // 3. Try YouTube next
                        const ytNext = document.querySelector('.ytp-next-button');
                        if (ytNext) { ytNext.click(); return; }

                        // 4. Try SoundCloud next
                        const scNext = document.querySelector('.skipControl__next');
                        if (scNext) { scNext.click(); return; }
                    })();
                "#);
            }
            "prev" => {
                let _ = w.eval(r#"
                    (function() {
                        // 1. Try Spotify prev
                        const spotifyPrev = document.querySelector('button[data-testid="control-button-skip-back"]');
                        if (spotifyPrev) { spotifyPrev.click(); return; }

                        // 2. Try YouTube Music prev
                        const ytMusicPrev = document.querySelector('.previous-button, ytmusic-player-bar .previous-button');
                        if (ytMusicPrev) { ytMusicPrev.click(); return; }

                        // 3. Try YouTube prev
                        const ytPrev = document.querySelector('.ytp-prev-button');
                        if (ytPrev) { ytPrev.click(); return; }

                        // 4. Try SoundCloud prev
                        const scPrev = document.querySelector('.skipControl__previous');
                        if (scPrev) { scPrev.click(); return; }
                    })();
                "#);
            }
            "focus" => {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            _ => {}
        }
    }
    Ok(())
}

