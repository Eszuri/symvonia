import {useEffect} from 'react';
import {getTauri, isBrowserTauri, type ShortcutAction} from '../lib/homeState';

interface UseKeyboardShortcutsOptions {
    shortcutsRef: React.RefObject<Record<ShortcutAction, string>>;
    settingsOpenRef: React.RefObject<boolean>;
    streamingOpenRef: React.RefObject<boolean>;
    pendingFolderChangeRef: React.RefObject<boolean>;
    equalizerOpenRef: React.RefObject<boolean>;
    togglePlayPauseRef: React.RefObject<() => void>;
    playNextRef: React.RefObject<() => void>;
    playPrevRef: React.RefObject<() => void>;
    appVolumeRef: React.RefObject<number>;
    systemVolumeRef: React.RefObject<number>;
    volumeStepRef: React.RefObject<number>;
    setAppVolume: (v: number) => void;
    setSystemVolume: (v: number) => void;
    setSystemMuted: React.Dispatch<React.SetStateAction<boolean>>;
    volumeModeRef: React.RefObject<'app' | 'system'>;
    volumeLimitRef: React.RefObject<number>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    lastLocalVolumeSetRef: React.RefObject<number>;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
    const {
        shortcutsRef,
        settingsOpenRef,
        streamingOpenRef,
        pendingFolderChangeRef,
        equalizerOpenRef,
        togglePlayPauseRef,
        playNextRef,
        playPrevRef,
        appVolumeRef,
        systemVolumeRef,
        volumeStepRef,
        setAppVolume,
        setSystemVolume,
        setSystemMuted,
        volumeModeRef,
        volumeLimitRef,
        audioRef,
        lastLocalVolumeSetRef,
    } = options;

    useEffect(() => {
        const isInputFocused = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return true;
            if ((el as HTMLElement).isContentEditable) return true;
            const role = el.getAttribute('role');
            if (role === 'button' || role === 'slider' || role === 'checkbox') return true;
            return false;
        };

        const handleKey = (e: KeyboardEvent) => {
            // Block accidental page refresh shortcuts (F5, Ctrl+R, Ctrl+Shift+R, Cmd+R, Cmd+Shift+R)
            const isRefreshKey =
                e.key === 'F5' ||
                ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'));

            if (isRefreshKey) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (e.key === 'F12') {
                import('@tauri-apps/api/webview').then(m =>
                    (m as unknown as { getCurrentWebview: () => { openDevTools: () => void } }).getCurrentWebview().openDevTools()
                ).catch(() => {});
                return;
            }

            if (isInputFocused()) return;
            if (
                settingsOpenRef.current ||
                streamingOpenRef.current ||
                pendingFolderChangeRef.current ||
                equalizerOpenRef.current
            ) return;

            const key = e.key;
            const keyLower = key.length === 1 ? key.toLowerCase() : key;
            const map = shortcutsRef.current;
            let action: ShortcutAction | null = null;
            for (const a of Object.keys(map) as ShortcutAction[]) {
                const bound = map[a];
                if (bound === key || bound === keyLower) {
                    action = a;
                    break;
                }
            }
            if (!action) {
                if (key === 'MediaPlayPause') action = 'playPause';
                else if (key === 'MediaTrackNext') action = 'next';
                else if (key === 'MediaTrackPrevious') action = 'prev';
            }
            if (!action) return;

            e.preventDefault();
            switch (action) {
                case 'playPause':
                    togglePlayPauseRef.current();
                    break;
                case 'next':
                    playNextRef.current();
                    break;
                case 'prev':
                    playPrevRef.current();
                    break;
                case 'volumeUp': {
                    const step = volumeStepRef.current / 100;
                    if (volumeModeRef.current === 'app') {
                        const cur = appVolumeRef.current;
                        const raw = Math.min(1, Math.round((cur + step) / step) * step);
                        setAppVolume(raw);
                        if (audioRef.current) audioRef.current.volume = raw;
                    } else {
                        const cur = systemVolumeRef.current;
                        const pct = Math.round(cur * 100);
                        const limit = volumeLimitRef.current;

                        if (limit > 0) {
                            if (pct > limit) break;
                            if (pct === limit) break;
                        }

                        let raw = Math.min(1, Math.round((cur + step) / step) * step);
                        if (limit > 0 && Math.round(raw * 100) > limit) {
                            raw = limit / 100;
                        }
                        const targetPct = Math.round(raw * 100);
                        setSystemVolume(raw);
                        if (targetPct === 0) {
                            setSystemMuted(true);
                        }
                        if (isBrowserTauri()) {
                            lastLocalVolumeSetRef.current = Date.now();
                            getTauri().then(async m => {
                                await m.invoke('set_system_volume', {value: targetPct});
                                if (targetPct > 0) {
                                    await m.invoke('set_system_mute', {mute: false});
                                    setSystemMuted(false);
                                }
                            }).catch(() => {});
                        }
                    }
                    break;
                }
                case 'volumeDown': {
                    const step = volumeStepRef.current / 100;
                    if (volumeModeRef.current === 'app') {
                        const cur = appVolumeRef.current;
                        const raw = Math.max(0, Math.round((cur - step) / step) * step);
                        setAppVolume(raw);
                        if (audioRef.current) audioRef.current.volume = raw;
                    } else {
                        const cur = systemVolumeRef.current;
                        const pct = Math.round(cur * 100);
                        const limit = volumeLimitRef.current;

                        if (limit > 0) {
                            if (pct > limit) break;
                        }

                        const raw = Math.max(0, Math.round((cur - step) / step) * step);
                        const targetPct = Math.round(raw * 100);
                        setSystemVolume(raw);
                        if (targetPct === 0) {
                            setSystemMuted(true);
                        }
                        if (isBrowserTauri()) {
                            lastLocalVolumeSetRef.current = Date.now();
                            getTauri().then(async m => {
                                await m.invoke('set_system_volume', {value: targetPct});
                                if (targetPct > 0) {
                                    await m.invoke('set_system_mute', {mute: false});
                                    setSystemMuted(false);
                                }
                            }).catch(() => {});
                        }
                    }
                    break;
                }
            }
            };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [
        shortcutsRef,
        settingsOpenRef,
        streamingOpenRef,
        pendingFolderChangeRef,
        equalizerOpenRef,
        togglePlayPauseRef,
        playNextRef,
        playPrevRef,
        appVolumeRef,
        systemVolumeRef,
        volumeStepRef,
        setAppVolume,
        setSystemVolume,
        setSystemMuted,
        volumeModeRef,
        volumeLimitRef,
        audioRef,
        lastLocalVolumeSetRef,
    ]);
}
