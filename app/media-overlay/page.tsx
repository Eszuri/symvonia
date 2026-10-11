'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getAccent} from '../lib/colors';

export default function MediaOverlayPage() {
    const [volume, setVolume] = useState<number>(1);
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [accentColor, setAccentColor] = useState<string>('sky');
    const [isAnimatingOut, setIsAnimatingOut] = useState<boolean>(false);

    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
    const animTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isHoveredRef = useRef<boolean>(false);

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
        }, 180);
    }, []);

    const resetHideTimer = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            if (!isHoveredRef.current) {
                hideOverlay();
            }
        }, 2200);
    }, [hideOverlay]);

    const showOverlay = useCallback(() => {
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        setIsAnimatingOut(false);
        import('@tauri-apps/api/core')
            .then(({invoke}) => invoke('show_media_overlay'))
            .catch(() => {});
        resetHideTimer();
    }, [resetHideTimer]);

    useEffect(() => {
        let unlistenSync: (() => void) | null = null;
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

            unlistenSync = await listen<{
                isPlaying?: boolean;
                accentColor?: string;
            }>('media-overlay-sync', (event) => {
                const {isPlaying: newPlaying, accentColor: newAccent} = event.payload;
                if (typeof newPlaying === 'boolean') {
                    setIsPlaying(newPlaying);
                }
                if (newAccent) {
                    setAccentColor(newAccent);
                }
            });

            unlistenSysVol = await listen<{volume: number; muted: boolean}>(
                'system-volume-changed',
                (event) => {
                    const {volume: pct, muted} = event.payload;
                    setVolume(pct / 100);
                    setIsMuted(muted);
                    showOverlay();
                }
            );
        });

        return () => {
            cancelled = true;
            unlistenSync?.();
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
        <main className="w-screen h-screen p-1 bg-transparent overflow-hidden select-none">
            <style>{`html, body { background: transparent !important; margin: 0; padding: 0; overflow: hidden; }`}</style>
            <div
                className={`w-full h-full bg-zinc-950/92 backdrop-blur-xl border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between shadow-[0_12px_36px_rgba(0,0,0,0.65)] text-zinc-100 transition-all duration-200 ease-out ${
                    isAnimatingOut
                        ? 'opacity-0 scale-95 -translate-y-2'
                        : 'opacity-100 scale-100 translate-y-0'
                }`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Row 1: Volume info */}
                <div className="flex items-center justify-between text-xs leading-none">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                        {volPct === 0 ? (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="13"
                                height="13"
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
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                            >
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        ) : volPct < 66 ? (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                            >
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        ) : (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
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

                {/* Row 2: Volume Gauge */}
                <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-100 ease-out ${accent.bg500}`}
                        style={{width: `${volPct}%`}}
                    />
                </div>

                {/* Row 3: Media Controls */}
                <div className="flex items-center justify-center gap-3.5 pt-0.5">
                    <button
                        type="button"
                        onClick={handlePrev}
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
                        onClick={handleTogglePlayPause}
                        className={`p-1.5 rounded-full text-white ${accent.bg500} hover:brightness-110 active:scale-95 shadow-sm transition flex items-center justify-center cursor-pointer`}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="translate-x-0.5">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={handleNext}
                        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
                        title="Next"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 4 15 12 5 20 5 4" />
                            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
            </div>
        </main>
    );
}
