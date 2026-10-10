import type {OutputMode} from '../../lib/storage';
import type {FileEntry} from '../../components/FolderExplorer';

export const normalizePath = (p?: string | null): string =>
    p ? p.replace(/\\/g, '/').toLowerCase() : '';

export const makeTempFileEntry = (filePath: string): FileEntry => {
    const name = filePath.split(/[/\\]/).pop() || filePath;
    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
    return {
        name,
        path: filePath,
        is_dir: false,
        ext,
        mtime: Date.now(),
        size: 0,
        ctime: Date.now(),
        display_name: name,
        sort_key: name,
    };
};

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
