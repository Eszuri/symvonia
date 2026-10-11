'use client';

import {useEffect, useRef} from 'react';
import {isBrowserTauri} from '../lib/homeState';

export interface MediaOverlaySyncPayload {
    isPlaying: boolean;
    accentColor: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    coverDataUrl: string | null;
    currentTime: number;
    duration: number;
}

export interface MediaOverlayTimePayload {
    currentTime: number;
    duration: number;
    isPlaying?: boolean;
}

interface UseMediaOverlaySyncOptions {
    isPlaying: boolean;
    accentColor: string;
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    coverDataUrl?: string | null;
    currentTime?: number;
    duration?: number;
    onTogglePlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
}

export function useMediaOverlaySync({
    isPlaying,
    accentColor,
    title,
    artist,
    album,
    coverDataUrl,
    currentTime,
    duration,
    onTogglePlayPause,
    onNext,
    onPrev,
}: UseMediaOverlaySyncOptions) {
    const isFirstMountRef = useRef(true);

    const callbacksRef = useRef({onTogglePlayPause, onNext, onPrev});
    const stateRef = useRef({
        isPlaying,
        accentColor,
        title,
        artist,
        album,
        coverDataUrl,
        currentTime: currentTime ?? 0,
        duration: duration ?? 0,
    });

    useEffect(() => {
        callbacksRef.current = {onTogglePlayPause, onNext, onPrev};
        stateRef.current = {
            isPlaying,
            accentColor,
            title,
            artist,
            album,
            coverDataUrl,
            currentTime: currentTime ?? 0,
            duration: duration ?? 0,
        };
    });

    const emitFullSync = () => {
        if (!isBrowserTauri()) return;
        import('@tauri-apps/api/event').then(({emit}) => {
            const payload: MediaOverlaySyncPayload = {
                isPlaying: stateRef.current.isPlaying,
                accentColor: stateRef.current.accentColor,
                title: stateRef.current.title ?? null,
                artist: stateRef.current.artist ?? null,
                album: stateRef.current.album ?? null,
                coverDataUrl: stateRef.current.coverDataUrl ?? null,
                currentTime: stateRef.current.currentTime ?? 0,
                duration: stateRef.current.duration ?? 0,
            };
            emit('media-overlay-sync', payload).catch(() => {});
        });
    };

    // Ensure system volume callback is registered immediately on startup
    useEffect(() => {
        if (!isBrowserTauri()) return;
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('register_volume_callback').catch(() => {});
        });
    }, []);

    // 1. Listen for actions and ready / request-sync signal from overlay window
    useEffect(() => {
        if (!isBrowserTauri()) return;

        let unlistenAction: (() => void) | null = null;
        let unlistenReady: (() => void) | null = null;
        let unlistenReq: (() => void) | null = null;
        let isCancelled = false;

        import('@tauri-apps/api/event').then(async ({listen}) => {
            if (isCancelled) return;

            unlistenAction = await listen<{action: string}>(
                'media-overlay-action',
                (event) => {
                    const {action} = event.payload;
                    if (action === 'toggle_play_pause') {
                        callbacksRef.current.onTogglePlayPause();
                    } else if (action === 'next') {
                        callbacksRef.current.onNext();
                    } else if (action === 'prev') {
                        callbacksRef.current.onPrev();
                    }
                },
            );

            unlistenReady = await listen('media-overlay-ready', () => {
                emitFullSync();
            });

            unlistenReq = await listen('media-overlay-request-sync', () => {
                emitFullSync();
            });
        });

        return () => {
            isCancelled = true;
            unlistenAction?.();
            unlistenReady?.();
            unlistenReq?.();
        };
    }, []);

    // 2. Sync metadata & state changes in real time
    useEffect(() => {
        if (!isBrowserTauri()) return;
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            return;
        }

        emitFullSync();
    }, [isPlaying, accentColor, title, artist, album, coverDataUrl, duration]);

    // 3. Sync realtime position periodically
    const lastEmittedTimeRef = useRef(0);
    useEffect(() => {
        if (!isBrowserTauri()) return;
        const now = Date.now();
        const cur = currentTime ?? 0;
        const dur = duration ?? 0;

        if (now - lastEmittedTimeRef.current >= 450 || Math.abs(cur - (stateRef.current.currentTime ?? 0)) > 2) {
            lastEmittedTimeRef.current = now;
            import('@tauri-apps/api/event').then(({emit}) => {
                const payload: MediaOverlayTimePayload = {
                    currentTime: cur,
                    duration: dur,
                    isPlaying,
                };
                emit('media-overlay-time', payload).catch(() => {});
            });
        }
    }, [currentTime, duration, isPlaying]);
}
