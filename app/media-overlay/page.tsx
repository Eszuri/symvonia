'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getAccent} from '../lib/colors';
import type {MediaOverlaySyncPayload, MediaOverlayTimePayload} from '../hooks/useMediaOverlaySync';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const CoverThumbnail = React.memo(function CoverThumbnail({coverDataUrl}: {coverDataUrl: string | null}) {
    return (
        <div
            style={{
                width: '38px',
                height: '38px',
                minWidth: '38px',
                minHeight: '38px',
                maxWidth: '38px',
                maxHeight: '38px',
                flexShrink: 0,
            }}
            className="rounded-md overflow-hidden bg-zinc-900 border border-zinc-800/80 flex items-center justify-center shadow-sm relative shrink-0"
        >
            {coverDataUrl ? (
                <img
                    src={coverDataUrl}
                    alt="Cover Art"
                    width={38}
                    height={38}
                    decoding="async"
                    style={{
                        width: '38px',
                        height: '38px',
                        maxWidth: '38px',
                        maxHeight: '38px',
                        objectFit: 'cover',
                        display: 'block',
                    }}
                />
            ) : (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
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
    onPrev: () => void;
    onTogglePlayPause: () => void;
    onNext: () => void;
}

const MediaControls = React.memo(function MediaControls({
    isPlaying,
    accentBg,
    onPrev,
    onTogglePlayPause,
    onNext,
}: MediaControlsProps) {
    return (
        <div className="flex items-center justify-center gap-4 pt-0.5">
            <button
                type="button"
                onClick={onPrev}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
                title="Previous"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="19 20 9 12 19 4 19 20" />
                    <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </button>

            <button
                type="button"
                onClick={onTogglePlayPause}
                className={`p-1.5 rounded-full text-white ${accentBg} hover:brightness-110 active:scale-95 shadow-sm transition flex items-center justify-center cursor-pointer`}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="translate-x-0.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                )}
            </button>

            <button
                type="button"
                onClick={onNext}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
                title="Next"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </button>
        </div>
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
    const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false);

    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
    const animTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveredRef = useRef<boolean>(false);
    const isVisibleRef = useRef<boolean>(false);
    const lastSyncTimeRef = useRef<{time: number; timestamp: number}>({time: 0, timestamp: Date.now()});

    // Make body and html transparent for frameless native overlay window
    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        document.body.style.overflow = 'hidden';
    }, []);

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
        }, 2500);
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
            setCurrentTime((prev) => {
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
                    showOverlay();
                }
            );
        });

        return () => {
            cancelled = true;
            unlistenSync?.();
            unlistenTime?.();
            unlistenSysVol?.();
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
        };
    }, [showOverlay]);

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

    return (
        <main className="w-screen h-screen p-1 bg-transparent overflow-hidden select-none box-border">
            <style>{`html, body { background: transparent !important; margin: 0; padding: 0; overflow: hidden; }`}</style>
            <div
                style={{boxSizing: 'border-box', backgroundColor: '#09090b'}}
                className={`w-full h-full bg-zinc-950 border border-zinc-800/90 rounded-xl p-2.5 flex flex-col justify-between shadow-[0_12px_36px_rgba(0,0,0,0.85)] text-zinc-100 transition-[opacity,transform] duration-150 ease-out overflow-hidden ${
                    isAnimatingOut
                        ? 'opacity-0 scale-95 -translate-y-2'
                        : 'opacity-100 scale-100 translate-y-0'
                }`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Baris 1: Cover Art & Metadata Musik */}
                <div className="flex items-center gap-2.5 min-w-0">
                    <CoverThumbnail coverDataUrl={coverDataUrl} />

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="font-semibold text-xs text-zinc-100 truncate leading-tight" title={title || ''}>
                            {title || 'Symvonia Music'}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5" title={`${artist || ''}${album ? ` • ${album}` : ''}`}>
                            <span>{artist || 'Tidak ada artis'}</span>
                            {album && <span className="text-zinc-500"> • {album}</span>}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium tabular-nums leading-tight mt-0.5">
                            {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '0:00'}
                        </div>
                    </div>
                </div>

                {/* Baris 2: Volume Info & Full-width Volume Bar */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] leading-none text-zinc-400">
                        <div className="flex items-center gap-1.5">
                            {volPct === 0 || isMuted ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
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
                            ) : volPct < 33 ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
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
                            ) : volPct < 66 ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
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
                            ) : (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
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
                            )}
                            <span className="font-medium text-[11px] text-zinc-300">Volume</span>
                        </div>
                        <span className="font-semibold text-[11px] tabular-nums text-zinc-200">
                            {isMuted ? 'Muted' : `${volPct}%`}
                        </span>
                    </div>

                    <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-[width] duration-75 ease-out ${accent.bg500}`}
                            style={{width: `${volPct}%`}}
                        />
                    </div>
                </div>

                {/* Baris 3: Media Controls (Center) */}
                <MediaControls
                    isPlaying={isPlaying}
                    accentBg={accent.bg500}
                    onPrev={handlePrev}
                    onTogglePlayPause={handleTogglePlayPause}
                    onNext={handleNext}
                />
            </div>
        </main>
    );
}
