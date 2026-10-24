import {useCallback, useEffect, useRef, useState} from "react";
import {getTauri, isBrowserTauri} from "../lib/homeState";

export type NativeOutputMode = "shared" | "exclusive";

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
 * Manages the built-in native Rust WASAPI audio engine (Shared & Exclusive modes)
 * and subscribes to the `audio-event` stream emitted by the backend.
 */
export function useBitPerfectEngine(handlers: EngineEventHandlers = {}) {
    const [engineRunning, setEngineRunning] = useState(false);
    const [engineState, setEngineState] = useState<EngineStateEvent | null>(null);

    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    });

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

    const getState = useCallback(async () => {
        await sendCommand({command: "get_state"});
    }, [sendCommand]);

    const stopEngine = useCallback(async () => {
        if (!isBrowserTauri()) return;
        const mod = await getTauri();
        await mod.invoke("stop_audio_engine");
        setEngineRunning(false);
    }, []);

    const getDevices = useCallback(async (): Promise<EngineDevice[]> => {
        if (!isBrowserTauri()) return [];
        const mod = await getTauri();

        try {
            const nativeDevices = await mod.invoke<EngineDevice[]>("get_audio_devices");
            if (Array.isArray(nativeDevices)) {
                return nativeDevices
                    .filter((device) => device && typeof device.id === "string" && typeof device.name === "string")
                    .map((device) => ({
                        id: device.id,
                        name: device.name,
                        isDefault: device.isDefault === true,
                    }));
            }
        } catch {
            // Ignore device enumeration failure
        }

        return [];
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
        engineRunning,
        engineState,
        sendCommand,
        getState,
        stopEngine,
        getDevices,
        testDevice,
    };
}
