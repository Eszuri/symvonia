import type {OutputMode} from '../../lib/storage';

type PlaybackRuntimeStatus =
    | 'idle'
    | 'loading'
    | 'starting'
    | 'playing'
    | 'paused'
    | 'stopping'
    | 'fallback'
    | 'error'
    | 'unavailable';

interface PlaybackRuntimeError {
    code?: string;
    message: string;
    context?: string;
    mode?: 'shared' | 'exclusive' | null;
    path?: string | null;
    requestId?: string | null;
    generation?: number | null;
}

export interface PlaybackRuntimeInfo {
    status: PlaybackRuntimeStatus;
    requestedMode: OutputMode;
    effectiveMode: OutputMode | null;
    path: string | null;
    position: number;
    duration: number;
    deviceName: string | null;
    sampleRate: number | null;
    bitDepth: number | null;
    error: PlaybackRuntimeError | null;
}
