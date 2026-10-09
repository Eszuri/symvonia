'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTauri, isBrowserTauri } from '../lib/homeState';

export interface AiPluginStatus {
    installed: boolean;
    path?: string;
    size_bytes?: number;
    sha256?: string;
}

export interface AiDownloadProgress {
    downloaded: number;
    total: number;
}

export interface AiGenerateProgress {
    percent: number;
    segmentText: string;
    timestamp: string;
}

export interface AiLyricsCurrentState {
    is_generating: boolean;
    file_path?: string;
    model_name?: string;
    last_event?: string;
}

export interface SystemSpecsInfo {
    cpuCores: number;
    cpuThreads?: number;
    ramGb: number;
    cpuName?: string;
    gpuName?: string;
}

export interface ModelDownloadProgress {
    modelName: string;
    percent: number;
    downloadedBytes?: number;
    totalBytes?: number;
}

function normalizeAiModelCode(name: string): string {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower.includes('vocal') || lower.includes('onnx') || lower.includes('htdemucs')) return 'vocal';
    if (lower.includes('turbo')) return 'large-v3-turbo';
    if (lower.includes('large-v3')) return 'large-v3';
    if (lower.includes('large')) return 'large';
    if (lower.includes('medium')) return 'medium';
    if (lower.includes('small')) return 'small';
    if (lower.includes('base')) return 'base';
    if (lower.includes('tiny')) return 'tiny';
    return lower;
}

let globalDownloadedModels: string[] = [];
let globalPluginStatus: AiPluginStatus = { installed: false };
let globalDownloadingModels: Record<string, ModelDownloadProgress> = {};
let globalSystemSpecs: SystemSpecsInfo | null = null;

export function useAiLyricsPlugin() {
    const [pluginStatus, setPluginStatus] = useState<AiPluginStatus>(globalPluginStatus);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<AiDownloadProgress | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingFilePath, setGeneratingFilePath] = useState<string | null>(null);
    const [generateProgress, setGenerateProgress] = useState<AiGenerateProgress | null>(null);
    const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
    const [downloadingModels, setDownloadingModels] = useState<Record<string, ModelDownloadProgress>>(globalDownloadingModels);
    const [downloadedModels, setDownloadedModels] = useState<string[]>(globalDownloadedModels);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const generateResolverRef = useRef<{
        resolve: (lrcContent: string) => void;
        reject: (reason: Error) => void;
    } | null>(null);

    const updateModelProgress = useCallback((mName: string, progress: ModelDownloadProgress | null) => {
        const key = normalizeAiModelCode(mName);
        if (!key) return;
        if (progress === null) {
            delete globalDownloadingModels[key];
        } else {
            globalDownloadingModels[key] = progress;
        }
        setDownloadingModels({ ...globalDownloadingModels });
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ai-lyrics-downloading-models-changed', { detail: { ...globalDownloadingModels } }));
        }
    }, []);

    useEffect(() => {
        const handleDownloadingModels = (e: Event) => {
            const custom = e as CustomEvent<Record<string, ModelDownloadProgress>>;
            if (custom.detail) {
                setDownloadingModels({ ...custom.detail });
            }
        };
        window.addEventListener('ai-lyrics-downloading-models-changed', handleDownloadingModels);
        return () => window.removeEventListener('ai-lyrics-downloading-models-changed', handleDownloadingModels);
    }, []);

    const isModelDownloading = useCallback((modelCode: string): boolean => {
        const key = normalizeAiModelCode(modelCode);
        return Boolean(downloadingModels[key]);
    }, [downloadingModels]);

    const getModelDownloadProgress = useCallback((modelCode: string): ModelDownloadProgress | null => {
        const key = normalizeAiModelCode(modelCode);
        return downloadingModels[key] || null;
    }, [downloadingModels]);

    const setPluginStatusGlobal = useCallback((newStatus: AiPluginStatus) => {
        globalPluginStatus = newStatus;
        setPluginStatus(newStatus);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ai-lyrics-status-changed', { detail: newStatus }));
        }
    }, []);

    const refreshDownloadedModels = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const models = await mod.invoke<string[]>('get_downloaded_ai_models');
            if (models) {
                globalDownloadedModels = models;
                setDownloadedModels(models);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('ai-lyrics-models-changed', { detail: models }));
                }
            }
        } catch (err) {
            console.error('Failed to get downloaded AI models:', err);
        }
    }, []);

    // Sync downloaded models across all hook instances in frontend
    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent<string[]>;
            if (customEvent.detail && Array.isArray(customEvent.detail)) {
                globalDownloadedModels = customEvent.detail;
                setDownloadedModels(customEvent.detail);
            }
        };
        window.addEventListener('ai-lyrics-models-changed', handler);
        return () => window.removeEventListener('ai-lyrics-models-changed', handler);
    }, []);

    // Re-check downloaded models whenever user focuses the app window (e.g. after adding/deleting in Explorer)
    useEffect(() => {
        const handleFocus = () => {
            refreshDownloadedModels();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refreshDownloadedModels]);

    // Periodic safety check every 3s to keep all views in sync
    useEffect(() => {
        const interval = setInterval(() => {
            refreshDownloadedModels();
        }, 3000);
        return () => clearInterval(interval);
    }, [refreshDownloadedModels]);

    // Refresh plugin status
    const refreshStatus = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const status = await mod.invoke<AiPluginStatus>('get_ai_lyrics_plugin_status');
            setPluginStatusGlobal(status);
        } catch (err) {
            console.error('Failed to get AI lyrics plugin status:', err);
        }
    }, [setPluginStatusGlobal]);

    useEffect(() => {
        const handler = (e: Event) => {
            const customEvent = e as CustomEvent<AiPluginStatus>;
            if (customEvent.detail) {
                setPluginStatus(customEvent.detail);
            }
        };
        window.addEventListener('ai-lyrics-status-changed', handler);
        return () => window.removeEventListener('ai-lyrics-status-changed', handler);
    }, []);

    // Sync active AI generation state across page reloads
    const syncCurrentState = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const state = await mod.invoke<AiLyricsCurrentState>('get_ai_lyrics_current_state');
            if (state?.is_generating) {
                setIsGenerating(true);
                if (state.file_path) {
                    setGeneratingFilePath(state.file_path);
                }
                if (state.last_event) {
                    try {
                        const parsed = typeof state.last_event === 'string' ? JSON.parse(state.last_event) : state.last_event;
                        if (parsed.event === 'progress' || parsed.event === 'vocal_extraction_progress') {
                            if (parsed.event === 'progress') {
                                setGenerateProgress({
                                    percent: parsed.percent ?? 0,
                                    segmentText: parsed.segmentText ?? '',
                                    timestamp: parsed.timestamp ?? '',
                                });
                            } else {
                                setGenerateProgress({
                                    percent: parsed.percent ?? 0,
                                    segmentText: `Memisahkan Vokal AI (${parsed.percent}%)...`,
                                    timestamp: '',
                                });
                            }
                        } else if (parsed.event === 'model_download_progress' || parsed.event === 'vocal_model_download_progress') {
                            if ((parsed.percent ?? 0) < 100) {
                                const mName = parsed.modelName ?? (parsed.event === 'vocal_model_download_progress' ? 'vocal' : '');
                                const prog: ModelDownloadProgress = {
                                    modelName: mName,
                                    percent: parsed.percent ?? 0,
                                    downloadedBytes: parsed.downloadedBytes ?? parsed.downloaded,
                                    totalBytes: parsed.totalBytes ?? parsed.total,
                                };
                                updateModelProgress(mName, prog);
                                setModelDownloadProgress(prog);
                            }
                        }
                    } catch {
                        // ignore parse error
                    }
                }
            } else {
                setIsGenerating(false);
                setGeneratingFilePath(null);
                setGenerateProgress(null);
                if (Object.keys(globalDownloadingModels).length === 0) {
                    setModelDownloadProgress(null);
                }
            }
        } catch (err) {
            console.error('Failed to sync AI lyrics state:', err);
        }
    }, [updateModelProgress]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refreshStatus();
            void syncCurrentState();
            void refreshDownloadedModels();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refreshStatus, syncCurrentState, refreshDownloadedModels]);

    // Safety polling sync while active
    useEffect(() => {
        if (!isGenerating && !modelDownloadProgress) return;
        const interval = setInterval(() => {
            syncCurrentState();
        }, 1000);
        return () => clearInterval(interval);
    }, [isGenerating, modelDownloadProgress, syncCurrentState]);

    // Listen to backend events (ai-lyrics-event, ai-lyrics-download-progress, ai-lyrics-models-changed)
    useEffect(() => {
        if (!isBrowserTauri()) return;

        let cancelled = false;
        let unlistenEvent: (() => void) | null = null;
        let unlistenDownload: (() => void) | null = null;
        let unlistenModels: (() => void) | null = null;

        import('@tauri-apps/api/event').then(({ listen }) => {
            if (cancelled) return;

            listen<string>('ai-lyrics-event', (event) => {
                if (cancelled) return;
                try {
                    const parsed = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
                    if (!parsed || typeof parsed !== 'object') return;

                    switch (parsed.event) {
                        case 'progress':
                            setIsGenerating(true);
                            setGenerateProgress({
                                percent: parsed.percent ?? 0,
                                segmentText: parsed.segmentText ?? '',
                                timestamp: parsed.timestamp ?? '',
                            });
                            break;
                        case 'vocal_extraction_progress':
                            setIsGenerating(true);
                            setGenerateProgress({
                                percent: parsed.percent ?? 0,
                                segmentText: `Memisahkan Vokal AI (${parsed.percent}%)...`,
                                timestamp: '',
                            });
                            break;
                        case 'vocal_model_download_start':
                            updateModelProgress('vocal', {
                                modelName: 'vocal',
                                percent: 0,
                            });
                            setModelDownloadProgress({
                                modelName: 'vocal',
                                percent: 0,
                            });
                            break;
                        case 'vocal_model_download_progress':
                            if ((parsed.percent ?? 0) >= 100) {
                                updateModelProgress('vocal', null);
                                setModelDownloadProgress(null);
                                refreshDownloadedModels();
                            } else {
                                const prog: ModelDownloadProgress = {
                                    modelName: 'vocal',
                                    percent: parsed.percent ?? 0,
                                    downloadedBytes: parsed.downloadedBytes ?? parsed.downloaded,
                                    totalBytes: parsed.totalBytes ?? parsed.total,
                                };
                                updateModelProgress('vocal', prog);
                                setModelDownloadProgress(prog);
                            }
                            break;
                        case 'vocal_model_download_complete':
                            updateModelProgress('vocal', null);
                            setModelDownloadProgress(null);
                            refreshDownloadedModels();
                            break;
                        case 'model_download_progress': {
                            const mName = parsed.modelName ?? '';
                            if ((parsed.percent ?? 0) >= 100) {
                                updateModelProgress(mName, null);
                                setModelDownloadProgress(null);
                                refreshDownloadedModels();
                            } else {
                                const prog: ModelDownloadProgress = {
                                    modelName: mName,
                                    percent: parsed.percent ?? 0,
                                    downloadedBytes: parsed.downloadedBytes ?? parsed.downloaded,
                                    totalBytes: parsed.totalBytes ?? parsed.total,
                                };
                                updateModelProgress(mName, prog);
                                setModelDownloadProgress(prog);
                            }
                            break;
                        }
                        case 'model_download_complete':
                        case 'model_ready':
                            updateModelProgress(parsed.modelName ?? '', null);
                            setModelDownloadProgress(null);
                            refreshDownloadedModels();
                            break;
                        case 'transcription_result':
                            setIsGenerating(false);
                            setGeneratingFilePath(null);
                            setGenerateProgress(null);
                            setModelDownloadProgress(null);
                            refreshDownloadedModels();
                            if (generateResolverRef.current) {
                                generateResolverRef.current.resolve(parsed.lrcContent ?? '');
                                generateResolverRef.current = null;
                            }

                            if (parsed.lrcContent && isBrowserTauri()) {
                                getTauri().then(async (mod) => {
                                    try {
                                        const state = await mod.invoke<AiLyricsCurrentState>('get_ai_lyrics_current_state');
                                        const targetPath = state?.file_path;
                                        if (targetPath) {
                                            await mod.invoke('save_lrc_file', { filePath: targetPath, lrcContent: parsed.lrcContent });
                                            if (typeof window !== 'undefined') {
                                                window.dispatchEvent(new CustomEvent('ai-lyrics-completed', {
                                                    detail: { filePath: targetPath, lrcContent: parsed.lrcContent }
                                                }));
                                            }
                                        }
                                    } catch (saveErr) {
                                        console.error('Auto save LRC on completion error:', saveErr);
                                    }
                                });
                            }
                            break;
                        case 'transcribe_cancelled':
                            setIsGenerating(false);
                            setGeneratingFilePath(null);
                            setGenerateProgress(null);
                            break;
                        case 'error':
                            setIsGenerating(false);
                            setGeneratingFilePath(null);
                            setGenerateProgress(null);
                            setModelDownloadProgress(null);
                            if (parsed.modelName) {
                                updateModelProgress(parsed.modelName, null);
                            }
                            setErrorMsg(parsed.message ?? 'Unknown AI Lyrics Error');
                            if (generateResolverRef.current) {
                                generateResolverRef.current.reject(new Error(parsed.message ?? 'Transcription failed'));
                                generateResolverRef.current = null;
                            }
                            break;
                        case 'model_download_cancelled':
                            if (parsed.modelName) {
                                updateModelProgress(parsed.modelName, null);
                            } else {
                                globalDownloadingModels = {};
                                setDownloadingModels({});
                                if (typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('ai-lyrics-downloading-models-changed', { detail: {} }));
                                }
                            }
                            setModelDownloadProgress(null);
                            refreshDownloadedModels();
                            break;
                        case 'vocal_extraction_cancelled':
                            setIsGenerating(false);
                            setGenerateProgress(null);
                            setModelDownloadProgress(null);
                            updateModelProgress('vocal', null);
                            refreshDownloadedModels();
                            if (generateResolverRef.current) {
                                generateResolverRef.current.reject(new Error('Operation cancelled'));
                                generateResolverRef.current = null;
                            }
                            break;
                        case 'transcribe_cancelled':
                        case 'cancelled':
                            setIsGenerating(false);
                            setGenerateProgress(null);
                            setModelDownloadProgress(null);
                            globalDownloadingModels = {};
                            setDownloadingModels({});
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('ai-lyrics-downloading-models-changed', { detail: {} }));
                            }
                            refreshDownloadedModels();
                            if (generateResolverRef.current) {
                                generateResolverRef.current.reject(new Error('Operation cancelled'));
                                generateResolverRef.current = null;
                            }
                            break;
                    }
                } catch {
                    // JSON parse ignore
                }
            }).then((fn) => {
                if (cancelled) fn();
                else unlistenEvent = fn;
            });

            listen<AiDownloadProgress>('ai-lyrics-download-progress', (event) => {
                if (cancelled) return;
                setDownloadProgress(event.payload);
            }).then((fn) => {
                if (cancelled) fn();
                else unlistenDownload = fn;
            });

            listen<void>('ai-lyrics-models-changed', () => {
                if (cancelled) return;
                refreshDownloadedModels();
            }).then((fn) => {
                if (cancelled) fn();
                else unlistenModels = fn;
            });
        });

        return () => {
            cancelled = true;
            if (unlistenEvent) unlistenEvent();
            if (unlistenDownload) unlistenDownload();
            if (unlistenModels) unlistenModels();
        };
    }, [refreshDownloadedModels, updateModelProgress]);


    const downloadPlugin = useCallback(async (url?: string) => {
        if (!isBrowserTauri()) return;
        setIsDownloading(true);
        setDownloadProgress(null);
        setErrorMsg(null);
        try {
            const mod = await getTauri();
            const status = await mod.invoke<AiPluginStatus>('download_ai_lyrics_plugin', { url });
            setPluginStatusGlobal(status);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        } finally {
            setIsDownloading(false);
            setDownloadProgress(null);
        }
    }, [setPluginStatusGlobal]);

    const cancelDownloadPlugin = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('cancel_ai_lyrics_plugin_download');
            setIsDownloading(false);
            setDownloadProgress(null);
        } catch (err) {
            console.error('Failed to cancel plugin download:', err);
        }
    }, []);

    const installFromFile = useCallback(async (customPath?: string) => {
        if (!isBrowserTauri()) return;
        setErrorMsg(null);
        try {
            const mod = await getTauri();
            let path = customPath;
            if (!path) {
                path = (await mod.invoke<string | null>('pick_single_file', {
                    title: 'Pilih Symvonia AI Lyrics Engine (.exe)',
                    filters: [{ name: 'Executable', extensions: ['exe'] }],
                })) || undefined;
            }
            if (path) {
                const status = await mod.invoke<AiPluginStatus>('install_ai_lyrics_plugin_from_file', { path });
                if (status) {
                    setPluginStatusGlobal(status);
                }
                await refreshStatus();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, [refreshStatus, setPluginStatusGlobal]);

    const uninstallPlugin = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('uninstall_ai_lyrics_plugin');
            await refreshStatus();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
        }
    }, [refreshStatus]);

    const generateLyrics = useCallback(
        async (
            filePath: string,
            modelName: string = 'base',
            language: string = 'auto',
            isolateVocals: boolean = false
        ): Promise<string> => {
            if (!isBrowserTauri()) {
                throw new Error('AI lyrics generation only available in Tauri desktop environment');
            }

            setIsGenerating(true);
            setGeneratingFilePath(filePath);
            setGenerateProgress({
                percent: 0,
                segmentText: 'Inisialisasi...',
                timestamp: '',
            });
            setErrorMsg(null);

            const resultPromise = new Promise<string>((resolve, reject) => {
                generateResolverRef.current = { resolve, reject };
            });

            try {
                const mod = await getTauri();
                await mod.invoke('generate_ai_lyrics', {
                    filePath,
                    modelName,
                    isolateVocals,
                    language,
                });
            } catch (err: unknown) {
                setIsGenerating(false);
                setGeneratingFilePath(null);
                setGenerateProgress(null);
                generateResolverRef.current = null;
                const msg = err instanceof Error ? err.message : String(err);
                setErrorMsg(msg);
                throw err;
            }

            return resultPromise;
        },
        []
    );

    const extractVocal = useCallback(
        async (filePath: string, outputPath?: string): Promise<void> => {
            if (!isBrowserTauri()) return;
            setIsGenerating(true);
            setGeneratingFilePath(filePath);
            setGenerateProgress({
                percent: 0,
                segmentText: 'Inisialisasi Pemisahan Vokal...',
                timestamp: '',
            });
            setErrorMsg(null);

            try {
                const mod = await getTauri();
                await mod.invoke('extract_vocal_ai', {
                    filePath,
                    outputPath,
                });
            } catch (err: unknown) {
                setIsGenerating(false);
                setGeneratingFilePath(null);
                setGenerateProgress(null);
                const msg = err instanceof Error ? err.message : String(err);
                setErrorMsg(msg);
                throw err;
            }
        },
        []
    );

    const cancelGeneration = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            globalDownloadingModels = {};
            setDownloadingModels({});
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ai-lyrics-downloading-models-changed', { detail: {} }));
            }
            setIsGenerating(false);
            setGeneratingFilePath(null);
            setGenerateProgress(null);
            setModelDownloadProgress(null);
            if (generateResolverRef.current) {
                generateResolverRef.current.resolve('');
                generateResolverRef.current = null;
            }
            const mod = await getTauri();
            await mod.invoke('cancel_ai_lyrics');
        } catch (err) {
            console.error('Failed to cancel AI lyrics generation:', err);
        }
    }, []);

    const cancelModelDownload = useCallback(async (modelCode?: string) => {
        if (!isBrowserTauri()) return;
        try {
            if (modelCode) {
                updateModelProgress(modelCode, null);
                const mod = await getTauri();
                await mod.invoke('cancel_ai_model_download', { modelName: modelCode });
            } else {
                globalDownloadingModels = {};
                setDownloadingModels({});
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('ai-lyrics-downloading-models-changed', { detail: {} }));
                }
                setIsGenerating(false);
                setGenerateProgress(null);
                setModelDownloadProgress(null);
                const mod = await getTauri();
                await mod.invoke('cancel_ai_lyrics');
            }
        } catch (err) {
            console.error('Failed to cancel model download:', err);
        }
    }, [updateModelProgress]);

    const [systemSpecs, setSystemSpecs] = useState<SystemSpecsInfo | null>(globalSystemSpecs);

    const refreshSystemSpecs = useCallback(async () => {
        if (!isBrowserTauri()) return;
        if (globalSystemSpecs) {
            setSystemSpecs(globalSystemSpecs);
            return;
        }
        try {
            const mod = await getTauri();
            const specs = await mod.invoke<SystemSpecsInfo>('get_system_specs');
            if (specs) {
                globalSystemSpecs = specs;
                setSystemSpecs(specs);
            }
        } catch (err) {
            console.error('Failed to get system specs:', err);
        }
    }, []);

    useEffect(() => {
        if (!globalSystemSpecs) {
            const timer = window.setTimeout(() => {
                void refreshSystemSpecs();
            }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [refreshSystemSpecs]);

    const downloadModel = useCallback(async (modelName: string) => {
        if (!isBrowserTauri()) return;
        updateModelProgress(modelName, { modelName, percent: 0 });
        try {
            const mod = await getTauri();
            await mod.invoke('download_ai_model', { modelName });
        } catch (err: unknown) {
            updateModelProgress(modelName, null);
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
        }
    }, [updateModelProgress]);

    const deleteModel = useCallback(async (modelName: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('delete_ai_model', { modelName });
            await refreshDownloadedModels();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
        }
    }, [refreshDownloadedModels]);

    const openModelsFolder = useCallback(async () => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            await mod.invoke('open_ai_models_folder');
        } catch (err) {
            console.error('Failed to open models folder:', err);
        }
    }, []);

    const importModelFromFile = useCallback(async (modelCode: string) => {
        if (!isBrowserTauri()) return;
        try {
            const mod = await getTauri();
            const path = await mod.invoke<string | null>('pick_single_file', {
                title: `Pilih Berkas Model (${modelCode}) - (.bin / .onnx)`,
                filters: [{ name: 'Model Files (*.bin, *.onnx)', extensions: ['bin', 'onnx'] }],
            });
            if (path) {
                await mod.invoke('import_ai_model_file', { srcPath: path, path, modelCode });
                await refreshDownloadedModels();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(msg);
            throw err;
        }
    }, [refreshDownloadedModels]);

    const openExternalUrl = useCallback(async (url: string) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

        if (isBrowserTauri()) {
            try {
                const mod = await getTauri();
                await mod.invoke('open_external_url', { url });
                return;
            } catch (err) {
                console.error('Failed to open external url in Tauri:', err);
            }
        }
        if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, []);

    return {
        pluginStatus,
        isDownloading,
        downloadProgress,
        isGenerating,
        generatingFilePath,
        generateProgress,
        modelDownloadProgress,
        downloadingModels,
        isModelDownloading,
        getModelDownloadProgress,
        cancelModelDownload,
        downloadedModels,
        refreshDownloadedModels,
        systemSpecs,
        downloadModel,
        deleteModel,
        openModelsFolder,
        importModelFromFile,
        openExternalUrl,
        errorMsg,
        refreshStatus,
        downloadPlugin,
        cancelDownloadPlugin,
        installFromFile,
        uninstallPlugin,
        generateLyrics,
        extractVocal,
        cancelGeneration,
        syncCurrentState,
    };
}


