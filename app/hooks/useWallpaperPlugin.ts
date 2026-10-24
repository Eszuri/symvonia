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

const BUILTIN_PLUGIN_STATUS: WallpaperPluginStatus = { installed: true };

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
    const [engineState, setEngineState] = useState<WallpaperEngineState>(() => ({
        ...globalEngineState,
        fit_mode: getStoredValue('wallpaper_fit_mode', 'fill'),
        effect: getStoredValue('wallpaper_effect', 'none'),
        transition: getStoredValue('wallpaper_transition', 'fade'),
        fps: getStoredValue('wallpaper_engine_fps', 30),
        intensity: getStoredValue('wallpaper_engine_intensity', 1.0),
    }));
    const [isBusy, setIsBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        // Built-in native Rust engine is always installed
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
            void refreshEngineState();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshEngineState]);

    useEffect(() => {
        if (!isBrowserTauri()) return;

        let unlistenEvent: (() => void) | undefined;
        let unlistenStopped: (() => void) | undefined;
        let isCleanedUp = false;

        import('@tauri-apps/api/event').then(({ listen }) => {
            if (isCleanedUp) return;

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
            unlistenEvent?.();
            unlistenStopped?.();
        };
    }, []);

    const startEngine = useCallback(async (options?: { fps?: number; intensity?: number; texturePath?: string; fitMode?: string; effect?: string; transition?: string }) => {
        if (!isBrowserTauri()) return;
        setErrorMsg(null);
        setIsBusy(true);
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
            await setStoredValue('wallpaper_engine_enabled', true);
            if (options?.fps !== undefined) void setStoredValue('wallpaper_engine_fps', options.fps);
            if (options?.intensity !== undefined) void setStoredValue('wallpaper_engine_intensity', options.intensity);
            if (options?.fitMode !== undefined) void setStoredValue('wallpaper_fit_mode', options.fitMode as WallpaperFitMode);
            if (options?.effect !== undefined) void setStoredValue('wallpaper_effect', options.effect as WallpaperEffect);
            if (options?.transition !== undefined) void setStoredValue('wallpaper_transition', options.transition as WallpaperTransition);

            return res;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        } finally {
            setIsBusy(false);
        }
    }, []);

    const stopEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        setIsBusy(true);
        try {
            const mod = await getTauri();
            await mod.invoke('stop_wallpaper_engine');
            setEngineState((prev) => {
                const next = { ...prev, is_running: false, state: 'stopped' };
                globalEngineState = next;
                return next;
            });
            await setStoredValue('wallpaper_engine_enabled', false);
        } catch {
            // Ignore error
        } finally {
            setIsBusy(false);
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
            if (globalEngineState.is_running) {
                await mod.invoke('set_wallpaper_engine_fit_mode', { mode });
            } else {
                await mod.invoke('set_wallpaper_fit_mode', { mode });
            }
            setEngineState((prev) => ({ ...prev, fit_mode: mode }));
            await setStoredValue('wallpaper_fit_mode', mode as WallpaperFitMode);
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
            await setStoredValue('wallpaper_effect', effect as WallpaperEffect);
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
            await setStoredValue('wallpaper_transition', transition as WallpaperTransition);
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
            await setStoredValue('wallpaper_engine_fps', fps);
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
            void setStoredValue('wallpaper_engine_intensity', intensity, { debounceMs: 200 });
        } catch {
            // Ignore
        }
    }, []);

    // Auto-start live wallpaper engine if enabled in saved config.json
    useEffect(() => {
        if (!globalAutoStarted && !globalEngineState.is_running) {
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
    }, [startEngine]);

    return {
        pluginStatus: BUILTIN_PLUGIN_STATUS,
        engineState,
        isEngineRunning: engineState.is_running,
        isBusy,
        errorMsg,
        refreshStatus,
        refreshEngineState,
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
