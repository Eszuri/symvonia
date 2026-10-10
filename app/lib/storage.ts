'use client';

// M2: Import from dedicated tauri module to break circular dependency with homeState.ts
import { getTauri } from './tauri';

interface EqualizerConfig {
    enabled: boolean;
    preset: string;
    bands: number[];
    pre_amp: number;
}

interface SessionConfig {
    file_path: string;
    current_time: number;
    timestamp: number;
}

interface StreamEntryConfig {
    id: string;
    title: string;
    url: string;
    timestamp: number;
}

export interface StorageUsage {
    config_bytes: number;
    plugins_bytes: number;
    models_bytes: number;
    cache_bytes: number;
    total_bytes: number;
    config_path: string;
    app_data_dir: string;
}

export type OutputMode = 'html_audio' | 'wasapi_shared' | 'wasapi_exclusive';

export type WallpaperFitMode = 'fill' | 'fit' | 'stretch' | 'center' | 'tile' | 'span';

export type WallpaperEffect = 'none' | 'reactive_glow' | 'subtle_pulse' | 'cinematic_vignette' | 'grayscale' | 'dimmed';

export type WallpaperTransition = 'fade' | 'zoom_in' | 'zoom_out' | 'slide' | 'none';

export function normalizeOutputMode(value: unknown): OutputMode {
    if (value === 'wasapi_shared') return 'wasapi_shared';
    if (value === 'wasapi_exclusive' || value === 'bitperfect') return 'wasapi_exclusive';
    return 'html_audio';
}



export interface SymvoniaConfig {
    music_folder: string | null;
    language: 'id' | 'en';
    accent_color: string;
    custom_accent_hex: string;
    layout_mode: 'default' | 'spotify';
    auto_wallpaper: boolean;
    reset_on_close: boolean;
    default_wallpaper: string | null;
    wallpaper_engine_enabled: boolean;
    wallpaper_fit_mode: WallpaperFitMode;
    wallpaper_effect: WallpaperEffect;
    wallpaper_transition: WallpaperTransition;
    wallpaper_engine_fps: number;
    wallpaper_engine_intensity: number;
    volume_mode: 'app' | 'system';
    app_volume: number;
    volume_step: number;
    volume_limit: number;
    pause_if_muted: boolean;
    fade_audio: boolean;
    fade_duration: number;
    folder_sort: string;
    file_sort: string;
    sort_dir: 'asc' | 'desc';
    name_source: 'filename' | 'title';
    formats: string[];
    shuffle: boolean;
    repeat: 'off' | 'all' | 'one';
    shortcuts: Record<string, string>;
    sidebar_width: number;
    meta_width: number;
    autohide_delay_ms: number;
    output_mode: OutputMode;
    output_device: string | null;
    auto_fallback_html_audio: boolean;
    equalizer: EqualizerConfig;
    gain_boost: number;
    ai_lyrics_model: string;
    ai_isolate_vocals: boolean;
    active_metadata_tab: string;
    last_session: SessionConfig | null;
    stream_history: StreamEntryConfig[];
    fullscreen: boolean;
    skipped_update_version: string | null;
    toolbar_columns: string[];
    toolbar_column_widths: Record<string, number>;
}

const DEFAULT_CONFIG: SymvoniaConfig = {
    music_folder: null,
    language: 'en',
    accent_color: 'sky',
    custom_accent_hex: '#0284c7',
    layout_mode: 'default',
    auto_wallpaper: true,
    reset_on_close: true,
    default_wallpaper: null,
    wallpaper_engine_enabled: false,
    wallpaper_fit_mode: 'fill',
    wallpaper_effect: 'none',
    wallpaper_transition: 'fade',
    wallpaper_engine_fps: 30,
    wallpaper_engine_intensity: 1.0,
    volume_mode: 'app',
    app_volume: 1.0,
    volume_step: 2,
    volume_limit: 0,
    pause_if_muted: true,
    fade_audio: true,
    fade_duration: 500,
    folder_sort: 'name',
    file_sort: 'name',
    sort_dir: 'asc',
    name_source: 'filename',
    formats: ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'wma'],
    toolbar_columns: ['name', 'artist', 'album', 'year', 'duration', 'ext', 'size', 'mtime'],
    toolbar_column_widths: {
        name: 180,
        artist: 112,
        album: 112,
        track: 56,
        year: 48,
        genre: 80,
        duration: 64,
        ext: 48,
        size: 64,
        mtime: 120,
        ctime: 120,
    },
    shuffle: false,
    repeat: 'off',
    shortcuts: {
        playPause: ' ',
        next: 'n',
        prev: 'p',
        volumeUp: 'ArrowRight',
        volumeDown: 'ArrowLeft',
    },
    sidebar_width: 360,
    meta_width: 360,
    autohide_delay_ms: 3000,
    output_mode: 'html_audio',
    output_device: null,
    auto_fallback_html_audio: false,
    equalizer: {
        enabled: false,
        preset: 'flat',
        bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        pre_amp: 0,
    },
    gain_boost: 1,
    ai_lyrics_model: 'base',
    ai_isolate_vocals: false,
    active_metadata_tab: 'info',
    last_session: null,
    stream_history: [],
    fullscreen: false,
    skipped_update_version: null,
};

// Global in-memory configuration cache
let inMemoryConfig: SymvoniaConfig | null = null;

// Debounce timer map for saving settings to disk
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Get synchronous initial configuration from native pre-runtime injection or memory cache
 */
export function getInitialConfig(): SymvoniaConfig {
    // H4: Early-return cached config to avoid rebuilding on every read
    if (inMemoryConfig) return inMemoryConfig;

    if (typeof window !== 'undefined') {
        try {
            localStorage.clear();
        } catch {}

        const injected = (window as unknown as { __SYMVONIA_INITIAL_CONFIG__?: SymvoniaConfig }).__SYMVONIA_INITIAL_CONFIG__;
        if (injected && typeof injected === 'object' && injected.language) {
            const conf: SymvoniaConfig = {
                ...DEFAULT_CONFIG,
                ...injected,
                output_mode: normalizeOutputMode(injected.output_mode),
            };
            inMemoryConfig = conf;
            return conf;
        }
    }

    inMemoryConfig = { ...DEFAULT_CONFIG };
    return inMemoryConfig;
}

/**
 * Synchronize in-memory cache when full config is received from Rust backend
 */
export function syncConfigFromBackend(backendConfig: Partial<SymvoniaConfig>): SymvoniaConfig {
    const current = getInitialConfig();
    const updated: SymvoniaConfig = {
        ...current,
        ...backendConfig,
        output_mode: normalizeOutputMode(backendConfig.output_mode ?? current.output_mode),
    };
    inMemoryConfig = updated;

    if (typeof window !== 'undefined') {
        const win = window as unknown as { __SYMVONIA_INITIAL_CONFIG__?: SymvoniaConfig };
        win.__SYMVONIA_INITIAL_CONFIG__ = updated;
    }

    return updated;
}



/**
 * Read a stored configuration value synchronously from in-memory / injected cache
 */
export function getStoredValue<K extends keyof SymvoniaConfig>(
    key: K,
    defaultValue?: SymvoniaConfig[K]
): SymvoniaConfig[K] {
    const config = getInitialConfig();
    const val = config[key];
    if (val !== undefined && val !== null) {
        return val;
    }
    return defaultValue !== undefined ? defaultValue : DEFAULT_CONFIG[key];
}

/**
 * Update a configuration value with instant memory update + persistent storage write to Rust backend
 */
export function setStoredValue<K extends keyof SymvoniaConfig>(
    key: K,
    value: SymvoniaConfig[K],
    options?: { debounceMs?: number }
): void {
    const config = getInitialConfig();
    config[key] = value;
    inMemoryConfig = config;

    if (typeof window !== 'undefined') {
        const win = window as unknown as { __SYMVONIA_INITIAL_CONFIG__?: SymvoniaConfig };
        win.__SYMVONIA_INITIAL_CONFIG__ = config;
    }

    const performSave = async () => {
        try {
            const tauri = await getTauri();
            await tauri.invoke('set_app_config_key', {
                key: String(key),
                value,
            });
        } catch (err) {
            console.error(`[Symvonia Storage] Failed to persist key "${String(key)}":`, err);
        }
    };

    const debounceMs = options?.debounceMs ?? 0;
    if (debounceMs > 0) {
        if (saveTimers[key as string]) {
            clearTimeout(saveTimers[key as string]);
        }
        saveTimers[key as string] = setTimeout(() => {
            performSave();
            delete saveTimers[key as string];
        }, debounceMs);
    } else {
        performSave();
    }
}

/**
 * Fetch detailed storage usage statistics from Rust backend
 */
export async function getStorageUsage(): Promise<StorageUsage | null> {
    if (typeof window === 'undefined') return null;
    try {
        const tauri = await getTauri();
        return await tauri.invoke<StorageUsage>('get_storage_usage');
    } catch (err) {
        console.error('[Symvonia Storage] Failed to get storage usage:', err);
        return null;
    }
}

/**
 * Open the configuration folder in Windows Explorer
 */
export async function openConfigFolder(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        const tauri = await getTauri();
        await tauri.invoke('open_config_folder');
    } catch (err) {
        console.error('[Symvonia Storage] Failed to open config folder:', err);
    }
}

/**
 * Clean library cache (track and directory index)
 */
export async function cleanLibraryCache(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const tauri = await getTauri();
        await tauri.invoke('clean_library_cache');
        return true;
    } catch (err) {
        console.error('[Symvonia Storage] Failed to clean library cache:', err);
        return false;
    }
}

/**
 * Clean and delete all downloaded AI models to free disk space
 */
export async function cleanAiModelsData(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const tauri = await getTauri();
        await tauri.invoke('clean_ai_models_data');
        return true;
    } catch (err) {
        console.error('[Symvonia Storage] Failed to clean AI models:', err);
        return false;
    }
}

/**
 * Reset all configuration settings to factory defaults
 */
export async function resetAppConfig(): Promise<SymvoniaConfig> {
    inMemoryConfig = { ...DEFAULT_CONFIG };
    if (typeof window !== 'undefined') {
        const win = window as unknown as { __SYMVONIA_INITIAL_CONFIG__?: SymvoniaConfig };
        win.__SYMVONIA_INITIAL_CONFIG__ = inMemoryConfig;
    }
    try {
        const tauri = await getTauri();
        const res = await tauri.invoke<SymvoniaConfig>('reset_app_config');
        inMemoryConfig = res;
        return res;
    } catch (err) {
        console.error('[Symvonia Storage] Failed to reset config:', err);
    }
    return DEFAULT_CONFIG;
}

/**
 * Wipe all application data (config, plugins, and AI models)
 */
export async function cleanAllAppData(): Promise<boolean> {
    inMemoryConfig = { ...DEFAULT_CONFIG };
    if (typeof window !== 'undefined') {
        const win = window as unknown as { __SYMVONIA_INITIAL_CONFIG__?: SymvoniaConfig };
        win.__SYMVONIA_INITIAL_CONFIG__ = inMemoryConfig;
    }
    try {
        const tauri = await getTauri();
        await tauri.invoke('clean_all_app_data');
        return true;
    } catch (err) {
        console.error('[Symvonia Storage] Failed to clean all app data:', err);
        return false;
    }
}
