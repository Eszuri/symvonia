'use client';

import {useEffect, useRef} from 'react';
import {getTauri, isBrowserTauri} from '../lib/homeState';

interface TaskbarControlsOptions {
    isPlaying: boolean;
    hasTrack: boolean;
    language: string;
    onTogglePlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
}

export function useTaskbarControls({isPlaying, hasTrack, language, onTogglePlayPause, onNext, onPrev}: TaskbarControlsOptions) {
    const callbacks = useRef({onTogglePlayPause, onNext, onPrev});
    useEffect(() => {
        callbacks.current = {onTogglePlayPause, onNext, onPrev};
    }, [onTogglePlayPause, onNext, onPrev]);

    useEffect(() => {
        if (!isBrowserTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event').then(({listen}) =>
            listen<string>('taskbar-media-action', ({payload}) => {
                if (disposed) return;
                if (payload === 'toggle') callbacks.current.onTogglePlayPause();
                else if (payload === 'next') callbacks.current.onNext();
                else if (payload === 'prev') callbacks.current.onPrev();
            })
        ).then((stop) => {
            if (disposed) stop();
            else unlisten = stop;
        }).catch((error) => console.error('Taskbar event listener failed:', error));
        return () => { disposed = true; unlisten?.(); };
    }, []);

    useEffect(() => {
        if (!isBrowserTauri()) return;
        getTauri().then((tauri) => tauri?.invoke('update_taskbar_controls', {isPlaying, hasTrack, language}))
            .catch((error) => console.error('Taskbar state update failed:', error));
    }, [isPlaying, hasTrack, language]);
}
