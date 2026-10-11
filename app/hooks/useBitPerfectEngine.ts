import {useCallback, useEffect, useRef, useState} from "react";
import {getTauri, isBrowserTauri} from "../lib/homeState";

export type NativeOutputMode = "shared" | "exclusive";

export interface BitPerfectPluginStatus {
    installed: boolean;
    path: string | null;
    size_bytes: number | null;
    sha256: string | null;
}

export interface EngineStateEvent {
    state: "playing" | "paused" | "stopped" | "ended";
    path: string | null;
    mode?: NativeOutputMode | null;
    exclusive: boolean;
    sampleRate?: number | null;
    bitDepth?: number | null;
    deviceName?: string | null;
    requestId?: string | null;
    generation?: number | null;
}

export interface EngineErrorEvent {
    code?: string;
    message: string;
    context?: string;
    mode?: NativeOutputMode | null;
    path?: string | null;
    requestId?: string | null;
    generation?: number | null;
    recoverable?: boolean;
}

export interface EngineProgressEvent {
    position: number;
    duration: number;
    path?: string | null;
    mode?: NativeOutputMode | null;
    requestId?: string | null;
    generation?: number | null;
}

export interface EngineDevice {
    id: string;
    name: string;
    isDefault: boolean;
}

export interface WasapiSupportResult {
    deviceName: string;
    supportedExclusive: boolean;
    supportedShared: boolean;
    defaultSampleRate?: number | null;
    supportedSampleRates: number[];
    exclusiveNotAllowed: boolean;
    inUse: boolean;
    message: string;
}

interface EngineEventHandlers {
    onState?: (e: EngineStateEvent) => void;
    onProgress?: (e: EngineProgressEvent) => void;
    onError?: (e: EngineErrorEvent) => void;
}

function isNativeOutputMode(value: unknown): value is NativeOutputMode {
    return value === "shared" || value === "exclusive";
}

function parseStateEvent(value: Record<string, unknown>): EngineStateEvent | null {
    if (value.state !== "playing" && value.state !== "paused" && value.state !== "stopped" && value.state !== "ended") return null;
    if (typeof value.exclusive !== "boolean") return null;
    return {
        state: value.state,
        path: typeof value.path === "string" ? value.path : null,
        mode: isNativeOutputMode(value.mode)
            ? value.mode
            : value.exclusive === true
                ? "exclusive"
                : "shared",
        exclusive: value.exclusive,
        sampleRate: typeof value.sampleRate === "number" && Number.isFinite(value.sampleRate) ? value.sampleRate : null,
        bitDepth: typeof value.bitDepth === "number" && Number.isFinite(value.bitDepth) ? value.bitDepth : null,
        deviceName: typeof value.deviceName === "string" ? value.deviceName : null,
        requestId: typeof value.requestId === "string" ? value.requestId : null,
        generation: typeof value.generation === "number" && Number.isFinite(value.generation) ? value.generation : null,
    };
}

function parseProgressEvent(value: Record<string, unknown>): EngineProgressEvent | null {
    if (typeof value.position !== "number" || !Number.isFinite(value.position)) return null;
    if (typeof value.duration !== "number" || !Number.isFinite(value.duration)) return null;
    return {
        position: Math.max(0, value.position),
        duration: Math.max(0, value.duration),
        path: typeof value.path === "string" ? value.path : null,
        mode: isNativeOutputMode(value.mode) ? value.mode : null,
        requestId: typeof value.requestId === "string" ? value.requestId : null,
        generation: typeof value.generation === "number" && Number.isFinite(value.generation) ? value.generation : null,
    };
}

/**
 * Manages the optional C# Bit-Perfect audio engine plugin:
 * install status, download/uninstall, process lifecycle, and the
 * `audio-event` JSON stream coming from its stdout.
 */
export function useBitPerfectEngine(handlers: EngineEventHandlers = {}) {
    const [status, setStatus] = useState<BitPerfectPluginStatus | null>(null);

    const setStatusGlobal = useCallback((newStatus: BitPerfectPluginStatus | null) => {
        setStatus(newStatus);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bitperfect-status-changed', { detail: newStatus }));
            window.dispatchEvent(new CustomEvent('equalizer-status-changed', { detail: newStatus }));
            window.dispatchEvent(new CustomEvent('tageditor-status-changed', { detail: newStatus }));
        }
    }, []);
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<{downloaded: number; total: number} | null>(null);
    const [engineRunning, setEngineRunning] = useState(false);
    const [engineState, setEngineState] = useState<EngineStateEvent | null>(null);

    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    });

    const refreshStatus = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const s = await mod.invoke<BitPerfectPluginStatus>("get_bit_perfect_plugin_status");
            setStatusGlobal(s);
        } catch {
            // plugin commands unavailable (older backend) — stay silent
        }
    }, [setStatusGlobal]);

    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent<BitPerfectPluginStatus | null>;
            setStatus(customEvent.detail);
        };
        window.addEventListener('bitperfect-status-changed', handler);
        return () => window.removeEventListener('bitperfect-status-changed', handler);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refreshStatus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshStatus]);

    // Subscribe to engine stdout events + download progress.
    useEffect(() => {
        if (!isBrowserTauri()) return;
        let cancelled = false;
        const unlistens: Array<() => void> = [];

        import("@tauri-apps/api/event").then(({listen}) => {
            listen<string>("audio-event", (event) => {
                if (cancelled) return;
                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(event.payload);
                } catch {
                    return;
                }
                switch (parsed.event) {
                    case "state": {
                        const state = parseStateEvent(parsed);
                        if (state) {
                            setEngineState(state);
                            handlersRef.current.onState?.(state);
                        }
                        break;
                    }
                    case "progress": {
                        const progress = parseProgressEvent(parsed);
                        if (progress) handlersRef.current.onProgress?.(progress);
                        break;
                    }
                    case "error":
                        handlersRef.current.onError?.({
                            code: parsed.code ? String(parsed.code) : undefined,
                            message: String(parsed.message ?? "Unknown engine error"),
                            context: parsed.context ? String(parsed.context) : undefined,
                            mode: parsed.mode === "shared" || parsed.mode === "exclusive" ? parsed.mode : null,
                            path: parsed.path ? String(parsed.path) : null,
                            requestId: parsed.requestId ? String(parsed.requestId) : null,
                            generation: typeof parsed.generation === "number" ? parsed.generation : null,
                            recoverable: parsed.recoverable === true,
                        });
                        break;
                    case "bye":
                        setEngineRunning(false);
                        break;
                }
            }).then((fn) => (cancelled ? fn() : unlistens.push(fn)));

            listen("audio-engine-exit", () => {
                if (cancelled) return;
                setEngineRunning(false);
                setEngineState(null);
            }).then((fn) => (cancelled ? fn() : unlistens.push(fn)));

            listen<{downloaded: number; total: number}>("bit-perfect-download-progress", (event) => {
                if (cancelled) return;
                setDownloadProgress(event.payload);
            }).then((fn) => (cancelled ? fn() : unlistens.push(fn)));
        }).catch(() => {
            if (!cancelled) {
                setEngineRunning(false);
                setEngineState(null);
            }
        });

        return () => {
            cancelled = true;
            unlistens.forEach((fn) => fn());
        };
    }, []);

    const sendCommand = useCallback(async (command: Record<string, unknown>) => {
        if (!isBrowserTauri()) return;
        const mod = await getTauri();
        await mod.invoke("send_audio_command", {json: JSON.stringify(command)});
        setEngineRunning(true);
    }, []);

    // A Tauri/WebView reload does not restart the sidecar process. Ask the
    // existing engine for its current state so a new frontend can resync the
    // play/pause controls instead of treating an already-playing stream as
    // paused.
    const getState = useCallback(async () => {
        await sendCommand({command: "get_state"});
    }, [sendCommand]);

    const download = useCallback(async () => {
        if (!isBrowserTauri()) return;
        setDownloading(true);
        setDownloadProgress(null);
        try {
            const mod = await getTauri();
            const s = await mod.invoke<BitPerfectPluginStatus>("download_bit_perfect_plugin", {});
            setStatusGlobal(s);
        } finally {
            setDownloading(false);
            setDownloadProgress(null);
        }
    }, [setStatusGlobal]);

    const cancelDownload = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke("cancel_bit_perfect_plugin_download");
        } catch (e) {
            console.error("Error cancelling download:", e);
        } finally {
            setDownloading(false);
            setDownloadProgress(null);
        }
    }, []);

    const installFromFile = useCallback(async (path: string) => {
        if (!isBrowserTauri()) return;
        const mod = await getTauri();
        const s = await mod.invoke<BitPerfectPluginStatus>("install_bit_perfect_plugin_from_file", {path});
        setStatusGlobal(s);
    }, [setStatusGlobal]);

    const uninstall = useCallback(async () => {
        if (!isBrowserTauri()) return;
        const mod = await getTauri();
        await mod.invoke("uninstall_bit_perfect_plugin");
        setStatusGlobal({installed: false, path: null, size_bytes: null, sha256: null});
        setEngineRunning(false);
        setEngineState(null);
    }, [setStatusGlobal]);

    const stopEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        const mod = await getTauri();
        await mod.invoke("stop_audio_engine");
        setEngineRunning(false);
    }, []);

    const getDevices = useCallback(async (): Promise<EngineDevice[]> => {
        if (!isBrowserTauri()) return [];
        const mod = await getTauri();

        // Prefer enumeration in the host process. It keeps the settings UI
        // usable even when the optional engine has not emitted its IPC event
        // yet (or an older installed engine does not support get_devices).
        try {
            // Do not let a blocked OS audio endpoint hold the settings picker
            // indefinitely. The sidecar request below is the compatibility
            // fallback for older installs and slow/unavailable CPAL hosts.
            const nativeDevices = await new Promise<EngineDevice[] | null>((resolve, reject) => {
                const timer = window.setTimeout(() => resolve(null), 750);
                mod.invoke<EngineDevice[]>("get_audio_devices").then(
                    (devices) => {
                        window.clearTimeout(timer);
                        resolve(devices);
                    },
                    (error) => {
                        window.clearTimeout(timer);
                        reject(error);
                    },
                );
            });
            if (Array.isArray(nativeDevices) && nativeDevices.length > 0) {
                return nativeDevices
                    .filter((device) => device && typeof device.id === "string" && typeof device.name === "string")
                    .map((device) => ({
                        id: device.id,
                        name: device.name,
                        isDefault: device.isDefault === true,
                    }));
            }
        } catch {
            // Fall back to the optional engine's request/response path below.
        }

        const requestId = crypto.randomUUID();
        return new Promise<EngineDevice[]>((resolve) => {
            let done = false;
            let unlisten: (() => void) | null = null;
            const timer = window.setTimeout(() => finish([]), 1500);
            const finish = (devices: EngineDevice[]) => {
                if (done) return;
                done = true;
                window.clearTimeout(timer);
                unlisten?.();
                resolve(devices);
            };

            import("@tauri-apps/api/event")
                .then(({listen}) => listen<string>("audio-event", (event) => {
                    try {
                        const parsed = JSON.parse(event.payload) as Record<string, unknown>;
                        if (
                            parsed.event === "devices" &&
                            (parsed.requestId === requestId || parsed.requestId === undefined) &&
                            Array.isArray(parsed.devices)
                        ) {
                            finish(parsed.devices as EngineDevice[]);
                        }
                    } catch {
                        // Ignore malformed device events.
                    }
                }))
                .then((stopListening) => {
                    unlisten = stopListening;
                    if (done) {
                        stopListening();
                        return;
                    }
                    return mod.invoke("send_audio_command", {
                        json: JSON.stringify({command: "get_devices", requestId}),
                    }).then(() => setEngineRunning(true));
                })
                .catch(() => finish([]));
        });
    }, []);

    const testDevice = useCallback(async (deviceId?: string | null): Promise<WasapiSupportResult> => {
        if (!isBrowserTauri()) {
            throw new Error("Pengujian perangkat hanya didukung di aplikasi desktop Tauri.");
        }
        const mod = await getTauri();
        return mod.invoke<WasapiSupportResult>("test_wasapi_device", {
            deviceId: deviceId || null,
        });
    }, []);

    return {
        status,
        downloading,
        downloadProgress,
        engineRunning,
        engineState,
        refreshStatus,
        sendCommand,
        getState,
        download,
        cancelDownload,
        installFromFile,
        uninstall,
        stopEngine,
        getDevices,
        testDevice,
    };
}
