'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getAccent} from '../lib/colors';
import type {SymvoniaConfig} from '../lib/storage';
import type {MediaOverlaySyncPayload, MediaOverlayTimePayload} from '../hooks/useMediaOverlaySync';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const CoverThumbnail = React.memo(function CoverThumbnail({
    coverDataUrl,
    size = 'm',
}: {
    coverDataUrl: string | null;
    size?: 's' | 'm' | 'l' | 'xl';
}) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const isError = Boolean(coverDataUrl && failedUrl === coverDataUrl);

    const dim = size === 's' ? 32 : size === 'l' ? 46 : size === 'xl' ? 54 : 38;
    const iconDim = size === 's' ? 15 : size === 'l' ? 22 : size === 'xl' ? 26 : 18;

    return (
        <div
            style={{
                width: `${dim}px`,
                height: `${dim}px`,
                minWidth: `${dim}px`,
                minHeight: `${dim}px`,
                maxWidth: `${dim}px`,
                maxHeight: `${dim}px`,
                flexShrink: 0,
            }}
            className="rounded-md overflow-hidden bg-zinc-900 border border-zinc-800/80 flex items-center justify-center shadow-sm relative shrink-0"
        >
            {coverDataUrl && !isError ? (
                <img
                    src={coverDataUrl}
                    alt="Cover Art"
                    width={dim}
                    height={dim}
                    decoding="async"
                    onError={() => {
                        if (coverDataUrl) setFailedUrl(coverDataUrl);
                    }}
                    style={{
                        width: `${dim}px`,
                        height: `${dim}px`,
                        maxWidth: `${dim}px`,
                        maxHeight: `${dim}px`,
                        objectFit: 'cover',
                        display: 'block',
                    }}
                />
            ) : (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={iconDim}
                    height={iconDim}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-zinc-600"
                >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                </svg>
            )}
        </div>
    );
});

interface MediaControlsProps {
    isPlaying: boolean;
    accentBg: string;
    isAccentBg?: boolean;
    onPrev: () => void;
    onTogglePlayPause: () => void;
    onNext: () => void;
    size?: 's' | 'm' | 'l' | 'xl';
}

const MediaControls = React.memo(function MediaControls({
    isPlaying,
    accentBg,
    isAccentBg = false,
    onPrev,
    onTogglePlayPause,
    onNext,
    size = 'm',
}: MediaControlsProps) {
    const prevNextIconSize = size === 's' ? 11 : size === 'l' ? 15 : size === 'xl' ? 17 : 13;
    const playIconSize = size === 's' ? 11 : size === 'l' ? 15 : size === 'xl' ? 17 : 13;
    const gapClass = size === 's' ? 'gap-2.5' : size === 'l' ? 'gap-5' : size === 'xl' ? 'gap-6' : 'gap-4';
    const playBtnSizeClass = size === 's' ? 'w-5 h-5' : size === 'l' ? 'w-7 h-7' : size === 'xl' ? 'w-8 h-8' : 'w-6 h-6';
    const playBtnColor = isAccentBg ? 'bg-white text-zinc-950 hover:bg-white/90' : `${accentBg} text-white hover:brightness-110`;

    return (
        <div className={`flex items-center justify-center ${gapClass} pt-0.5`}>
            <button
                type="button"
                onClick={onPrev}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
                title="Previous"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width={prevNextIconSize} height={prevNextIconSize} viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="19 20 9 12 19 4 19 20" />
                    <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </button>

            <button
                type="button"
                onClick={onTogglePlayPause}
                className={`${playBtnSizeClass} rounded-full ${playBtnColor} active:scale-95 shadow-sm transition flex items-center justify-center cursor-pointer shrink-0`}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width={playIconSize} height={playIconSize} viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6.5" y="5.5" width="3.25" height="13" rx="1.25" />
                        <rect x="14.25" y="5.5" width="3.25" height="13" rx="1.25" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width={playIconSize} height={playIconSize} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 0 0 0-1.69L9.54 5.98A.998.998 0 0 0 8 6.82z" />
                    </svg>
                )}
            </button>

            <button
                type="button"
                onClick={onNext}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
                title="Next"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width={prevNextIconSize} height={prevNextIconSize} viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
});

export interface StreamMetadataPayload {
    label: string;
    platform: string;
    title: string;
    artist: string;
    album?: string;
    cover?: string;
    isPlaying: boolean;
    currentTime?: number;
    duration?: number;
}

const PlatformIcon = React.memo(function PlatformIcon({
    platform,
    size = 11,
}: {
    platform?: string;
    size?: number;
}) {
    const p = (platform || '').toLowerCase();
    if (p.includes('youtube music')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#FF0000" />
                <circle cx="24" cy="24" r="10" stroke="#FFF" strokeWidth="2.5" fill="none" />
                <path d="M21 17v14l11-7-11-7z" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('youtube')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <path d="M43.2 13.2a5.1 5.1 0 0 0-3.6-3.6C36.2 8.6 24 8.6 24 8.6s-12.2 0-15.6 1a5.1 5.1 0 0 0-3.6 3.6C3.8 16.6 3.8 24 3.8 24s0 7.4 1 10.8a5.1 5.1 0 0 0 3.6 3.6c3.4 1 15.6 1 15.6 1s12.2 0 15.6-1a5.1 5.1 0 0 0 3.6-3.6c1-3.4 1-10.8 1-10.8s0-7.4-1-10.8z" fill="#FF0000" />
                <path d="M19.5 30.3V17.7L31.3 24l-11.8 6.3z" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('spotify')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#1DB954" />
                <path d="M34.4 21.2c-5.7-3.4-15.2-3.7-20.7-2-.9.3-1.8-.2-2.1-1.1-.3-.9.2-1.8 1.1-2.1 6.3-1.9 16.8-1.6 23.4 2.4.8.5 1.1 1.5.6 2.4-.5.8-1.6 1.1-2.3.4zm-.3 5.7c-.4.7-1.3.9-2 .5-4.8-2.9-12.1-3.8-17.7-2.1-.8.2-1.6-.2-1.8-1-.2-.8.2-1.6 1-1.8 6.4-1.9 14.4-.9 20 2.5.7.4.9 1.3.5 1.9zm-2.3 5.5c-.3.6-1 .8-1.6.4-4.2-2.5-9.4-3.1-15.6-1.7-.7.2-1.3-.2-1.5-.8-.2-.7.2-1.3.8-1.5 6.9-1.6 12.8-.9 17.6 2 .6.3.8 1 .5 1.6z" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('soundcloud')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#FF5500" />
                <path d="M33.5 26.5c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5s-.5.2-.5.5v2c0 .3.2.5.5.5zm-2.3 1.5c.3 0 .5-.2.5-.5v-4c0-.3-.2-.5-.5-.5s-.5.2-.5.5v4c0 .3.2.5.5.5zm-2.3 1c.3 0 .5-.2.5-.5v-5c0-.3-.2-.5-.5-.5s-.5.2-.5.5v5c0 .3.2.5.5.5zm-2.3.5c.3 0 .5-.2.5-.5v-5.5c0-.3-.2-.5-.5-.5s-.5.2-.5.5v5.5c0 .3.2.5.5.5zm-2.3.5c.3 0 .5-.2.5-.5v-6c0-.3-.2-.5-.5-.5s-.5.2-.5.5v6c0 .3.2.5.5.5zm-9.5-1c.8 0 1.5-.7 1.5-1.5v-5c0-.8-.7-1.5-1.5-1.5S13 20.7 13 21.5v5c0 .8.7 1.5 1.5 1.5zm-1.5-9.5h2c.3 0 .5-.2.5-.5v-1c0-.3-.2-.5-.5-.5h-2c-.3 0-.5.2-.5.5v1c0 .3.2.5.5.5zm20.8 2c1.5 0 2.8-1.2 2.8-2.8V15c0-.3-.2-.5-.5-.5s-.5.2-.5.5v1.2c0 .7-.6 1.3-1.3 1.3h-.5z" fill="#FFF" />
                <path d="M35.8 22c0-3.2-2.6-5.8-5.8-5.8-1.4 0-2.7.5-3.7 1.3-.5-.3-1.1-.5-1.7-.5-1.8 0-3.3 1.5-3.3 3.3v.2c-1.3.3-2.3 1.4-2.3 2.8v7c0 1.7 1.3 3 3 3h13c2.5 0 4.5-2 4.5-4.5v-3c0-2.5-2-4.5-4.5-4.5h.3z" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('apple')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#FC3C44" />
                <path d="M32.5 14.2v12.8c0 2.4-1.9 4.3-4.3 4.3s-4.3-1.9-4.3-4.3 1.9-4.3 4.3-4.3c.8 0 1.6.2 2.2.6v-8.8l-10 2.6v10.2c0 2.4-1.9 4.3-4.3 4.3s-4.3-1.9-4.3-4.3 1.9-4.3 4.3-4.3c.8 0 1.6.2 2.2.6V16l14.1-3.7c.5-.1.9.3.8.8-.1.3-.2.7-.3 1.1z" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('bandcamp')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#629AA9" />
                <text x="24" y="30" textAnchor="middle" fill="#FFF" fontSize="20" fontWeight="bold" fontFamily="Arial">bc</text>
            </svg>
        );
    }
    if (p.includes('deezer')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#A238FF" />
                <rect x="10" y="30" width="5" height="3" rx="0.5" fill="#FFF" />
                <rect x="17" y="27" width="5" height="6" rx="0.5" fill="#FFF" />
                <rect x="24" y="24" width="5" height="9" rx="0.5" fill="#FFF" />
                <rect x="31" y="20" width="5" height="13" rx="0.5" fill="#FFF" />
            </svg>
        );
    }
    if (p.includes('tidal')) {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0">
                <circle cx="24" cy="24" r="24" fill="#000" />
                <path d="M15.5 20l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm9 0l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm-9 9l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm9 0l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5z" fill="#00FFFF" />
            </svg>
        );
    }
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
        </svg>
    );
});

export default function MediaOverlayPage() {
    const [volume, setVolume] = useState<number>(1);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [accentColor, setAccentColor] = useState<string>('sky');
    const [title, setTitle] = useState<string | null>(null);
    const [artist, setArtist] = useState<string | null>(null);
    const [album, setAlbum] = useState<string | null>(null);
    const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [streamMetadata, setStreamMetadata] = useState<StreamMetadataPayload | null>(null);
    const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false);
    const [overlaySize, setOverlaySize] = useState<'s' | 'm' | 'l' | 'xl'>('m');
    const [overlayBgColor, setOverlayBgColor] = useState<string>('default');
    const [overlayCustomBgHex, setOverlayCustomBgHex] = useState<string>('#18181b');

    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
    const animTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveredRef = useRef<boolean>(false);
    const isVisibleRef = useRef<boolean>(false);
    const overlayTimeoutRef = useRef<number>(2500);
    const overlayEnabledRef = useRef<boolean>(false);
    const lastSyncTimeRef = useRef<{time: number; timestamp: number}>({time: 0, timestamp: 0});
    const prevStreamMetaRef = useRef<StreamMetadataPayload | null>(null);

    const hasMain = Boolean(title && title.trim().length > 0 && title !== 'Symvonia Music');
    const hasStream = Boolean(streamMetadata && streamMetadata.title && streamMetadata.title.trim().length > 0);
    const isDual = hasMain && hasStream;

    // Resize overlay window bounds when switching between single and dual (main + stream) modes
    useEffect(() => {
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('update_media_overlay_bounds', { expanded: isDual }).catch(() => {});
        });
    }, [isDual]);

    const loadOverlayConfig = useCallback(async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const cfg = await invoke<SymvoniaConfig>('get_app_config');
            if (cfg) {
                if (cfg.overlay_size) setOverlaySize(cfg.overlay_size);
                if (cfg.overlay_bg_color) setOverlayBgColor(cfg.overlay_bg_color);
                if (cfg.overlay_custom_bg_hex) setOverlayCustomBgHex(cfg.overlay_custom_bg_hex);
                if (typeof cfg.overlay_timeout === 'number' && cfg.overlay_timeout >= 500) {
                    overlayTimeoutRef.current = cfg.overlay_timeout;
                }
                if (typeof cfg.overlay_enabled === 'boolean') {
                    overlayEnabledRef.current = cfg.overlay_enabled;
                }
                if (cfg.accent_color) setAccentColor(cfg.accent_color);
            }

            try {
                const streamMeta = await invoke<StreamMetadataPayload | null>('get_latest_stream_metadata');
                if (streamMeta && streamMeta.title) {
                    prevStreamMetaRef.current = streamMeta;
                    setStreamMetadata(streamMeta);
                }
            } catch {}
        } catch {}
    }, []);

    // Make body and html transparent for frameless native overlay window and disable context menu
    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        document.body.style.overflow = 'hidden';

        const preventContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };
        window.addEventListener('contextmenu', preventContextMenu);
        // Configuration arrives asynchronously from the native backend.
        const configTimer = setTimeout(() => { void loadOverlayConfig(); }, 0);

        return () => {
            clearTimeout(configTimer);
            window.removeEventListener('contextmenu', preventContextMenu);
        };
    }, [loadOverlayConfig]);

    const hideOverlay = useCallback(() => {
        setIsAnimatingOut(true);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => {
            import('@tauri-apps/api/core')
                .then(({invoke}) => invoke('hide_media_overlay'))
                .catch(() => {});
            setIsAnimatingOut(false);
            isVisibleRef.current = false;
        }, 180);
    }, []);

    const resetHideTimer = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            if (!isHoveredRef.current) {
                hideOverlay();
            }
        }, overlayTimeoutRef.current);
    }, [hideOverlay]);

    const showOverlay = useCallback(() => {
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        setIsAnimatingOut((prev) => (prev ? false : prev));

        // Only call native show and request metadata sync if currently hidden
        if (!isVisibleRef.current) {
            isVisibleRef.current = true;
            import('@tauri-apps/api/core')
                .then(({invoke}) => invoke('show_media_overlay'))
                .catch(() => {});
            import('@tauri-apps/api/event')
                .then(({emit}) => emit('media-overlay-request-sync', {}))
                .catch(() => {});
        }

        resetHideTimer();
    }, [resetHideTimer]);

    // Local smooth ticker for realtime duration
    useEffect(() => {
        if (!isPlaying) return;
        const interval = setInterval(() => {
            const elapsed = (Date.now() - lastSyncTimeRef.current.timestamp) / 1000;
            const updated = lastSyncTimeRef.current.time + elapsed;
            setCurrentTime(() => {
                if (duration > 0 && updated >= duration) return duration;
                return updated;
            });
        }, 250);
        return () => clearInterval(interval);
    }, [isPlaying, duration]);

    useEffect(() => {
        let unlistenSync: (() => void) | null = null;
        let unlistenTime: (() => void) | null = null;
        let unlistenSysVol: (() => void) | null = null;
        let unlistenConfig: (() => void) | null = null;
        let unlistenStream: (() => void) | null = null;
        let unlistenStreamClosed: (() => void) | null = null;
        let cancelled = false;

        import('@tauri-apps/api/event').then(async ({listen, emit}) => {
            if (cancelled) return;

            // Register callback and query initial system volume and mute state
            import('@tauri-apps/api/core').then(async ({invoke}) => {
                if (cancelled) return;
                try {
                    await invoke('register_volume_callback');
                    const sysVol = await invoke<number>('get_system_volume');
                    const sysMute = await invoke<boolean>('get_system_mute').catch(() => false);
                    setVolume(sysVol / 100);
                    setIsMuted(sysMute);
                } catch {}
            });

            // Notify main window that overlay window is mounted and ready for current state
            emit('media-overlay-ready', {}).catch(() => {});

            unlistenSync = await listen<MediaOverlaySyncPayload>('media-overlay-sync', (event) => {
                const payload = event.payload;
                if (typeof payload.isPlaying === 'boolean') {
                    setIsPlaying(payload.isPlaying);
                }
                if (payload.accentColor) {
                    setAccentColor(payload.accentColor);
                }
                if (payload.title !== undefined) {
                    setTitle(payload.title);
                }
                if (payload.artist !== undefined) {
                    setArtist(payload.artist);
                }
                if (payload.album !== undefined) {
                    setAlbum(payload.album);
                }
                if (payload.coverDataUrl !== undefined) {
                    setCoverDataUrl((prev) => (prev === payload.coverDataUrl ? prev : payload.coverDataUrl));
                }
                if (payload.duration !== undefined) {
                    setDuration(payload.duration);
                }
                if (typeof payload.currentTime === 'number') {
                    setCurrentTime(payload.currentTime);
                    lastSyncTimeRef.current = {time: payload.currentTime, timestamp: Date.now()};
                }
            });

            unlistenTime = await listen<MediaOverlayTimePayload>('media-overlay-time', (event) => {
                const payload = event.payload;
                if (typeof payload.currentTime === 'number') {
                    setCurrentTime(payload.currentTime);
                    lastSyncTimeRef.current = {time: payload.currentTime, timestamp: Date.now()};
                }
                if (typeof payload.duration === 'number') {
                    setDuration(payload.duration);
                }
                if (typeof payload.isPlaying === 'boolean') {
                    setIsPlaying(payload.isPlaying);
                }
            });

            unlistenSysVol = await listen<{volume: number; muted: boolean}>(
                'system-volume-changed',
                (event) => {
                    const {volume: pct, muted} = event.payload;
                    const nextVol = pct / 100;
                    setVolume((prev) => (Math.abs(prev - nextVol) < 0.001 ? prev : nextVol));
                    setIsMuted((prev) => (prev === muted ? prev : muted));
                    if (!overlayEnabledRef.current) return;
                    showOverlay();
                }
            );

            unlistenConfig = await listen('media-overlay-config-changed', () => {
                loadOverlayConfig();
            });

            unlistenStream = await listen<StreamMetadataPayload>('stream-metadata-sync', (event) => {
                const payload = event.payload;
                if (!payload || !payload.title) return;

                prevStreamMetaRef.current = payload;
                setStreamMetadata(payload);
            });

            unlistenStreamClosed = await listen<{label: string}>('stream-closed', (event) => {
                setStreamMetadata((prev) => {
                    if (!prev) return null;
                    if (!event.payload || prev.label === event.payload.label) {
                        prevStreamMetaRef.current = null;
                        return null;
                    }
                    return prev;
                });
            });
        });

        return () => {
            cancelled = true;
            unlistenSync?.();
            unlistenTime?.();
            unlistenSysVol?.();
            unlistenConfig?.();
            unlistenStream?.();
            unlistenStreamClosed?.();
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
        };
    }, [showOverlay, loadOverlayConfig]);

    const sendAction = useCallback(
        (action: 'toggle_play_pause' | 'next' | 'prev') => {
            resetHideTimer();
            import('@tauri-apps/api/event')
                .then(({emit}) => emit('media-overlay-action', {action}))
                .catch(() => {});
        },
        [resetHideTimer],
    );

    const handleTogglePlayPause = useCallback(() => {
        setIsPlaying((prev) => !prev);
        sendAction('toggle_play_pause');
    }, [sendAction]);

    const handleNext = useCallback(() => {
        sendAction('next');
    }, [sendAction]);

    const handlePrev = useCallback(() => {
        sendAction('prev');
    }, [sendAction]);

    const streamLabel = streamMetadata?.label;

    const handleToggleStreamPlay = useCallback(() => {
        if (!streamLabel) return;
        setStreamMetadata((prev) => (prev ? {...prev, isPlaying: !prev.isPlaying} : null));
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('control_stream_playback', {
                label: streamLabel,
                action: 'toggle_play_pause',
            }).catch(() => {});
        });
    }, [streamLabel]);

    const handleFocusStream = useCallback(() => {
        if (!streamLabel) return;
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('control_stream_playback', {
                label: streamLabel,
                action: 'focus',
            }).catch(() => {});
        });
    }, [streamLabel]);

    const handleStreamNext = useCallback(() => {
        if (!streamLabel) return;
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('control_stream_playback', {
                label: streamLabel,
                action: 'next',
            }).catch(() => {});
        });
    }, [streamLabel]);

    const handleStreamPrev = useCallback(() => {
        if (!streamLabel) return;
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('control_stream_playback', {
                label: streamLabel,
                action: 'prev',
            }).catch(() => {});
        });
    }, [streamLabel]);

    const handleMouseEnter = useCallback(() => {
        isHoveredRef.current = true;
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        setIsAnimatingOut(false);
    }, []);

    const handleMouseLeave = useCallback(() => {
        isHoveredRef.current = false;
        resetHideTimer();
    }, [resetHideTimer]);

    const accent = getAccent(accentColor);
    const effectiveVol = isMuted ? 0 : volume;
    const volPct = Math.max(0, Math.min(100, Math.round(effectiveVol * 100)));

    let effectiveBg = '#18181b';
    if (overlayBgColor === 'black') effectiveBg = '#101012';
    else if (overlayBgColor === 'charcoal') effectiveBg = '#1c1c1f';
    else if (overlayBgColor === 'slate') effectiveBg = '#141c2e';
    else if (overlayBgColor === 'accent') effectiveBg = accent.hex500 || '#0284c7';
    else if (overlayBgColor === 'custom') {
        const hex = (overlayCustomBgHex || '').trim().toLowerCase();
        effectiveBg = hex === '#000000' || hex === '#000' ? '#101012' : (overlayCustomBgHex || '#18181b');
    }

    const isAccentBg = overlayBgColor === 'accent';

    const cardPadding =
        overlaySize === 's' ? 'p-2' : overlaySize === 'l' ? 'p-3' : overlaySize === 'xl' ? 'p-3.5' : 'p-2.5';
    const titleClass =
        overlaySize === 's'
            ? 'text-[11px]'
            : overlaySize === 'l'
            ? 'text-sm font-semibold'
            : overlaySize === 'xl'
            ? 'text-base font-bold'
            : 'text-xs font-semibold';
    const artistClass =
        overlaySize === 's'
            ? 'text-[10px]'
            : overlaySize === 'l'
            ? 'text-xs'
            : overlaySize === 'xl'
            ? 'text-sm'
            : 'text-[11px]';
    const timeClass =
        overlaySize === 's'
            ? 'text-[9px]'
            : overlaySize === 'l'
            ? 'text-[11px]'
            : overlaySize === 'xl'
            ? 'text-xs'
            : 'text-[10px]';
    const volTextClass =
        overlaySize === 's'
            ? 'text-[10px]'
            : overlaySize === 'l'
            ? 'text-xs'
            : overlaySize === 'xl'
            ? 'text-xs'
            : 'text-[11px]';
    const volIconSize =
        overlaySize === 's' ? 10 : overlaySize === 'l' ? 14 : overlaySize === 'xl' ? 15 : 12;
    const volBarHeight =
        overlaySize === 's' ? 'h-1' : overlaySize === 'l' ? 'h-2' : overlaySize === 'xl' ? 'h-2.5' : 'h-1.5';

    const renderVolumeIcon = () => {
        if (volPct === 0 || isMuted) {
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={volIconSize}
                    height={volIconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-500"
                >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
            );
        }
        if (volPct < 33) {
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={volIconSize}
                    height={volIconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-400"
                >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
            );
        }
        if (volPct < 66) {
            return (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={volIconSize}
                    height={volIconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-400"
                >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
            );
        }
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={volIconSize}
                height={volIconSize}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-zinc-400"
            >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
        );
    };

    return (
        <main
            onContextMenu={(e) => e.preventDefault()}
            className="w-screen h-screen p-1 bg-transparent overflow-hidden select-none box-border"
        >
            <style>{`
                html, body {
                    background: transparent !important;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }
                .media-overlay-card {
                    background-color: ${effectiveBg} !important;
                    -webkit-backface-visibility: hidden;
                    backface-visibility: hidden;
                }
            `}</style>
            <div
                onContextMenu={(e) => e.preventDefault()}
                style={{
                    boxSizing: 'border-box',
                    backgroundColor: effectiveBg,
                    borderColor: isAccentBg ? 'rgba(255, 255, 255, 0.2)' : 'rgba(39, 39, 42, 0.9)',
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden',
                }}
                className={`media-overlay-card w-full h-full border rounded-xl ${cardPadding} flex flex-col justify-between shadow-[0_12px_36px_rgba(0,0,0,0.85)] text-zinc-100 transition-[opacity,transform] duration-150 ease-out overflow-hidden bg-zinc-900 ${
                    isAnimatingOut
                        ? 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                        : 'opacity-100'
                }`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {isDual ? (
                    <>
                        {/* === WINDOW UTAMA (BAGIAN ATAS) === */}
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center justify-between text-[9px] font-semibold text-zinc-400">
                                <span className="flex items-center gap-1 text-zinc-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                        <path d="M9 18V5l12-2v13" />
                                        <circle cx="6" cy="18" r="3" />
                                        <circle cx="18" cy="16" r="3" />
                                    </svg>
                                    Pemutar Utama
                                </span>
                                <span className="tabular-nums text-zinc-400 font-mono text-[9px]">
                                    {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '0:00'}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 min-w-0">
                                <CoverThumbnail coverDataUrl={coverDataUrl} size="s" />
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className={`${titleClass} text-zinc-100 truncate leading-tight`} title={title || ''}>
                                        {title || 'Symvonia Music'}
                                    </div>
                                    <div className={`${artistClass} text-zinc-400 truncate leading-tight mt-0.5`} title={`${artist || ''}${album ? ` • ${album}` : ''}`}>
                                        <span>{artist || 'Tidak ada artis'}</span>
                                        {album && <span className="text-zinc-500"> • {album}</span>}
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    <MediaControls
                                        isPlaying={isPlaying}
                                        accentBg={accent.bg500}
                                        isAccentBg={isAccentBg}
                                        onPrev={handlePrev}
                                        onTogglePlayPause={handleTogglePlayPause}
                                        onNext={handleNext}
                                        size="s"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* === SEPARATOR === */}
                        <div className="border-t border-zinc-700/60 my-0.5 w-full shrink-0" />

                        {/* === WINDOW STREAMING (BAGIAN BAWAH) === */}
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center justify-between text-[9px] font-semibold text-zinc-400">
                                <span className="flex items-center gap-1.5 text-zinc-300">
                                    <PlatformIcon platform={streamMetadata?.platform} size={11} />
                                    <span>{streamMetadata?.platform || 'Web Stream'}</span>
                                </span>
                                {streamMetadata?.duration && streamMetadata.duration > 0 ? (
                                    <span className="tabular-nums text-zinc-400 font-mono text-[9px]">
                                        {formatTime(streamMetadata.currentTime || 0)} / {formatTime(streamMetadata.duration)}
                                    </span>
                                ) : null}
                            </div>

                            <div className="flex items-center gap-2 min-w-0">
                                <CoverThumbnail coverDataUrl={streamMetadata?.cover || null} size="s" />
                                <div
                                    className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer group"
                                    onClick={handleFocusStream}
                                    title="Klik untuk buka jendela streaming"
                                >
                                    <div className={`${titleClass} text-zinc-100 truncate leading-tight group-hover:text-white transition-colors`} title={streamMetadata?.title || ''}>
                                        {streamMetadata?.title || 'Live Stream'}
                                    </div>
                                    <div className={`${artistClass} text-zinc-400 truncate leading-tight mt-0.5`} title={streamMetadata?.artist || ''}>
                                        <span>{streamMetadata?.artist || streamMetadata?.platform || 'Web Stream'}</span>
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    <MediaControls
                                        isPlaying={Boolean(streamMetadata?.isPlaying)}
                                        accentBg={accent.bg500}
                                        isAccentBg={isAccentBg}
                                        onPrev={handleStreamPrev}
                                        onTogglePlayPause={handleToggleStreamPlay}
                                        onNext={handleStreamNext}
                                        size="s"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* === VOLUME BAR SISTEM (BERSAMA) === */}
                        <div className="space-y-1 pt-0.5">
                            <div className={`flex items-center justify-between ${volTextClass} leading-none text-zinc-400`}>
                                <div className="flex items-center gap-1.5">
                                    {renderVolumeIcon()}
                                    <span className="font-medium text-zinc-300">Volume</span>
                                </div>
                                <span className="font-semibold tabular-nums text-zinc-200">
                                    {isMuted ? 'Muted' : `${volPct}%`}
                                </span>
                            </div>

                            <div className={`${volBarHeight} w-full ${isAccentBg ? 'bg-white/20' : 'bg-zinc-800/80'} rounded-full overflow-hidden`}>
                                <div
                                    className={`h-full rounded-full transition-[width] duration-75 ease-out ${isAccentBg ? 'bg-white' : accent.bg500}`}
                                    style={{width: `${volPct}%`}}
                                />
                            </div>
                        </div>
                    </>
                ) : !hasMain && hasStream ? (
                    <>
                        {/* === SINGLE MODE: HANYA STREAMING === */}
                        <div className="flex items-center gap-2.5 min-w-0">
                            <CoverThumbnail coverDataUrl={streamMetadata?.cover || null} size={overlaySize} />

                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="flex items-center gap-1.5 text-zinc-400 mb-0.5">
                                    <PlatformIcon platform={streamMetadata?.platform} size={12} />
                                    <span className="text-[10px] font-semibold text-zinc-300">
                                        {streamMetadata?.platform || 'Web Stream'}
                                    </span>
                                </div>
                                <div
                                    className={`${titleClass} text-zinc-100 truncate leading-tight cursor-pointer hover:text-white transition-colors`}
                                    title={streamMetadata?.title || ''}
                                    onClick={handleFocusStream}
                                >
                                    {streamMetadata?.title || 'Live Stream'}
                                </div>
                                <div className={`${artistClass} text-zinc-400 truncate leading-tight mt-0.5`} title={streamMetadata?.artist || ''}>
                                    <span>{streamMetadata?.artist || streamMetadata?.platform || 'Web Stream'}</span>
                                </div>
                                {streamMetadata?.duration && streamMetadata.duration > 0 ? (
                                    <div className={`${timeClass} text-zinc-400 font-medium tabular-nums leading-tight mt-0.5`}>
                                        {formatTime(streamMetadata.currentTime || 0)} / {formatTime(streamMetadata.duration)}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* Baris 2: Volume Info & Full-width Volume Bar */}
                        <div className="space-y-1">
                            <div className={`flex items-center justify-between ${volTextClass} leading-none text-zinc-400`}>
                                <div className="flex items-center gap-1.5">
                                    {renderVolumeIcon()}
                                    <span className="font-medium text-zinc-300">Volume</span>
                                </div>
                                <span className="font-semibold tabular-nums text-zinc-200">
                                    {isMuted ? 'Muted' : `${volPct}%`}
                                </span>
                            </div>

                            <div className={`${volBarHeight} w-full ${isAccentBg ? 'bg-white/20' : 'bg-zinc-800/80'} rounded-full overflow-hidden`}>
                                <div
                                    className={`h-full rounded-full transition-[width] duration-75 ease-out ${isAccentBg ? 'bg-white' : accent.bg500}`}
                                    style={{width: `${volPct}%`}}
                                />
                            </div>
                        </div>

                        {/* Baris 3: Streaming Controls (Center) */}
                        <MediaControls
                            isPlaying={Boolean(streamMetadata?.isPlaying)}
                            accentBg={accent.bg500}
                            isAccentBg={isAccentBg}
                            onPrev={handleStreamPrev}
                            onTogglePlayPause={handleToggleStreamPlay}
                            onNext={handleStreamNext}
                            size={overlaySize}
                        />
                    </>
                ) : (
                    <>
                        {/* === SINGLE MODE: PEMUTAR UTAMA (ORIGINAL) === */}
                        {/* Baris 1: Cover Art & Metadata Musik */}
                        <div className="flex items-center gap-2.5 min-w-0">
                            <CoverThumbnail coverDataUrl={coverDataUrl} size={overlaySize} />

                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className={`${titleClass} text-zinc-100 truncate leading-tight`} title={title || ''}>
                                    {title || 'Symvonia Music'}
                                </div>
                                <div className={`${artistClass} text-zinc-400 truncate leading-tight mt-0.5`} title={`${artist || ''}${album ? ` • ${album}` : ''}`}>
                                    <span>{artist || 'Tidak ada artis'}</span>
                                    {album && <span className="text-zinc-500"> • {album}</span>}
                                </div>
                                <div className={`${timeClass} text-zinc-400 font-medium tabular-nums leading-tight mt-0.5`}>
                                    {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '0:00'}
                                </div>
                            </div>
                        </div>

                        {/* Baris 2: Volume Info & Full-width Volume Bar */}
                        <div className="space-y-1">
                            <div className={`flex items-center justify-between ${volTextClass} leading-none text-zinc-400`}>
                                <div className="flex items-center gap-1.5">
                                    {renderVolumeIcon()}
                                    <span className="font-medium text-zinc-300">Volume</span>
                                </div>
                                <span className="font-semibold tabular-nums text-zinc-200">
                                    {isMuted ? 'Muted' : `${volPct}%`}
                                </span>
                            </div>

                            <div className={`${volBarHeight} w-full ${isAccentBg ? 'bg-white/20' : 'bg-zinc-800/80'} rounded-full overflow-hidden`}>
                                <div
                                    className={`h-full rounded-full transition-[width] duration-75 ease-out ${isAccentBg ? 'bg-white' : accent.bg500}`}
                                    style={{width: `${volPct}%`}}
                                />
                            </div>
                        </div>

                        {/* Baris 3: Media Controls (Center) */}
                        <MediaControls
                            isPlaying={isPlaying}
                            accentBg={accent.bg500}
                            isAccentBg={isAccentBg}
                            onPrev={handlePrev}
                            onTogglePlayPause={handleTogglePlayPause}
                            onNext={handleNext}
                            size={overlaySize}
                        />
                    </>
                )}
            </div>
        </main>
    );
}
