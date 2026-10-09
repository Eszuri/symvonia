'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTauri, isBrowserTauri } from '../lib/homeState';
import { getStoredValue, setStoredValue, type WallpaperFitMode, type WallpaperEffect, type WallpaperTransition } from '../lib/storage';

export interface WallpaperPluginStatus {
    installed: boolean;
    path?: string | null;
    size_bytes?: number | null;
    sha256?: string | null;
}

export interface WallpaperDownloadProgress {
    downloaded: number;
    total: number;
}

export interface WallpaperEngineState {
    is_running: boolean;
    state: string;
    scene: string;
    texture_path?: string | null;
    fit_mode: string;
    effect: string;
    transition: string;
    fps: number;
    intensity: number;
    monitor_count: number;
    last_error?: string | null;
}

let globalPluginStatus: WallpaperPluginStatus = { installed: false };
let globalEngineState: WallpaperEngineState = {
    is_running: false,
    state: 'stopped',
    scene: 'cover-reactive',
    texture_path: null,
    fit_mode: 'fill',
    effect: 'none',
    transition: 'fade',
    fps: 30,
    intensity: 1.0,
    monitor_count: 0,
    last_error: null,
};

let globalAutoStarted = false;

export function isWallpaperEngineActive(): boolean {
    if (globalEngineState.is_running) return true;
    if (typeof window !== 'undefined') {
        return getStoredValue('wallpaper_engine_enabled', false);
    }
    return false;
}

export function useWallpaperPlugin() {
    const [pluginStatus, setPluginStatus] = useState<WallpaperPluginStatus>(globalPluginStatus);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<WallpaperDownloadProgress | null>(null);
    const [engineState, setEngineState] = useState<WallpaperEngineState>(() => ({
        ...globalEngineState,
        fit_mode: getStoredValue('wallpaper_fit_mode', 'fill'),
        effect: getStoredValue('wallpaper_effect', 'none'),
        transition: getStoredValue('wallpaper_transition', 'fade'),
        fps: getStoredValue('wallpaper_engine_fps', 30),
        intensity: getStoredValue('wallpaper_engine_intensity', 1.0),
    }));
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const res = await mod.invoke<WallpaperPluginStatus>('get_wallpaper_plugin_status');
            globalPluginStatus = res;
            setPluginStatus(res);
        } catch {
            // Ignore error when checking status
        }
    }, []);

    const refreshEngineState = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const res = await mod.invoke<WallpaperEngineState>('get_wallpaper_engine_state');
            globalEngineState = res;
            setEngineState(res);
        } catch {
            // Ignore error
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refreshStatus();
            void refreshEngineState();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshStatus, refreshEngineState]);

    useEffect(() => {
        if (!isBrowserTauri()) return;

        let unlistenProgress: (() => void) | undefined;
        let unlistenEvent: (() => void) | undefined;
        let unlistenStopped: (() => void) | undefined;
        let isCleanedUp = false;

        import('@tauri-apps/api/event').then(({ listen }) => {
            if (isCleanedUp) return;

            listen<WallpaperDownloadProgress>('wallpaper-download-progress', (event) => {
                const payload = event.payload;
                if (payload.total > 0 && payload.downloaded < payload.total) {
                    setIsDownloading(true);
                    setDownloadProgress(payload);
                } else if (payload.total > 0 && payload.downloaded >= payload.total) {
                    setIsDownloading(false);
                    setDownloadProgress(null);
                    refreshStatus();
                } else if (payload.total === 0 && payload.downloaded === 0) {
                    setIsDownloading(false);
                    setDownloadProgress(null);
                }
            }).then((unlisten) => {
                if (isCleanedUp) unlisten();
                else unlistenProgress = unlisten;
            });

            listen<string>('wallpaper-engine-event', (event) => {
                try {
                    const parsed = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                    if (parsed && parsed.event === 'state') {
                        setEngineState((prev) => {
                            const next: WallpaperEngineState = {
                                ...prev,
                                is_running: parsed.state === 'playing' || parsed.state === 'paused',
                                state: parsed.state || prev.state,
                                scene: parsed.scene || prev.scene,
                                texture_path: parsed.texturePath !== undefined ? parsed.texturePath : prev.texture_path,
                                fit_mode: parsed.fitMode || prev.fit_mode || 'fill',
                                effect: parsed.effect || prev.effect || 'none',
                                transition: parsed.transition || prev.transition || 'fade',
                                fps: typeof parsed.fps === 'number' ? parsed.fps : prev.fps,
                                monitor_count: typeof parsed.monitorCount === 'number' ? parsed.monitorCount : prev.monitor_count,
                                last_error: parsed.error || null,
                            };
                            globalEngineState = next;
                            return next;
                        });
                    }
                } catch {
                    // ignore parse error
                }
            }).then((unlisten) => {
                if (isCleanedUp) unlisten();
                else unlistenEvent = unlisten;
            });

            listen<void>('wallpaper-engine-stopped', () => {
                setEngineState((prev) => {
                    const next: WallpaperEngineState = {
                        ...prev,
                        is_running: false,
                        state: 'stopped',
                    };
                    globalEngineState = next;
                    return next;
                });
            }).then((unlisten) => {
                if (isCleanedUp) unlisten();
                else unlistenStopped = unlisten;
            });
        });

        return () => {
            isCleanedUp = true;
            unlistenProgress?.();
            unlistenEvent?.();
            unlistenStopped?.();
        };
    }, [refreshStatus]);

    const downloadPlugin = useCallback(async (customUrl?: string) => {
        if (!isBrowserTauri()) return;
        setIsDownloading(true);
        setErrorMsg(null);
        try {
            const mod = await getTauri();
            const res = await mod.invoke<WallpaperPluginStatus>('download_wallpaper_plugin', {
                url: customUrl || null,
            });
            globalPluginStatus = res;
            setPluginStatus(res);
            setIsDownloading(false);
            setDownloadProgress(null);
            return res;
        } catch (err: unknown) {
            setIsDownloading(false);
            setDownloadProgress(null);
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, []);

    const cancelDownloadPlugin = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('cancel_wallpaper_plugin_download');
            setIsDownloading(false);
            setDownloadProgress(null);
        } catch {
            // Ignore error
        }
    }, []);

    const installFromFile = useCallback(async (filePath: string) => {
        if (!isBrowserTauri()) return;
        setErrorMsg(null);
        try {
            const mod = await getTauri();
            const res = await mod.invoke<WallpaperPluginStatus>('install_wallpaper_plugin_from_file', {
                path: filePath,
            });
            globalPluginStatus = res;
            setPluginStatus(res);
            return res;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, []);

    const uninstallPlugin = useCallback(async () => {
        if (!isBrowserTauri()) return;
        setErrorMsg(null);
        try {
            const mod = await getTauri();
            await mod.invoke('uninstall_wallpaper_plugin');
            globalPluginStatus = { installed: false };
            setPluginStatus(globalPluginStatus);
            globalEngineState = {
                is_running: false,
                state: 'stopped',
                scene: 'cover-reactive',
                texture_path: null,
                fit_mode: 'fill',
                effect: 'none',
                transition: 'fade',
                fps: 30,
                intensity: 1.0,
                monitor_count: 0,
                last_error: null,
            };
            setEngineState(globalEngineState);
            setStoredValue('wallpaper_engine_enabled', false);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, []);

    const startEngine = useCallback(async (options?: { fps?: number; intensity?: number; texturePath?: string; fitMode?: string; effect?: string; transition?: string }) => {
        if (!isBrowserTauri()) return;
        setErrorMsg(null);
        try {
            const targetFps = options?.fps ?? getStoredValue('wallpaper_engine_fps', 30);
            const targetIntensity = options?.intensity ?? getStoredValue('wallpaper_engine_intensity', 1.0);
            const targetFit = options?.fitMode ?? getStoredValue('wallpaper_fit_mode', 'fill');
            const targetEffect = options?.effect ?? getStoredValue('wallpaper_effect', 'none');
            const targetTransition = options?.transition ?? getStoredValue('wallpaper_transition', 'fade');

            const mod = await getTauri();
            const res = await mod.invoke<WallpaperEngineState>('start_wallpaper_engine', {
                fps: targetFps,
                intensity: targetIntensity,
                texturePath: options?.texturePath ?? null,
                fitMode: targetFit,
                effect: targetEffect,
                transition: targetTransition,
            });
            globalEngineState = res;
            setEngineState(res);

            // Persist settings to config.json
            setStoredValue('wallpaper_engine_enabled', true);
            if (options?.fps !== undefined) setStoredValue('wallpaper_engine_fps', options.fps);
            if (options?.intensity !== undefined) setStoredValue('wallpaper_engine_intensity', options.intensity);
            if (options?.fitMode !== undefined) setStoredValue('wallpaper_fit_mode', options.fitMode as WallpaperFitMode);
            if (options?.effect !== undefined) setStoredValue('wallpaper_effect', options.effect as WallpaperEffect);
            if (options?.transition !== undefined) setStoredValue('wallpaper_transition', options.transition as WallpaperTransition);

            return res;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, []);

    const stopEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('stop_wallpaper_engine');
            setEngineState((prev) => {
                const next = { ...prev, is_running: false, state: 'stopped' };
                globalEngineState = next;
                return next;
            });
            setStoredValue('wallpaper_engine_enabled', false);
        } catch {
            // Ignore error
        }
    }, []);

    const pauseEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('pause_wallpaper_engine');
        } catch {
            // Ignore
        }
    }, []);

    const resumeEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('resume_wallpaper_engine');
        } catch {
            // Ignore
        }
    }, []);

    const setTexture = useCallback(async (path: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_texture', { path });
        } catch {
            // Ignore
        }
    }, []);

    const setFitMode = useCallback(async (mode: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_fit_mode', { mode });
            setEngineState((prev) => ({ ...prev, fit_mode: mode }));
            setStoredValue('wallpaper_fit_mode', mode as WallpaperFitMode);
        } catch {
            // Ignore
        }
    }, []);

    const setEffect = useCallback(async (effect: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_effect', { effect });
            setEngineState((prev) => ({ ...prev, effect }));
            setStoredValue('wallpaper_effect', effect as WallpaperEffect);
        } catch {
            // Ignore
        }
    }, []);

    const setTransition = useCallback(async (transition: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_transition', { transition });
            setEngineState((prev) => ({ ...prev, transition }));
            setStoredValue('wallpaper_transition', transition as WallpaperTransition);
        } catch {
            // Ignore
        }
    }, []);

    const setFps = useCallback(async (fps: number) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_fps', { fps });
            setEngineState((prev) => ({ ...prev, fps }));
            setStoredValue('wallpaper_engine_fps', fps);
        } catch {
            // Ignore
        }
    }, []);

    const setIntensity = useCallback(async (intensity: number) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('set_wallpaper_engine_intensity', { intensity });
            setEngineState((prev) => ({ ...prev, intensity }));
            setStoredValue('wallpaper_engine_intensity', intensity, { debounceMs: 200 });
        } catch {
            // Ignore
        }
    }, []);

    // Auto-start live wallpaper engine if enabled in saved config.json
    useEffect(() => {
        if (pluginStatus.installed && !globalAutoStarted && !globalEngineState.is_running) {
            const shouldAutoStart = getStoredValue('wallpaper_engine_enabled', false);
            if (shouldAutoStart) {
                globalAutoStarted = true;
                const timer = window.setTimeout(() => {
                    startEngine({
                        fps: getStoredValue('wallpaper_engine_fps', 30),
                        intensity: getStoredValue('wallpaper_engine_intensity', 1.0),
                        fitMode: getStoredValue('wallpaper_fit_mode', 'fill'),
                        effect: getStoredValue('wallpaper_effect', 'none'),
                        transition: getStoredValue('wallpaper_transition', 'fade'),
                        texturePath: getStoredValue('default_wallpaper', null) || undefined,
                    }).catch(() => {
                        globalAutoStarted = false;
                    });
                }, 0);
                return () => window.clearTimeout(timer);
            }
        }
    }, [pluginStatus.installed, startEngine]);

    return {
        pluginStatus,
        isDownloading,
        downloadProgress,
        engineState,
        isEngineRunning: engineState.is_running,
        errorMsg,
        refreshStatus,
        refreshEngineState,
        downloadPlugin,
        cancelDownloadPlugin,
        installFromFile,
        uninstallPlugin,
        startEngine,
        stopEngine,
        pauseEngine,
        resumeEngine,
        setTexture,
        setFitMode,
        setEffect,
        setTransition,
        setFps,
        setIntensity,
    };
}
