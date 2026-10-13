// M2: Dedicated Tauri module — breaks circular dependency between homeState.ts and storage.ts
// M3: Caches the import Promise itself to prevent multiple concurrent dynamic imports

export interface TauriCore {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    convertFileSrc: (path: string, protocol?: string) => string;
}

let tauriPromise: Promise<TauriCore> | null = null;

export async function getTauri(): Promise<TauriCore> {
    if (!tauriPromise) {
        tauriPromise = import('@tauri-apps/api/core').then(
            (mod) => mod as unknown as TauriCore
        );
    }
    return tauriPromise;
}

export interface LibraryCacheInvalidatedEvent {
    root_path: string;
    affected_paths: string[];
}

if (typeof window !== 'undefined') {
    const patchTauriEventInternals = () => {
        const anyWin = window as unknown as {
            __TAURI_EVENT_PLUGIN_INTERNALS__?: {
                unregisterListener?: (event: string, eventId: number) => void;
                _safeGuarded?: boolean;
            };
        };
        const internals = anyWin.__TAURI_EVENT_PLUGIN_INTERNALS__;
        if (internals && typeof internals.unregisterListener === 'function' && !internals._safeGuarded) {
            const originalUnregister = internals.unregisterListener;
            internals.unregisterListener = (event: string, eventId: number) => {
                try {
                    return originalUnregister.call(internals, event, eventId);
                } catch {
                    // Benign: listener was already removed or unmounted rapidly in React StrictMode
                }
            };
            internals._safeGuarded = true;
        }
    };
    patchTauriEventInternals();

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason as { message?: string } | undefined;
        const msg = reason?.message || String(event.reason || '');
        if (msg.includes("reading 'handlerId'") || msg.includes('unregisterListener')) {
            event.preventDefault();
        }
    });
}

export async function listenTauri<T>(
    eventName: string,
    handler: (payload: T) => void,
): Promise<() => void> {
    const {listen} = await import('@tauri-apps/api/event');
    const rawUnlisten = await listen<T>(eventName, (event) => handler(event.payload));
    let unlistened = false;
    return () => {
        if (unlistened) return;
        unlistened = true;
        try {
            const maybePromise: unknown = rawUnlisten();
            if (maybePromise && typeof (maybePromise as { catch?: unknown }).catch === 'function') {
                (maybePromise as Promise<void>).catch(() => {});
            }
        } catch {
            // Ignore unlisten errors
        }
    };
}

