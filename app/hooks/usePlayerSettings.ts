import {useCallback, useEffect, useRef, useState} from 'react';
import {removeCustomAccentVars, setCustomAccentVars} from '../lib/colors';
import {
    DEFAULT_SHORTCUTS,
    getTauri,
    isBrowserTauri,
    type ShortcutAction,
} from '../lib/homeState';
import {
    getInitialConfig,
    normalizeOutputMode,
    setStoredValue,
    syncConfigFromBackend,
    type OutputMode,
    type WallpaperFitMode,
    type WallpaperEffect,
    type WallpaperTransition,
    type SymvoniaConfig,
} from '../lib/storage';
import type {Lang} from '../lib/translations';

export function usePlayerSettings() {
    const init = getInitialConfig();

    const [musicFolder, setMusicFolderState] = useState<string | null>(init.music_folder);
    const initialized = true;
    const [autoWallpaper, setAutoWallpaperStateInternal] = useState(init.auto_wallpaper);
    const [resetOnClose, setResetOnCloseStateInternal] = useState(init.reset_on_close);
    const [wallpaperFitMode, setWallpaperFitModeStateInternal] = useState<WallpaperFitMode>(
        init.wallpaper_fit_mode ?? 'fill'
    );
    const [wallpaperEffect, setWallpaperEffectStateInternal] = useState<WallpaperEffect>(
        init.wallpaper_effect ?? 'none'
    );
    const [wallpaperTransition, setWallpaperTransitionStateInternal] = useState<WallpaperTransition>(
        init.wallpaper_transition ?? 'fade'
    );
    const [folderSort, setFolderSortStateInternal] = useState(init.folder_sort);
    const [fileSort, setFileSortStateInternal] = useState(init.file_sort);
    const [sortDir, setSortDirStateInternal] = useState<string>(init.sort_dir);
    const [nameSource, setNameSourceStateInternal] = useState<string>(init.name_source);
    const [volumeMode, setVolumeModeStateInternal] = useState<'app' | 'system'>(init.volume_mode as 'app' | 'system');
    const [appVolume, setAppVolumeState] = useState<number>(init.app_volume);
    const [systemVolume, setSystemVolumeState] = useState<number>(1);
    const [systemVolumeSynced, setSystemVolumeSynced] = useState(false);
    const [systemMuted, setSystemMuted] = useState(false);
    const [volumeLimit, setVolumeLimitState] = useState(init.volume_limit);
    const [volumeLimitExceeded, setVolumeLimitExceeded] = useState(false);
    const [volumeStep, setVolumeStepState] = useState(init.volume_step);
    const [language, setLanguageState] = useState<Lang>(init.language as Lang);
    const [formats, setFormatsStateInternal] = useState<string[]>(init.formats);
    const [shuffle, setShuffleStateInternal] = useState(init.shuffle);
    const [repeat, setRepeatStateInternal] = useState<'off' | 'all' | 'one'>(init.repeat as 'off' | 'all' | 'one');
    const [accentColor, setAccentColorStateInternal] = useState(init.accent_color);
    const [customAccentHex, setCustomAccentHexStateInternal] = useState(init.custom_accent_hex);
    const [defaultWallpaper, setDefaultWallpaperState] = useState<string | null>(init.default_wallpaper);
    const [outputDevice, setOutputDeviceStateInternal] = useState<string | null>(init.output_device);
    const [outputMode, setOutputModeStateInternal] = useState<OutputMode>(() => normalizeOutputMode(init.output_mode));
    const [autoFallbackHtmlAudio, setAutoFallbackHtmlAudioStateInternal] = useState(init.auto_fallback_html_audio ?? false);
    const [layoutMode, setLayoutModeStateInternal] = useState<'default' | 'spotify'>(init.layout_mode as 'default' | 'spotify');
    const [shortcuts, setShortcutsState] = useState<Record<ShortcutAction, string>>({
        ...DEFAULT_SHORTCUTS,
        ...(init.shortcuts as Record<ShortcutAction, string>),
    });
    const [pauseIfMuted, setPauseIfMutedState] = useState(init.pause_if_muted);
    const [fadeAudio, setFadeAudioStateInternal] = useState(init.fade_audio);
    const [fadeDuration, setFadeDurationStateInternal] = useState(init.fade_duration);
    const [toolbarColumns, setToolbarColumnsStateInternal] = useState<string[]>(
        init.toolbar_columns ?? ['name', 'artist', 'album', 'year', 'duration', 'ext', 'size', 'mtime']
    );

    const shortcutsRef = useRef<Record<ShortcutAction, string>>({
        ...DEFAULT_SHORTCUTS,
        ...(init.shortcuts as Record<ShortcutAction, string>),
    });
    const volumeLimitRef = useRef<number>(init.volume_limit);
    const volumeStepRef = useRef<number>(init.volume_step);
    const volumeModeRef = useRef<'app' | 'system'>(init.volume_mode as 'app' | 'system');
    const appVolumeRef = useRef<number>(init.app_volume);
    const systemVolumeRef = useRef<number>(1);
    const lastLocalVolumeSetRef = useRef<number>(0);
    const fadeAudioRef = useRef(init.fade_audio);
    const fadeDurationRef = useRef(init.fade_duration);

    useEffect(() => {
        fadeAudioRef.current = fadeAudio;
        fadeDurationRef.current = fadeDuration;
    }, [fadeAudio, fadeDuration]);

    const setFadeAudio = useCallback((v: boolean) => {
        setFadeAudioStateInternal(v);
        setStoredValue('fade_audio', v);
    }, []);

    const setFadeDuration = useCallback((v: number) => {
        setFadeDurationStateInternal(v);
        setStoredValue('fade_duration', v);
    }, []);

    useEffect(() => {
        volumeModeRef.current = volumeMode;
        volumeLimitRef.current = volumeLimit;
        volumeStepRef.current = volumeStep;
        appVolumeRef.current = appVolume;
        systemVolumeRef.current = systemVolume;
    });

    const setAutoWallpaperState = useCallback((v: boolean) => {
        setAutoWallpaperStateInternal(v);
        setStoredValue('auto_wallpaper', v);
    }, []);

    const setResetOnCloseState = useCallback((v: boolean) => {
        setResetOnCloseStateInternal(v);
        setStoredValue('reset_on_close', v);
        if (isBrowserTauri()) {
            getTauri().then(mod => mod.invoke('set_reset_on_close', {enabled: v})).catch(() => {});
        }
    }, []);

    const setWallpaperFitMode = useCallback((v: WallpaperFitMode) => {
        setWallpaperFitModeStateInternal(v);
        setStoredValue('wallpaper_fit_mode', v);
        if (isBrowserTauri()) {
            getTauri().then(mod => mod.invoke('set_wallpaper_fit_mode', {mode: v})).catch(() => {});
        }
    }, []);

    const setWallpaperEffect = useCallback((v: WallpaperEffect) => {
        setWallpaperEffectStateInternal(v);
        setStoredValue('wallpaper_effect', v);
        if (isBrowserTauri()) {
            getTauri().then(mod => mod.invoke('set_wallpaper_effect', {effect: v})).catch(() => {});
        }
    }, []);

    const setWallpaperTransition = useCallback((v: WallpaperTransition) => {
        setWallpaperTransitionStateInternal(v);
        setStoredValue('wallpaper_transition', v);
        if (isBrowserTauri()) {
            getTauri().then(mod => mod.invoke('set_wallpaper_transition', {transition: v})).catch(() => {});
        }
    }, []);

    const setFolderSortState = useCallback((v: string) => {
        setFolderSortStateInternal(v);
        setStoredValue('folder_sort', v);
    }, []);

    const setFileSortState = useCallback((v: string) => {
        setFileSortStateInternal(v);
        setStoredValue('file_sort', v);
    }, []);

    const setSortDirState = useCallback((v: string) => {
        setSortDirStateInternal(v);
        setStoredValue('sort_dir', v as 'asc' | 'desc');
    }, []);

    const setNameSourceState = useCallback((v: string) => {
        setNameSourceStateInternal(v);
        setStoredValue('name_source', v as 'filename' | 'title');
    }, []);

    const setVolumeModeState = useCallback((v: 'app' | 'system') => {
        setVolumeModeStateInternal(v);
        setStoredValue('volume_mode', v);
    }, []);

    const setFormatsState = useCallback((v: string[]) => {
        setFormatsStateInternal(v);
        setStoredValue('formats', v);
    }, []);

    const setShuffleState = useCallback((v: boolean) => {
        setShuffleStateInternal(v);
        setStoredValue('shuffle', v);
    }, []);

    const setRepeatState = useCallback((v: 'off' | 'all' | 'one') => {
        setRepeatStateInternal(v);
        setStoredValue('repeat', v);
    }, []);

    const setAccentColorState = useCallback((v: string) => {
        setAccentColorStateInternal(v);
        setStoredValue('accent_color', v);
        if (v === 'custom') {
            setCustomAccentVars(customAccentHex);
        } else {
            removeCustomAccentVars();
        }
    }, [customAccentHex]);

    const setCustomAccentHexState = useCallback((v: string) => {
        setCustomAccentHexStateInternal(v);
        setStoredValue('custom_accent_hex', v);
        if (accentColor === 'custom') {
            setCustomAccentVars(v);
        }
    }, [accentColor]);

    const setAppVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setAppVolumeState(clamped);
        appVolumeRef.current = clamped;
        setStoredValue('app_volume', clamped, { debounceMs: 150 });
    }, []);

    const setLanguage = useCallback((v: Lang) => {
        setLanguageState(v);
        setStoredValue('language', v);
    }, []);

    const setVolumeStep = useCallback((v: number) => {
        const clamped = Math.max(1, Math.min(10, v));
        setVolumeStepState(clamped);
        volumeStepRef.current = clamped;
        setStoredValue('volume_step', clamped);
    }, []);

    const setSystemVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setSystemVolumeState(clamped);
        systemVolumeRef.current = clamped;
    }, []);

    const setMusicFolder = useCallback((folder: string | null) => {
        setMusicFolderState(folder);
        setStoredValue('music_folder', folder);
    }, []);

    const setToolbarColumns = useCallback((cols: string[]) => {
        setToolbarColumnsStateInternal(cols);
        setStoredValue('toolbar_columns', cols);
    }, []);

    const setDefaultWallpaper = useCallback((path: string | null) => {
        setDefaultWallpaperState(path);
        setStoredValue('default_wallpaper', path);
        if (isBrowserTauri()) {
            getTauri().then(mod => {
                mod.invoke('set_default_wallpaper_path', {path});
            }).catch(() => {});
        }
    }, []);

    // Initial setup of custom accent variables if active
    useEffect(() => {
        if (accentColor === 'custom') {
            setCustomAccentVars(customAccentHex);
        } else {
            removeCustomAccentVars();
        }
    }, [accentColor, customAccentHex]);

    // Asynchronously fetch config from Rust backend on startup and apply any updates
    useEffect(() => {
        if (!isBrowserTauri()) return;
        let cancelled = false;
        getTauri().then(tauri => tauri.invoke<SymvoniaConfig>('get_app_config')).then(backendConfig => {
            if (cancelled || !backendConfig) return;
            syncConfigFromBackend(backendConfig);
            if (backendConfig.music_folder !== undefined) setMusicFolderState(backendConfig.music_folder);
            if (backendConfig.language) setLanguageState(backendConfig.language as Lang);
            if (backendConfig.accent_color) setAccentColorStateInternal(backendConfig.accent_color);
            if (backendConfig.custom_accent_hex) setCustomAccentHexStateInternal(backendConfig.custom_accent_hex);
            if (backendConfig.layout_mode) setLayoutModeStateInternal(backendConfig.layout_mode as 'default' | 'spotify');
            if (backendConfig.auto_wallpaper !== undefined) setAutoWallpaperStateInternal(backendConfig.auto_wallpaper);
            if (backendConfig.reset_on_close !== undefined) setResetOnCloseStateInternal(backendConfig.reset_on_close);
            if (backendConfig.folder_sort) setFolderSortStateInternal(backendConfig.folder_sort);
            if (backendConfig.file_sort) setFileSortStateInternal(backendConfig.file_sort);
            if (backendConfig.sort_dir) setSortDirStateInternal(backendConfig.sort_dir);
            if (backendConfig.name_source) setNameSourceStateInternal(backendConfig.name_source);
            if (backendConfig.volume_mode) setVolumeModeStateInternal(backendConfig.volume_mode as 'app' | 'system');
            if (backendConfig.app_volume !== undefined) {
                setAppVolumeState(backendConfig.app_volume);
                appVolumeRef.current = backendConfig.app_volume;
            }
            if (backendConfig.volume_limit !== undefined) {
                setVolumeLimitState(backendConfig.volume_limit);
                volumeLimitRef.current = backendConfig.volume_limit;
            }
            if (backendConfig.volume_step !== undefined) {
                setVolumeStepState(backendConfig.volume_step);
                volumeStepRef.current = backendConfig.volume_step;
            }
            if (backendConfig.formats && backendConfig.formats.length > 0) setFormatsStateInternal(backendConfig.formats);
            if (backendConfig.shuffle !== undefined) setShuffleStateInternal(backendConfig.shuffle);
            if (backendConfig.repeat) setRepeatStateInternal(backendConfig.repeat as 'off' | 'all' | 'one');
            if (backendConfig.default_wallpaper !== undefined) setDefaultWallpaperState(backendConfig.default_wallpaper);
            if (backendConfig.output_device !== undefined) setOutputDeviceStateInternal(backendConfig.output_device);
            if (backendConfig.output_mode) setOutputModeStateInternal(normalizeOutputMode(backendConfig.output_mode));
            if (backendConfig.auto_fallback_html_audio !== undefined) setAutoFallbackHtmlAudioStateInternal(backendConfig.auto_fallback_html_audio);
            if (backendConfig.shortcuts) {
                const sc = { ...DEFAULT_SHORTCUTS, ...backendConfig.shortcuts };
                setShortcutsState(sc as Record<ShortcutAction, string>);
                shortcutsRef.current = sc as Record<ShortcutAction, string>;
            }
            if (backendConfig.pause_if_muted !== undefined) setPauseIfMutedState(backendConfig.pause_if_muted);
            if (backendConfig.fade_audio !== undefined) setFadeAudioStateInternal(backendConfig.fade_audio);
            if (backendConfig.fade_duration !== undefined) setFadeDurationStateInternal(backendConfig.fade_duration);
            if (backendConfig.toolbar_columns && backendConfig.toolbar_columns.length > 0) {
                setToolbarColumnsStateInternal(backendConfig.toolbar_columns);
            }
        }).catch(err => {
            console.error('[Symvonia Settings] Failed to load config from backend:', err);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isBrowserTauri() || volumeMode !== 'system') {
            const frame = requestAnimationFrame(() => setSystemVolumeSynced(false));
            return () => cancelAnimationFrame(frame);
        }

        let cancelled = false;
        let volumeUnlisten: (() => void) | null = null;
        let focusUnlisten: (() => void) | null = null;
        let registered = false;

        const setupVolumeCallback = async () => {
            try {
                const m = await getTauri();
                const {getCurrentWindow} = await import('@tauri-apps/api/window');
                const {listen} = await import('@tauri-apps/api/event');

                const registerVolumeCallback = async () => {
                    if (registered || cancelled) return;
                    try {
                        await m.invoke('register_volume_callback');
                        registered = true;
                    } catch {
                        // register failed silently — will retry on focus
                    }
                };

                // Initial sync
                const initialVolume = await m.invoke<number>('get_system_volume');
                const initialMuted = await m.invoke<boolean>('get_system_mute').catch(() => false);

                if (!cancelled) {
                    setSystemVolumeState(initialVolume / 100);
                    systemVolumeRef.current = initialVolume / 100;
                    setSystemMuted(initialMuted);
                    setSystemVolumeSynced(true);

                    const limit = volumeLimitRef.current;
                    if (limit > 0 && initialVolume > 0) {
                        setVolumeLimitExceeded(initialVolume > limit);
                    }
                }

                // Listen to volume change events from Rust callback
                volumeUnlisten = await listen<{volume: number; muted: boolean}>(
                    'system-volume-changed',
                    (event) => {
                        if (cancelled) return;

                        const {volume: osPct, muted} = event.payload;
                        const v = osPct / 100;

                        setSystemMuted(muted);
                        setSystemVolumeSynced(true);

                        const limit = volumeLimitRef.current;
                        if (limit > 0 && v > 0) {
                            setVolumeLimitExceeded(v > limit / 100);
                        } else if (limit === 0) {
                            setVolumeLimitExceeded(false);
                        }

                        if (Date.now() - lastLocalVolumeSetRef.current < 300) return;

                        if (Math.abs(v - systemVolumeRef.current) > 0.001) {
                            setSystemVolumeState(v);
                            systemVolumeRef.current = v;
                        }
                    }
                );

                const currentWindow = getCurrentWindow();

                focusUnlisten = await currentWindow.onFocusChanged(async ({payload: focused}) => {
                    if (!focused || cancelled) return;
                    await registerVolumeCallback();
                });

                if (await currentWindow.isFocused()) {
                    await registerVolumeCallback();
                }

            } catch {
                if (!cancelled) setSystemVolumeSynced(true);
            }
        };

        setupVolumeCallback();

        return () => {
            cancelled = true;
            volumeUnlisten?.();
            focusUnlisten?.();
        };
    }, [language, volumeMode]);

    useEffect(() => {
        if (!isBrowserTauri()) return;
        let cancelled = false;
        let unlisten: (() => void) | null = null;
        import('@tauri-apps/api/event').then(({listen}) => {
            listen<string>('stream-url-changed', (event) => {
                try {
                    const url = event.payload;
                    const domain = new URL(url).hostname.replace(/^www\./, '');
                    const currentHistory = getInitialConfig().stream_history || [];
                    const newEntry = { id: String(Date.now()), title: domain, url, timestamp: Date.now() };
                    const updated = [newEntry, ...currentHistory.filter(x => x.url !== url)].slice(0, 200);
                    setStoredValue('stream_history', updated);
                } catch {
                    // ignore
                }
            }).then((fn) => {
                if (cancelled) {
                    fn();
                } else {
                    unlisten = fn;
                }
            });
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, []);

    const updateShortcut = useCallback((action: string, newKey: string) => {
        setShortcutsState(prev => {
            const next = {...prev, [action]: newKey};
            shortcutsRef.current = next as Record<ShortcutAction, string>;
            setStoredValue('shortcuts', next);
            return next as Record<ShortcutAction, string>;
        });
    }, []);

    const resetShortcuts = useCallback(() => {
        setShortcutsState(DEFAULT_SHORTCUTS);
        shortcutsRef.current = DEFAULT_SHORTCUTS;
        setStoredValue('shortcuts', DEFAULT_SHORTCUTS);
    }, []);

    const handleVolumeLimitSetting = (v: number) => {
        setVolumeLimitState(v);
        setStoredValue('volume_limit', v);
        if (v > 0 && volumeModeRef.current === 'system' && systemVolumeRef.current * 100 > v) {
            const newVol = v / 100;
            setSystemVolume(newVol);
            if (isBrowserTauri()) {
                getTauri().then(m => m.invoke('set_system_volume', {value: v})).catch(() => {});
            }
        }
    };

    const setOutputDeviceState = useCallback((name: string | null) => {
        setOutputDeviceStateInternal(name);
        setStoredValue('output_device', name);
    }, []);

    const setOutputMode = useCallback((mode: OutputMode) => {
        setOutputModeStateInternal(mode);
        setStoredValue('output_mode', mode);
    }, []);

    const setAutoFallbackHtmlAudio = useCallback((v: boolean) => {
        setAutoFallbackHtmlAudioStateInternal(v);
        setStoredValue('auto_fallback_html_audio', v);
    }, []);

    const setLayoutModeState = useCallback((mode: 'default' | 'spotify') => {
        setLayoutModeStateInternal(mode);
        setStoredValue('layout_mode', mode);
    }, []);

    const setPauseIfMuted = useCallback((v: boolean) => {
        setPauseIfMutedState(v);
        setStoredValue('pause_if_muted', v);
    }, []);

    return {
        musicFolder,
        setMusicFolder,
        initialized,
        autoWallpaper,
        setAutoWallpaperState,
        resetOnClose,
        setResetOnCloseState,
        folderSort,
        setFolderSortState,
        fileSort,
        setFileSortState,
        sortDir,
        setSortDirState,
        nameSource,
        setNameSourceState,
        volumeMode,
        setVolumeModeState,
        appVolume,
        setAppVolume,
        systemVolume,
        setSystemVolume,
        systemVolumeSynced,
        systemMuted,
        setSystemMuted,
        language,
        setLanguage,
        volumeStep,
        volumeStepRef,
        setVolumeStep,
        volumeLimit,
        volumeLimitExceeded,
        setVolumeLimitExceeded,
        formats,
        setFormatsState,
        shuffle,
        setShuffleState,
        repeat,
        setRepeatState,
        accentColor,
        setAccentColorState,
        customAccentHex,
        setCustomAccentHexState,
        defaultWallpaper,
        setDefaultWallpaper,
        wallpaperFitMode,
        setWallpaperFitMode,
        wallpaperEffect,
        setWallpaperEffect,
        wallpaperTransition,
        setWallpaperTransition,
        outputDevice,
        setOutputDeviceState,
        outputMode,
        setOutputMode,
        autoFallbackHtmlAudio,
        setAutoFallbackHtmlAudio,
        layoutMode,
        setLayoutModeState,
        shortcuts,
        shortcutsRef,
        updateShortcut,
        resetShortcuts,
        handleVolumeLimitSetting,
        volumeModeRef,
        volumeLimitRef,
        appVolumeRef,
        systemVolumeRef,
        lastLocalVolumeSetRef,
        pauseIfMuted,
        setPauseIfMuted,
        fadeAudio,
        setFadeAudio,
        fadeDuration,
        setFadeDuration,
        fadeAudioRef,
        fadeDurationRef,
        toolbarColumns,
        setToolbarColumns,
    };
}
