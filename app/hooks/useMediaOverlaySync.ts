'use client';

import {useEffect, useRef} from 'react';
import {isBrowserTauri} from '../lib/homeState';

interface UseMediaOverlaySyncOptions {
    isPlaying: boolean;
    accentColor: string;
    onTogglePlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
}

export function useMediaOverlaySync({
    isPlaying,
    accentColor,
    onTogglePlayPause,
    onNext,
    onPrev,
}: UseMediaOverlaySyncOptions) {
    const isFirstMountRef = useRef(true);

    const callbacksRef = useRef({onTogglePlayPause, onNext, onPrev});
    const stateRef = useRef({isPlaying, accentColor});

    useEffect(() => {
        callbacksRef.current = {onTogglePlayPause, onNext, onPrev};
        stateRef.current = {isPlaying, accentColor};
    });

    // Ensure system volume callback is registered immediately on startup
    useEffect(() => {
        if (!isBrowserTauri()) return;
        import('@tauri-apps/api/core').then(({invoke}) => {
            invoke('register_volume_callback').catch(() => {});
        });
    }, []);

    // 1. Listen for actions and ready signal from overlay window
    useEffect(() => {
        if (!isBrowserTauri()) return;

        let unlistenAction: (() => void) | null = null;
        let unlistenReady: (() => void) | null = null;
        let isCancelled = false;

        import('@tauri-apps/api/event').then(async ({listen, emit}) => {
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
                emit('media-overlay-sync', {
                    isPlaying: stateRef.current.isPlaying,
                    accentColor: stateRef.current.accentColor,
                }).catch(() => {});
            });
        });

        return () => {
            isCancelled = true;
            unlistenAction?.();
            unlistenReady?.();
        };
    }, []);

    // 2. Sync playback state changes in real time without showing overlay
    useEffect(() => {
        if (!isBrowserTauri()) return;
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            return;
        }

        import('@tauri-apps/api/event').then(({emit}) => {
            emit('media-overlay-sync', {
                isPlaying,
                accentColor: stateRef.current.accentColor,
            }).catch(() => {});
        });
    }, [isPlaying]);

    // 3. Sync accent color changes
    useEffect(() => {
        if (!isBrowserTauri()) return;
        if (isFirstMountRef.current) return;

        import('@tauri-apps/api/event').then(({emit}) => {
            emit('media-overlay-sync', {
                isPlaying: stateRef.current.isPlaying,
                accentColor,
            }).catch(() => {});
        });
    }, [accentColor]);
}
