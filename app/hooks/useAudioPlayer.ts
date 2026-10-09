import {useCallback, useEffect, useRef, useState} from "react";
import type {FileEntry} from "../components/FolderExplorer";
import type {SongMetadata} from "../components/PlayerPanel";
import {
    fetchSessionState,
    getTauri,
    isBrowserTauri,
    loadSessionState,
    saveSessionState,
    type SessionState,
} from "../lib/homeState";
import {t, type Lang} from "../lib/translations";
import {useGainBoost} from "./useGainBoost";
import {useEqualizer} from "./useEqualizer";
import {useBitPerfectEngine, type EngineErrorEvent, type NativeOutputMode} from "./useBitPerfectEngine";
import type {OutputMode} from "../lib/storage";
import {useVolumeFade} from "./audio/useVolumeFade";
import {useAudioSrc} from "./audio/useAudioSrc";
import type {PlaybackRuntimeInfo} from "./audio/playbackTypes";
import {listenTauri, type LibraryCacheInvalidatedEvent} from "../lib/tauri";
import {isWallpaperEngineActive} from "./useWallpaperPlugin";

interface UseAudioPlayerOptions {
    lang: Lang;
    musicFolder: string | null;
    autoWallpaper: boolean;
    folderSort: string;
    fileSort: string;
    sortDir: string;
    nameSource: string;
    formats: string[];
    shuffle: boolean;
    repeat: "off" | "all" | "one";
    volumeMode: "app" | "system";
    appVolume: number;
    systemVolume: number;
    setAppVolume: (v: number) => void;
    setSystemVolume: (v: number) => void;
    volumeLimit: number;
    showError: (msg: string) => void;
    addLog: (level: string, message: string) => void;
    setSystemMuted: React.Dispatch<React.SetStateAction<boolean>>;
    lastLocalVolumeSetRef: React.RefObject<number>;
    pauseIfMuted: boolean;
    systemMuted: boolean;
    fadeAudio?: boolean;
    fadeDuration?: number;
    outputMode?: OutputMode;
    setOutputMode?: (v: OutputMode) => void;
    outputDevice?: string | null;
    setOutputDevice?: (v: string | null) => void;
    autoFallbackHtmlAudio?: boolean;
    onAutoFallback?: () => void;
    nativeEngineInstalled?: boolean | null;
}

const MIN_RESUME_VOLUME = 0.01;
const normalizePath = (p?: string | null): string =>
    p ? p.replace(/\\/g, '/').toLowerCase() : '';

export function useAudioPlayer(options: UseAudioPlayerOptions) {
    const {
        lang,
        musicFolder,
        autoWallpaper,
        folderSort,
        fileSort,
        sortDir,
        nameSource,
        formats,
        shuffle,
        repeat,
        volumeMode,
        appVolume,
        systemVolume,
        setAppVolume,
        setSystemVolume,
        volumeLimit,
        showError,
        addLog,
        setSystemMuted,
        lastLocalVolumeSetRef,
        pauseIfMuted,
        systemMuted,
        fadeAudio = true,
        fadeDuration = 500,
        outputMode = "html_audio",
        setOutputMode,
        outputDevice = null,
        setOutputDevice,
        autoFallbackHtmlAudio = false,
        onAutoFallback,
        nativeEngineInstalled = null,
    } = options;

    const outputModeRef = useRef<OutputMode>(outputMode);
    const autoFallbackRef = useRef<boolean>(autoFallbackHtmlAudio);
    useEffect(() => {
        autoFallbackRef.current = autoFallbackHtmlAudio;
    }, [autoFallbackHtmlAudio]);

    const onAutoFallbackRef = useRef(onAutoFallback);
    useEffect(() => {
        onAutoFallbackRef.current = onAutoFallback;
    }, [onAutoFallback]);

    const setOutputModeCallbackRef = useRef(setOutputMode);
    useEffect(() => {
        setOutputModeCallbackRef.current = setOutputMode;
    }, [setOutputMode]);

    const setOutputDeviceCallbackRef = useRef(setOutputDevice);
    useEffect(() => {
        setOutputDeviceCallbackRef.current = setOutputDevice;
    }, [setOutputDevice]);

    const [files, setFiles] = useState<FileEntry[]>([]);
    const [filesLoadedOnce, setFilesLoadedOnce] = useState(false);
    const [sessionRestored, setSessionRestored] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [currentPath, setCurrentPath] = useState<string | null>(() => options.musicFolder || null);
    const [selectedSong, setSelectedSong] = useState<FileEntry | null>(null);
    const [metadata, setMetadata] = useState<SongMetadata | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTimeState] = useState(0);
    const currentTimeRef = useRef(0);
    const setCurrentTime = useCallback((t: number) => {
        currentTimeRef.current = t;
        setCurrentTimeState(t);
    }, []);
    const [duration, setDuration] = useState(0);
    const [runtimeError, setRuntimeError] = useState<EngineErrorEvent | null>(null);
    const [runtimeStatus, setRuntimeStatus] = useState<'idle' | 'loading' | 'starting' | 'playing' | 'paused' | 'stopping' | 'fallback' | 'error' | 'unavailable'>('idle');
    const [effectiveOutputMode, setEffectiveOutputMode] = useState<OutputMode | null>(outputMode === 'html_audio' ? 'html_audio' : null);
    const [nativeSuppressed, setNativeSuppressed] = useState(false);
    const coverDataUrl = metadata?.cover_b64
        ? `data:${metadata.cover_mime || 'image/jpeg'};base64,${metadata.cover_b64}`
        : null;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const filesRef = useRef<FileEntry[]>([]);
    const selectedSongRef = useRef<FileEntry | null>(null);
    const metadataRef = useRef<SongMetadata | null>(null);
    const playlistRef = useRef<FileEntry[]>([]);
    const volumeModeRef = useRef<"app" | "system">("app");
    const volumeLimitRef = useRef<number>(0);
    const autoWallpaperRef = useRef<boolean>(autoWallpaper);
    const folderSortRef = useRef<string>("name");
    const fileSortRef = useRef<string>("name");
    const sortDirRef = useRef<string>("asc");
    const nameSourceRef = useRef<string>("filename");
    const formatsRef = useRef<string[]>(formats);
    const shuffleRef = useRef(false);
    const repeatRef = useRef<"off" | "all" | "one">("off");
    const isMountedRef = useRef(true);
    const playbackGenerationRef = useRef(0);
    const metadataRequestRef = useRef(0);
    const loadFilesTokenRef = useRef(0);
    const libraryRootPromiseRef = useRef<Promise<void> | null>(null);
    const autoPausedBySilenceRef = useRef(false);
    const lastSessionSaveRef = useRef(0);
    const restoredPendingPlayRef = useRef(false);
    const sessionRestoreAttemptedRef = useRef(false);
    const playlistFolderRef = useRef<string | null>(null);
    const skipPlaylistRebuildRef = useRef(false);
    const outputDeviceRef = useRef<string | null>(outputDevice);
    const nativeEngineActiveRef = useRef(false);
    const nativeEngineModeRef = useRef<NativeOutputMode | null>(null);
    const activeNativeRequestRef = useRef<string | null>(null);
    const nativePlayingRef = useRef(false);
    const nativeStateRef = useRef<"idle" | "playing" | "paused" | "stopped">("idle");
    const nativeSuppressedRef = useRef(false);
    const nativeRecoveryPromiseRef = useRef<Promise<void> | null>(null);
    const bpSendCommandRef = useRef<(cmd: Record<string, unknown>) => Promise<void>>(async () => {});
    const enginePlayRef = useRef<(file: FileEntry, seekPosition?: number, generation?: number) => Promise<void>>(async () => {});

    const { fadeVolumeTo, cancelFade, fadeAudioRef, fadeDurationRef } = useVolumeFade(audioRef, fadeAudio, fadeDuration);
    const { getAudioSrc } = useAudioSrc();
    const equalizer = useEqualizer();
    const {
        gain: gainBoostValue,
        setGain: setGainBoost,
        supported: gainBoostSupported,
        minGain: minGainBoost,
        maxGain: maxGainBoost,
        prepareAudio,
    } = useGainBoost(audioRef, equalizer);

    const currentPathRef = useRef<string | null>(currentPath);
    useEffect(() => {
        currentPathRef.current = currentPath;
        outputModeRef.current = outputMode;
    }, [currentPath, outputMode]);

    const makeTempFileEntry = (filePath: string): FileEntry => {
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





    useEffect(() => {
        filesRef.current = files;
        selectedSongRef.current = selectedSong;
        metadataRef.current = metadata;
        autoWallpaperRef.current = autoWallpaper;
        formatsRef.current = formats;
        volumeModeRef.current = volumeMode;
        volumeLimitRef.current = volumeLimit;
        folderSortRef.current = folderSort;
        fileSortRef.current = fileSort;
        sortDirRef.current = sortDir;
        nameSourceRef.current = nameSource;
        shuffleRef.current = shuffle;
        repeatRef.current = repeat;
        outputDeviceRef.current = outputDevice;
    }, [files, selectedSong, metadata, autoWallpaper, formats, volumeMode, volumeLimit, folderSort, fileSort, sortDir, nameSource, shuffle, repeat, outputDevice]);

    const prevOutputDeviceRef = useRef<string | null>(outputDevice);
    useEffect(() => {
        const prev = prevOutputDeviceRef.current;
        outputDeviceRef.current = outputDevice;
        prevOutputDeviceRef.current = outputDevice;

        if (prev !== outputDevice) {
            const currentSong = selectedSongRef.current;
            if (currentSong && nativeEngineActiveRef.current && (isPlaying || runtimeStatus === 'playing' || runtimeStatus === 'paused')) {
                const curPos = Math.max(0, currentTimeRef.current);
                const wasPlaying = isPlaying || nativePlayingRef.current;
                const gen = ++playbackGenerationRef.current;

                enginePlayRef.current(currentSong, curPos, gen).then(() => {
                    if (!wasPlaying) {
                        bpSendCommandRef.current({ command: "pause" }).catch(() => {});
                    }
                }).catch((err) => {
                    console.error("[Symvonia] Failed to switch output device on the fly:", err);
                });
            } else if (audioRef.current && 'setSinkId' in audioRef.current) {
                const el = audioRef.current as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
                if (typeof el.setSinkId === 'function') {
                    el.setSinkId(outputDevice || "").catch(() => {});
                }
            }
        }
    }, [outputDevice, isPlaying, runtimeStatus]);

    const activeVolume = volumeMode === "system" ? systemVolume : appVolume;

    const isVolumeSilent = useCallback(() => {
        return volumeMode === "app"
            ? appVolume <= 0
            : systemMuted || systemVolume <= 0;
    }, [appVolume, systemMuted, systemVolume, volumeMode]);

    const setMinimumResumeVolume = useCallback(async () => {
        if (volumeMode === "app") {
            setAppVolume(MIN_RESUME_VOLUME);
            if (audioRef.current) audioRef.current.volume = MIN_RESUME_VOLUME;
            return MIN_RESUME_VOLUME;
        }

        const targetPct = 1;
        const targetVolume = targetPct / 100;
        setSystemVolume(targetVolume);
        setSystemMuted(false);
        lastLocalVolumeSetRef.current = Date.now();

        if (!isBrowserTauri()) return targetVolume;

        try {
            const mod = await getTauri();
            await mod.invoke("set_system_volume", {value: targetPct});
            await mod.invoke("set_system_mute", {mute: false});
        } catch {
            // Keep local playback responsive even if the OS volume call fails.
        }
        return targetVolume;
    }, [
        lastLocalVolumeSetRef,
        setAppVolume,
        setSystemMuted,
        setSystemVolume,
        volumeMode,
    ]);

    /** Apply wallpaper from current metadata*/
    const applyWallpaper = useCallback(
        async (meta: SongMetadata, token?: number) => {
            const isEngineActive = isWallpaperEngineActive();
            const shouldApplyToSystem = autoWallpaperRef.current;
            if (!isBrowserTauri() || (!shouldApplyToSystem && !isEngineActive)) return;
            try {
                const mod = await getTauri();
                if (token !== undefined && token !== metadataRequestRef.current) return;
                if (meta.cover_b64) {
                    await mod.invoke("set_wallpaper", {
                        coverB64: meta.cover_b64,
                        applyToSystem: shouldApplyToSystem,
                    });
                } else {
                    await mod.invoke("clear_wallpaper", {
                        applyToSystem: shouldApplyToSystem,
                    });
                }
            } catch (e) {
                showError(t(lang, 'log.wallpaperError', {msg: String(e)}));
            }
        },
        [showError, lang],
    );

    // ─── file listing ──────────────────────────────────────────────────────────

    const listFiles = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
        await libraryRootPromiseRef.current;
        const mod = await getTauri();
        return mod.invoke<FileEntry[]>("list_files", {
            path: dirPath,
            folderSort: folderSortRef.current || "name",
            fileSort: fileSortRef.current || "name",
            sortDir: sortDirRef.current || "asc",
            nameSource: nameSourceRef.current || "filename",
            formats: formatsRef.current && formatsRef.current.length > 0
                ? formatsRef.current
                : ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'wma'],
        });
    }, []);

    const loadFiles = useCallback(
        async (dirPath: string) => {
            const token = ++loadFilesTokenRef.current;
            setLoadingFiles(true);
            try {
                const result = await listFiles(dirPath);
                if (token !== loadFilesTokenRef.current) return;
                setFiles(result || []);
                setSelectedSong((prev) => {
                    if (!prev) return null;
                    const updated = (result || []).find((f) => f.path === prev.path);
                    return updated || prev;
                });
            } catch (e) {
                if (token !== loadFilesTokenRef.current) return;
                console.error("[Symvonia] Failed to list files in:", dirPath, e);
                showError(String(e));
                setFiles([]);
            } finally {
                if (token === loadFilesTokenRef.current) {
                    setLoadingFiles(false);
                    setFilesLoadedOnce(true);
                }
            }
        },
        [listFiles, showError],
    );

    const refreshFiles = useCallback(() => {
        if (!currentPath) return;
        if (isBrowserTauri()) {
            getTauri()
                .then((mod) => mod.invoke("invalidate_library_directory", {path: currentPath}))
                .catch(() => {})
                .finally(() => loadFiles(currentPath));
            return;
        }
        loadFiles(currentPath);
    }, [currentPath, loadFiles]);

    // ─── metadata ──────────────────────────────────────────────────────────────

    const loadMetadata = useCallback(
        async (filePath: string, skipWallpaper = false) => {
            const token = ++metadataRequestRef.current;
            try {
                const mod = await getTauri();
                const result = await mod.invoke<SongMetadata>("get_metadata", {
                    filePath,
                });
                if (token !== metadataRequestRef.current || !isMountedRef.current) return;
                setMetadata(result);
                if (result.duration) setDuration(result.duration);
                // Fire-and-forget — wallpaper update must never block metadata state update
                if (!skipWallpaper) applyWallpaper(result, token).catch(() => {});
            } catch {
                if (token !== metadataRequestRef.current || !isMountedRef.current) return;
                setMetadata(null);
            }
        },
        [applyWallpaper],
    );

    // ─── Reactive wallpaper synchronization on autoWallpaper toggle ─────────────
    const prevAutoWallpaperRef = useRef<boolean>(autoWallpaper);
    useEffect(() => {
        const prev = prevAutoWallpaperRef.current;
        prevAutoWallpaperRef.current = autoWallpaper;
        autoWallpaperRef.current = autoWallpaper;

        if (prev !== autoWallpaper) {
            if (!isBrowserTauri()) return;
            if (autoWallpaper) {
                // When toggled ON: immediately set wallpaper from current metadata if present,
                // or load metadata for currently selected song.
                if (metadataRef.current) {
                    applyWallpaper(metadataRef.current).catch(() => {});
                } else if (selectedSongRef.current) {
                    loadMetadata(selectedSongRef.current.path, false).catch(() => {});
                }
            }
            // When toggled OFF: do nothing, leave current wallpaper as is
        }
    }, [autoWallpaper, applyWallpaper, loadMetadata]);

    const syncSongPlaylist = useCallback(async (filePath: string) => {
        const songParent = filePath.replace(/[/\\][^/\\]+$/, "");
        try {
            let fileList = filesRef.current;
            if (currentPathRef.current !== songParent || fileList.length === 0) {
                if (isBrowserTauri()) {
                    fileList = await listFiles(songParent);
                    if (isMountedRef.current) {
                        setFiles(fileList);
                        setCurrentPath(songParent);
                    }
                }
            }
            const songFile = fileList.find((f) => !f.is_dir && f.path === filePath);
            const targetSong = songFile || makeTempFileEntry(filePath);
            if (isMountedRef.current) {
                setSelectedSong(targetSong);
                loadMetadata(filePath, true);
            }
            playlistRef.current = fileList.filter((f) => !f.is_dir);
            playlistFolderRef.current = songParent;
        } catch {
            const tempFile = makeTempFileEntry(filePath);
            if (isMountedRef.current) {
                setSelectedSong(tempFile);
                loadMetadata(filePath, true);
            }
        }
    }, [listFiles, loadMetadata]);

    // ─── path / folder effects ─────────────────────────────────────────────────

    useEffect(() => {
        if (!isBrowserTauri()) {
            libraryRootPromiseRef.current = null;
            return;
        }
        const previous = libraryRootPromiseRef.current ?? Promise.resolve();
        const promise = previous
            .catch(() => {})
            .then(() => getTauri())
            .then((mod) => mod.invoke("set_library_root", {path: musicFolder}))
            .then(() => undefined);
        libraryRootPromiseRef.current = promise;
        promise.catch((error) => console.error("[Symvonia] Failed to set library root:", error));
    }, [musicFolder]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (musicFolder) {
                setCurrentPath((prev) => {
                    const normalizedPrev = prev ? normalizePath(prev) : "";
                    const normalizedRoot = normalizePath(musicFolder);
                    if (!normalizedPrev || (normalizedPrev !== normalizedRoot && !normalizedPrev.startsWith(`${normalizedRoot}/`))) {
                        return musicFolder;
                    }
                    return prev;
                });
            } else {
                setCurrentPath(null);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [musicFolder]);

    useEffect(() => {
        if (!isBrowserTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | null = null;
        void listenTauri<LibraryCacheInvalidatedEvent>("library-cache-invalidated", (event) => {
            if (disposed || !musicFolder) return;
            if (normalizePath(event.root_path) !== normalizePath(musicFolder)) return;
            const affected = event.affected_paths.map(normalizePath);
            const current = currentPathRef.current ? normalizePath(currentPathRef.current) : "";
            const playlistFolder = playlistFolderRef.current ? normalizePath(playlistFolderRef.current) : "";
            const isAffected = (path: string) => affected.includes(path);
            const currentAffected = Boolean(current) && isAffected(current);
            const playlistAffected = Boolean(playlistFolder) && isAffected(playlistFolder);
            if (currentAffected) void loadFiles(currentPathRef.current!);
            if (playlistAffected && playlistFolderRef.current) {
                void listFiles(playlistFolderRef.current).then((result) => {
                    if (!isMountedRef.current) return;
                    playlistRef.current = result.filter((file) => !file.is_dir);
                    const selected = selectedSongRef.current;
                    if (selected && !playlistRef.current.some((file) => file.path === selected.path)) {
                        selectedSongRef.current = null;
                        setSelectedSong(null);
                        setMetadata(null);
                    }
                }).catch(() => {});
            }
        }).then((cleanup) => {
            if (disposed) cleanup();
            else unlisten = cleanup;
        }).catch(() => {});
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [listFiles, loadFiles, musicFolder]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (currentPath) {
                void loadFiles(currentPath);
            } else {
                setFiles([]);
                setFilesLoadedOnce(true);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [currentPath, loadFiles]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (currentPath) void loadFiles(currentPath);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [currentPath, folderSort, fileSort, sortDir, nameSource, formats, loadFiles]);

    useEffect(() => {
        skipPlaylistRebuildRef.current = true;
    }, [folderSort, nameSource]);

    useEffect(() => {
        if (skipPlaylistRebuildRef.current) {
            skipPlaylistRebuildRef.current = false;
            return;
        }
        if (!playlistFolderRef.current) return;
        if (currentPath !== playlistFolderRef.current) return;
        const freshFiles = files.filter((f) => !f.is_dir);
        playlistRef.current = freshFiles;
    }, [currentPath, files]);

    // ─── session restore ───────────────────────────────────────────────────────

    useEffect(() => {
        if (!filesLoadedOnce) return;
        if (outputMode !== 'html_audio' && nativeEngineInstalled === null) return;
        if (sessionRestoreAttemptedRef.current) {
            if (!sessionRestored) {
                const frame = requestAnimationFrame(() => setSessionRestored(true));
                return () => cancelAnimationFrame(frame);
            }
            return;
        }

        const done = () => {
            if (isMountedRef.current) setSessionRestored(true);
        };

        const executeRestore = async () => {
            const session = await fetchSessionState();
            if (!isMountedRef.current) return;
            if (!session) {
                sessionRestoreAttemptedRef.current = true;
                if (isBrowserTauri() && (autoWallpaperRef.current || isWallpaperEngineActive())) {
                    getTauri()
                        .then(mod =>
                            mod.invoke("clear_wallpaper", {
                                applyToSystem: autoWallpaperRef.current,
                            })
                        )
                        .catch(() => {});
                }
                done();
                return;
            }

            const savedParent = session.filePath.replace(/[/\\][^/\\]+$/, "");

            if (savedParent !== currentPath) {
                sessionRestoreAttemptedRef.current = true;
                try {
                    const token = ++loadFilesTokenRef.current;
                    const result = await listFiles(savedParent);
                    if (token !== loadFilesTokenRef.current || !isMountedRef.current)
                        return;
                    setFiles(result);
                    setCurrentPath(savedParent);
                    await restoreFromFileList(result, session);
                } catch {
                    saveSessionState(null);
                } finally {
                    done();
                }
                return;
            }

            if (!files.length && loadingFiles) {
                return;
            }

            sessionRestoreAttemptedRef.current = true;
            restoreFromFileList(files, session).finally(done);
        };

        void executeRestore();

        async function restoreFromFileList(
            fileList: FileEntry[],
            sess: NonNullable<ReturnType<typeof loadSessionState>>,
        ) {
            const savedFile = fileList.find(
                (f) => !f.is_dir && f.path === sess.filePath,
            ) || makeTempFileEntry(sess.filePath);

            const audio = audioRef.current;
            if (!audio) return;

            try {
                const restoreGeneration = ++playbackGenerationRef.current;
                setSelectedSong(savedFile);
                selectedSongRef.current = savedFile;
                setCurrentTime(sess.currentTime);
                restoredPendingPlayRef.current = true;

                if (outputMode === 'html_audio') {
                    const src = getAudioSrc(savedFile.path);
                    audio.src = src;
                    audio.volume = volumeModeRef.current === "app" ? appVolume : 1;
                    audio.loop = repeatRef.current === "one";
                    const onCanPlay = () => {
                        audio.removeEventListener("canplay", onCanPlay);
                        if (selectedSongRef.current?.path === savedFile.path && restoreGeneration === playbackGenerationRef.current) {
                            audio.currentTime = Math.min(sess.currentTime, audio.duration || sess.currentTime);
                            setCurrentTime(audio.currentTime);
                        }
                    };
                    audio.addEventListener("canplay", onCanPlay);
                    audio.load();
                } else {
                    // Keep the browser element empty while native capability is resolving.
                    // Native playback starts from the restored position on the first resume.
                    audio.pause();
                    audio.removeAttribute("src");
                    audio.load();
                }

                playlistRef.current = fileList.filter((f) => !f.is_dir);
                playlistFolderRef.current = savedFile.path.replace(/[/\\][^/\\]+$/, "");
                restoredPendingPlayRef.current = true;
                await loadMetadata(savedFile.path, false);

                const mins = Math.floor(sess.currentTime / 60);
                const secs = Math.floor(sess.currentTime % 60)
                    .toString()
                    .padStart(2, "0");
                addLog(
                    "info",
                    t(lang, 'log.sessionRestored', {name: savedFile.name, time: `${mins}:${secs}`}),
                );
            } catch {
                saveSessionState(null);
            }
        }
    }, [files, filesLoadedOnce, getAudioSrc, listFiles, nativeEngineInstalled, outputMode]);

    const nativeRestoreStartedRef = useRef(false);
    const previousRequestedModeRef = useRef<OutputMode>(outputMode);

    const resetPlayer = useCallback(() => {
        cancelFade();
        playbackGenerationRef.current += 1;
        metadataRequestRef.current += 1;
        activeNativeRequestRef.current = null;
        nativeRestoreStartedRef.current = false;
        const resetNativeMode: NativeOutputMode | null = outputModeRef.current === 'wasapi_shared'
            ? 'shared'
            : outputModeRef.current === 'wasapi_exclusive'
                ? 'exclusive'
                : null;
        const nativeCanResume = resetNativeMode !== null && nativeEngineInstalled === true;
        nativeEngineActiveRef.current = nativeCanResume;
        nativeEngineModeRef.current = nativeCanResume ? resetNativeMode : null;
        nativePlayingRef.current = false;
        nativeStateRef.current = "stopped";
        nativeSuppressedRef.current = false;
        setNativeSuppressed(false);
        const stopPromise = (async () => {
            if (isBrowserTauri()) {
                try {
                    const mod = await getTauri();
                    await mod.invoke("stop_audio_engine");
                } catch {
                    // Keep the player reset even if the process is already gone.
                }
            }
        })();
        nativeRecoveryPromiseRef.current = stopPromise;
        void stopPromise.finally(() => {
            if (nativeRecoveryPromiseRef.current === stopPromise) {
                nativeRecoveryPromiseRef.current = null;
            }
        });
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.removeAttribute("src");
            audioRef.current.load();
        }
        setSelectedSong(null);
        setMetadata(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setRuntimeStatus('idle');
        setRuntimeError(null);
        setEffectiveOutputMode(null);
        playlistRef.current = [];
        playlistFolderRef.current = null;
        autoPausedBySilenceRef.current = false;
        restoredPendingPlayRef.current = false;
        saveSessionState(null, true);
        if (isBrowserTauri()) {
            getTauri()
                .then((mod) => {
                    mod.invoke("clear_wallpaper").catch(() => {});
                })
                .catch(() => {});
        }
    }, [cancelFade, nativeEngineInstalled, setCurrentTime]);

    const clearInvalidNativeDevice = useCallback((error: EngineErrorEvent) => {
        if (!/audio device not found/i.test(error.message)) return;
        // A friendly-name device id can become invalid after the endpoint is
        // removed/recreated. Clear the persisted binding so the next file uses
        // the current Windows default endpoint instead of retrying the stale id.
        outputDeviceRef.current = null;
        setOutputDeviceCallbackRef.current?.(null);
    }, []);

    const fallbackNativeToHtml = useCallback(async (error: EngineErrorEvent) => {
        const song = selectedSongRef.current;
        const audio = audioRef.current;
        if (!song || !audio) return;

        clearInvalidNativeDevice(error);

        const position = Math.max(0, currentTimeRef.current);
        nativeSuppressedRef.current = true;
        setNativeSuppressed(true);
        nativeEngineActiveRef.current = false;
        nativeEngineModeRef.current = null;
        activeNativeRequestRef.current = null;
        nativeRestoreStartedRef.current = false;
        nativeStateRef.current = "stopped";
        setEffectiveOutputMode('html_audio');
        setRuntimeStatus('fallback');
        setRuntimeError(error);
        playbackGenerationRef.current += 1;
        bpSendCommandRef.current({command: "stop"}).catch(() => {});

        // Immediately update outputMode state & persistent config to 'html_audio'
        previousRequestedModeRef.current = 'html_audio';
        outputModeRef.current = 'html_audio';
        setOutputModeCallbackRef.current?.('html_audio');

        try {
            cancelFade();
            audio.src = getAudioSrc(song.path);
            audio.loop = repeatRef.current === "one";
            audio.volume = volumeModeRef.current === "app" ? appVolume : 1;
            const restorePosition = () => {
                audio.removeEventListener("loadedmetadata", restorePosition);
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audio.currentTime = Math.min(position, audio.duration);
                    setCurrentTime(audio.currentTime);
                }
            };
            audio.addEventListener("loadedmetadata", restorePosition);
            prepareAudio();
            await audio.play();
            setRuntimeStatus('playing');
            setIsPlaying(true);
            addLog("warn", t(lang, 'audio.autoFallback.notification'));
            onAutoFallbackRef.current?.();
        } catch (fallbackError) {
            const finalError = {
                ...error,
                message: `${error.message}: ${(fallbackError as Error).message || String(fallbackError)}`,
            };
            resetPlayer();
            setRuntimeStatus('error');
            setRuntimeError(finalError);
            setIsPlaying(false);
            showError(t(lang, 'log.playbackFailed', {msg: finalError.message}));
        }
    }, [addLog, appVolume, cancelFade, clearInvalidNativeDevice, getAudioSrc, lang, prepareAudio, resetPlayer, setCurrentTime, showError]);

    // ─── playback ──────────────────────────────────────────────────────────────

    const playSong = useCallback(
        async (file: FileEntry, startAt = 0) => {
            if (file.is_dir) return;

            const audio = audioRef.current;
            if (!audio) return;

            // A failed native session is stopped asynchronously by resetPlayer.
            // Wait for that teardown before sending the next play command so a
            // stale WASAPI request/device cannot poison the next file.
            const pendingNativeRecovery = nativeRecoveryPromiseRef.current;
            if (pendingNativeRecovery) {
                await pendingNativeRecovery;
                if (!isMountedRef.current) return;
            }

            cancelFade();
            const fileFolder = file.path.replace(/[/\\][^/\\]+$/, "");
            if (fileFolder !== playlistFolderRef.current) {
                playlistRef.current = filesRef.current.filter((f) => !f.is_dir);
                playlistFolderRef.current = fileFolder;
            }

            const generation = ++playbackGenerationRef.current;
            const token = generation;
            setSelectedSong(file);
            selectedSongRef.current = file;
            setMetadata(null);
            metadataRef.current = null;
            setCurrentTime(startAt);
            currentTimeRef.current = startAt;
            setDuration(0);
            setIsPlaying(true);
            nativePlayingRef.current = nativeEngineActiveRef.current;
            nativeStateRef.current = nativeEngineActiveRef.current ? 'playing' : 'idle';
            setRuntimeError(null);
            setNativeSuppressed(false);
            nativeSuppressedRef.current = false;
            setRuntimeStatus(nativeEngineActiveRef.current ? 'starting' : 'loading');
            setEffectiveOutputMode(
                nativeEngineActiveRef.current
                    ? (nativeEngineModeRef.current === 'exclusive' ? 'wasapi_exclusive' : 'wasapi_shared')
                    : 'html_audio'
            );
            saveSessionState({ filePath: file.path, currentTime: Math.max(0, startAt), timestamp: Date.now() }, true);
            loadMetadata(file.path, false);
            activeNativeRequestRef.current = null;
            nativeRestoreStartedRef.current = false;
            audio.pause();

            try {
                let resumeVolume: number | null = null;
                if (pauseIfMuted && isVolumeSilent()) {
                    resumeVolume = await setMinimumResumeVolume();
                }

                const targetVol = volumeModeRef.current === "app" ? (resumeVolume ?? appVolume) : 1;

                if (nativeEngineActiveRef.current) {
                    audio.pause();
                    audio.removeAttribute("src");
                    audio.load();
                    setIsPlaying(true);
                    nativePlayingRef.current = true;
                    setRuntimeStatus('playing');
                    setEffectiveOutputMode(nativeEngineModeRef.current === 'exclusive' ? 'wasapi_exclusive' : 'wasapi_shared');
                    await enginePlayRef.current(file, startAt > 0 ? startAt : undefined, generation);
                } else {
                    const src = getAudioSrc(file.path);
                    audio.src = src;
                    audio.loop = repeatRef.current === "one";
                    setIsPlaying(true);
                    setRuntimeStatus('playing');
                    setEffectiveOutputMode('html_audio');

                    if (fadeAudioRef.current && fadeDurationRef.current > 0) {
                        audio.volume = 0;
                        prepareAudio();
                        await audio.play();
                        fadeVolumeTo(targetVol, fadeDurationRef.current);
                    } else {
                        audio.volume = targetVol;
                        prepareAudio();
                        await audio.play();
                    }
                }

                autoPausedBySilenceRef.current = false;
                restoredPendingPlayRef.current = false;

                if (token !== playbackGenerationRef.current || !isMountedRef.current) return;
                addLog("info", t(lang, 'log.playing', {name: file.name}));
            } catch (e) {
                if (e instanceof DOMException && e.name === "AbortError") return;
                const error: EngineErrorEvent = {
                    code: 'PLAYBACK_FAILED',
                    message: (e as Error).message || String(e),
                    mode: nativeEngineActiveRef.current ? nativeEngineModeRef.current : null,
                    path: file.path,
                    requestId: activeNativeRequestRef.current,
                    generation,
                };
                clearInvalidNativeDevice(error);
                if (nativeEngineActiveRef.current && autoFallbackRef.current) {
                    await fallbackNativeToHtml(error);
                } else {
                    resetPlayer();
                    setRuntimeStatus('error');
                    setRuntimeError(error);
                    setIsPlaying(false);
                    nativePlayingRef.current = false;
                    showError(t(lang, 'log.playbackFailed', {msg: error.message}));
                }
            }
        },
        [
            appVolume,
            pauseIfMuted,
            isVolumeSilent,
            setMinimumResumeVolume,
            loadMetadata,
            addLog,
            showError,
            getAudioSrc,
            fadeVolumeTo,
            fallbackNativeToHtml,
            clearInvalidNativeDevice,
            resetPlayer,
        ],
    );

    const togglePlayPause = useCallback(() => {
        if (nativeEngineActiveRef.current) {
            const nativePlaying = nativePlayingRef.current || isPlaying;
            if (nativePlaying) {
                bpSendCommandRef.current({command: "pause"}).catch(() => {});
                setIsPlaying(false);
                nativePlayingRef.current = false;
                nativeStateRef.current = "paused";
                setRuntimeStatus('paused');
            } else if (selectedSongRef.current) {
                const song = selectedSongRef.current;
                if (nativeStateRef.current === 'paused') {
                    bpSendCommandRef.current({command: "resume"}).catch(() => {});
                    setIsPlaying(true);
                    nativePlayingRef.current = true;
                    nativeStateRef.current = "playing";
                    setRuntimeStatus('playing');
                } else {
                    playSong(song, currentTimeRef.current > 0 ? currentTimeRef.current : 0);
                }
            }
            return;
        }

        const audio = audioRef.current;
        if (!audio || !audio.src) return;

        cancelFade();

        if (audio.paused || !isPlaying) {
            setIsPlaying(true);
            const resume = async () => {
                let resumeVolume: number | null = null;
                if (pauseIfMuted && isVolumeSilent()) {
                    resumeVolume = await setMinimumResumeVolume();
                }
                const targetVol = volumeModeRef.current === "app" ? (resumeVolume ?? appVolume) : 1;
                if (fadeAudioRef.current && fadeDurationRef.current > 0) {
                    audio.volume = 0;
                    prepareAudio();
                    await audio.play();
                    fadeVolumeTo(targetVol, fadeDurationRef.current);
                } else {
                    audio.volume = targetVol;
                    prepareAudio();
                    await audio.play();
                }
                autoPausedBySilenceRef.current = false;

                if (restoredPendingPlayRef.current) {
                    restoredPendingPlayRef.current = false;
                    const meta = metadataRef.current;
                    if (meta) applyWallpaper(meta).catch(() => {});
                }
            };
            resume().catch(() => {});
        } else {
            autoPausedBySilenceRef.current = false;
            setIsPlaying(false);
            const targetVol = volumeModeRef.current === "app" ? appVolume : 1;
            if (fadeAudioRef.current && fadeDurationRef.current > 0) {
                fadeVolumeTo(0, fadeDurationRef.current, () => {
                    audio.pause();
                    audio.volume = targetVol;
                });
            } else {
                audio.pause();
            }
        }
    }, [pauseIfMuted, isVolumeSilent, setMinimumResumeVolume, applyWallpaper, appVolume, fadeVolumeTo, isPlaying, playSong, prepareAudio, cancelFade]);

    const playNext = useCallback(() => {
        const list = playlistRef.current;
        if (list.length === 0) return;

        let nextFile: FileEntry | undefined;
        if (shuffleRef.current) {
            const curPath = selectedSongRef.current?.path;
            const candidates = list.filter((f) => f.path !== curPath);
            nextFile =
                candidates.length > 0
                    ? candidates[Math.floor(Math.random() * candidates.length)]
                    : list[0];
        } else {
            const idx = selectedSongRef.current
                ? list.findIndex((f) => f.path === selectedSongRef.current!.path)
                : -1;
            nextFile = idx >= 0 ? list[idx + 1] : list[0];
            if (!nextFile && repeatRef.current === "all") nextFile = list[0];
        }

        if (nextFile) {
            playSong(nextFile);
        } else {
            resetPlayer();
        }
    }, [playSong, resetPlayer]);

    const playPrev = useCallback(() => {
        const list = playlistRef.current;
        if (list.length === 0) return;

        let prevFile: FileEntry | undefined;
        if (shuffleRef.current) {
            const curPath = selectedSongRef.current?.path;
            const candidates = list.filter((f) => f.path !== curPath);
            prevFile =
                candidates.length > 0
                    ? candidates[Math.floor(Math.random() * candidates.length)]
                    : list[0];
        } else {
            const idx = selectedSongRef.current
                ? list.findIndex((f) => f.path === selectedSongRef.current!.path)
                : -1;
            prevFile =
                idx > 0
                    ? list[idx - 1]
                    : repeatRef.current === "all"
                        ? list[list.length - 1]
                        : undefined;
        }

        if (prevFile) playSong(prevFile);
    }, [playSong]);

    const playNextRef = useRef(playNext);
    const playPrevRef = useRef(playPrev);
    const togglePlayPauseRef = useRef(togglePlayPause);
    useEffect(() => {
        playNextRef.current = playNext;
    }, [playNext]);
    useEffect(() => {
        playPrevRef.current = playPrev;
    }, [playPrev]);
    useEffect(() => {
        togglePlayPauseRef.current = togglePlayPause;
    }, [togglePlayPause]);

    // ─── native WASAPI engine ───────────────────────────────────────────────────

    const nativeOutputMode: NativeOutputMode | null = outputMode === "wasapi_shared"
        ? "shared"
        : outputMode === "wasapi_exclusive"
            ? "exclusive"
            : null;

    const enginePlay = useCallback(
        async (file: FileEntry, seekPosition?: number, generation = playbackGenerationRef.current) => {
            if (!nativeOutputMode) throw new Error("Native audio mode is not active");
            const requestId = crypto.randomUUID();
            activeNativeRequestRef.current = requestId;
            const cmd: Record<string, unknown> = {
                command: "play",
                path: file.path,
                mode: nativeOutputMode,
                exclusive: nativeOutputMode === "exclusive",
                requestId,
                generation,
                startAt: seekPosition ?? 0,
                volume: volumeModeRef.current === "app" ? appVolume : 1,
            };
            if (outputDeviceRef.current) cmd.deviceId = outputDeviceRef.current;
            await bpSendCommandRef.current(cmd);
        },
        [appVolume, nativeOutputMode],
    );

    useEffect(() => {
        enginePlayRef.current = enginePlay;
    }, [enginePlay]);

    const isCurrentNativeEvent = useCallback((event: {
        mode?: NativeOutputMode | null;
        requestId?: string | null;
        generation?: number | null;
        path?: string | null;
    }) => {
        if (!nativeEngineActiveRef.current) return false;
        if (!selectedSongRef.current) return false;
        if (event.path) {
            if (normalizePath(event.path) !== normalizePath(selectedSongRef.current.path)) {
                return false;
            }
        }
        return true;
    }, []);

    const bp = useBitPerfectEngine({
        onProgress: (e) => {
            if (!isCurrentNativeEvent(e)) return;
            if (!Number.isFinite(e.position) || !Number.isFinite(e.duration)) return;
            if (nativeStateRef.current === 'paused' || !nativePlayingRef.current) return;
            setCurrentTime(Math.max(0, e.position));
            if (e.duration > 0) setDuration(e.duration);
            const song = selectedSongRef.current;
            if (song && e.position > 0) {
                const now = Date.now();
                if (now - lastSessionSaveRef.current >= 2000) {
                    lastSessionSaveRef.current = now;
                    saveSessionState({
                        filePath: song.path,
                        currentTime: e.position,
                        timestamp: now,
                    });
                }
            }
        },
        onState: (e) => {
            if (!isCurrentNativeEvent(e)) return;
            switch (e.state) {
                case "playing":
                    nativePlayingRef.current = true;
                    nativeStateRef.current = "playing";
                    setRuntimeStatus('playing');
                    setEffectiveOutputMode(e.mode === 'exclusive' ? 'wasapi_exclusive' : 'wasapi_shared');
                    setRuntimeError(null);
                    setIsPlaying(true);
                    if (e.path) {
                        restoredPendingPlayRef.current = false;
                        const currentSong = selectedSongRef.current;
                        if (!currentSong || normalizePath(currentSong.path) !== normalizePath(e.path) || playlistRef.current.length === 0) {
                            syncSongPlaylist(e.path);
                        }
                    }
                    break;
                case "paused":
                    nativePlayingRef.current = false;
                    nativeStateRef.current = "paused";
                    setRuntimeStatus('paused');
                    setIsPlaying(false);
                    if (e.path) {
                        saveSessionState({
                            filePath: e.path,
                            currentTime: currentTimeRef.current,
                            timestamp: Date.now(),
                        }, true);
                        const currentSong = selectedSongRef.current;
                        if (!currentSong || normalizePath(currentSong.path) !== normalizePath(e.path) || playlistRef.current.length === 0) {
                            syncSongPlaylist(e.path);
                        }
                    }
                    break;
                case "stopped":
                    nativePlayingRef.current = false;
                    nativeStateRef.current = "stopped";
                    setRuntimeStatus('idle');
                    setIsPlaying(false);
                    break;
                case "ended": {
                    nativePlayingRef.current = false;
                    nativeStateRef.current = "stopped";
                    setRuntimeStatus('idle');
                    setIsPlaying(false);
                    saveSessionState(null);
                    const song = selectedSongRef.current;
                    if (repeatRef.current === "one" && song) {
                        enginePlayRef.current(song).catch(() => {});
                    } else {
                        playNextRef.current();
                    }
                    break;
                }
            }
        },
        onError: (error: EngineErrorEvent) => {
            if (!isCurrentNativeEvent(error)) return;
            clearInvalidNativeDevice(error);
            nativeStateRef.current = "stopped";
            nativePlayingRef.current = false;
            if (autoFallbackRef.current) {
                setRuntimeStatus('fallback');
                setRuntimeError(error);
                fallbackNativeToHtml(error).catch(() => {
                    showError(t(lang, 'log.playbackFailed', {msg: error.message}));
                });
            } else {
                resetPlayer();
                setRuntimeStatus('error');
                setRuntimeError(error);
                setIsPlaying(false);
                nativePlayingRef.current = false;
                showError(t(lang, 'log.playbackFailed', {msg: error.message}));
            }
        },
    });

    useEffect(() => {
        bpSendCommandRef.current = bp.sendCommand;
    }, [bp.sendCommand]);

    const nativeEngineActive = nativeOutputMode !== null && bp.status?.installed === true && !nativeSuppressed;
    const getNativeState = bp.getState;
    useEffect(() => {
        if (nativeOutputMode === null || bp.status?.installed !== false || nativeSuppressed) return;
        const timer = window.setTimeout(() => {
            setRuntimeStatus('unavailable');
            setEffectiveOutputMode(null);
            setRuntimeError({
                code: 'ENGINE_UNAVAILABLE',
                message: 'The native audio engine is not installed.',
                mode: nativeOutputMode,
            });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [bp.status?.installed, nativeOutputMode, nativeSuppressed]);
    useEffect(() => {
        nativeEngineActiveRef.current = nativeEngineActive;
        nativeEngineModeRef.current = nativeOutputMode;
    }, [nativeEngineActive, nativeOutputMode]);

    useEffect(() => {
        // The native sidecar survives a WebView reload. Once session restore
        // has selected the saved file, request its live state so the new UI
        // reflects whether WASAPI is actually playing or paused.
        if (
            nativeOutputMode === null ||
            bp.status?.installed !== true ||
            !sessionRestored ||
            !selectedSongRef.current
        ) {
            return;
        }
        getNativeState().catch(() => {
            // A sidecar that exited between reload and the query will be
            // treated as stopped; the next explicit play can start it again.
        });
    }, [bp.status?.installed, getNativeState, nativeOutputMode, sessionRestored]);

    useEffect(() => {
        if (previousRequestedModeRef.current === outputMode) return;
        const prevMode = previousRequestedModeRef.current;
        previousRequestedModeRef.current = outputMode;

        // If this is the initial config load before session restore, just sync the ref
        if (!sessionRestoreAttemptedRef.current) {
            return;
        }

        // A confirmed mode change may already have called resetPlayer before
        // updating the requested mode. Avoid sending duplicate stop commands
        // when there is no stream/song left to tear down.
        const hasActivePlayback = Boolean(
            selectedSongRef.current ||
            audioRef.current?.src ||
            activeNativeRequestRef.current !== null ||
            nativePlayingRef.current,
        );
        if (!hasActivePlayback) {
            setEffectiveOutputMode(outputMode === 'html_audio' ? 'html_audio' : null);
            return;
        }

        // When switching output mode: ALWAYS stop playback completely in native engine & HTML audio
        bpSendCommandRef.current({command: "stop"}).catch(() => {});
        if (isBrowserTauri()) {
            getTauri().then((m) => m.invoke("stop_audio_engine")).catch(() => {});
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute("src");
            audioRef.current.load();
        }

        setNativeSuppressed(false);
        nativeSuppressedRef.current = false;
        selectedSongRef.current = null;
        setSelectedSong(null);
        metadataRef.current = null;
        setMetadata(null);
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        nativePlayingRef.current = false;
        activeNativeRequestRef.current = null;
        playbackGenerationRef.current += 1;
        metadataRequestRef.current += 1;
        setRuntimeStatus('idle');
        setRuntimeError(null);
        setEffectiveOutputMode(outputMode === 'html_audio' ? 'html_audio' : null);
        playlistRef.current = [];
        playlistFolderRef.current = null;
        saveSessionState(null, true);
    }, [outputMode, setCurrentTime]);

    // Keep native engine volume in sync with the app volume slider.
    useEffect(() => {
        if (!nativeEngineActiveRef.current) return;
        bpSendCommandRef.current({
            command: "set_volume",
            volume: volumeMode === "app" ? appVolume : 1,
        }).catch(() => {});
    }, [volumeMode, appVolume]);

    // ─── audio element lifecycle ───────────────────────────────────────────────

    useEffect(() => {
        isMountedRef.current = true;
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;
        audio.volume = volumeModeRef.current === "app" ? appVolume : 1;

        const isHtmlPlaybackActive = () => !nativeEngineActiveRef.current && outputModeRef.current === 'html_audio';
        const handlePlay = () => {
            if (!isHtmlPlaybackActive()) return;
            setRuntimeStatus('playing');
            setEffectiveOutputMode('html_audio');
            setRuntimeError(null);
            setIsPlaying(true);
        };
        const handlePause = () => {
            if (!isHtmlPlaybackActive()) return;
            setRuntimeStatus('paused');
            setIsPlaying(false);
            const song = selectedSongRef.current;
            if (song && audio.currentTime > 0) {
                saveSessionState({
                    filePath: song.path,
                    currentTime: audio.currentTime,
                    timestamp: Date.now(),
                }, true);
            }
        };

        const handleTimeUpdate = () => {
            if (!isHtmlPlaybackActive()) return;
            const t = audio.currentTime;
            setCurrentTime(t);
            if (!audio.paused && !isPlaying) {
                setIsPlaying(true);
                setRuntimeStatus('playing');
            }
            const song = selectedSongRef.current;
            if (song && t > 0) {
                const now = Date.now();
                if (now - lastSessionSaveRef.current >= 2000) {
                    lastSessionSaveRef.current = now;
                    const session: SessionState = {
                        filePath: song.path,
                        currentTime: t,
                        timestamp: now,
                    };
                    saveSessionState(session);
                }
            }
        };

        const handleDurationChange = () => {
            if (isHtmlPlaybackActive()) setDuration(audio.duration || 0);
        };

        const handleEnded = () => {
            if (!isHtmlPlaybackActive()) return;
            saveSessionState(null, true);
            playNextRef.current();
        };

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("ended", handleEnded);

        return () => {
            isMountedRef.current = false;
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("ended", handleEnded);
            audio.src = "";
            audioRef.current = null;
        };
    }, []);

    useEffect(() => {
        const flush = () => {
            if ((window as unknown as { __symvoniaResetInProgress?: boolean }).__symvoniaResetInProgress) return;
            const song = selectedSongRef.current;
            const curTime = nativeEngineActiveRef.current ? currentTimeRef.current : audioRef.current?.currentTime;
            if (song && curTime && curTime > 0) {
                saveSessionState({
                    filePath: song.path,
                    currentTime: curTime,
                    timestamp: Date.now(),
                }, true);
            }
        };
        window.addEventListener("beforeunload", flush);
        window.addEventListener("pagehide", flush);
        return () => {
            flush();
            window.removeEventListener("beforeunload", flush);
            window.removeEventListener("pagehide", flush);
        };
    }, []);

    // ─── volume / mute sync ────────────────────────────────────────────────────

    useEffect(() => {
        if (!audioRef.current) return;
        if (volumeMode === "app") {
            audioRef.current.volume = Math.max(0, Math.min(1, appVolume));
        } else {
            audioRef.current.volume = 1;
        }
    }, [volumeMode, appVolume]);

    useEffect(() => {
        if (!pauseIfMuted || !isPlaying) return;
        const isZero =
            volumeMode === "app" ? appVolume <= 0 : systemMuted || systemVolume <= 0;
        if (isZero && audioRef.current) {
            autoPausedBySilenceRef.current = true;
            audioRef.current.pause();
            setIsPlaying(false);
        }
    }, [
        pauseIfMuted,
        volumeMode,
        appVolume,
        systemVolume,
        systemMuted,
        isPlaying,
    ]);

    useEffect(() => {
        if (!pauseIfMuted || !autoPausedBySilenceRef.current) return;
        const audio = audioRef.current;
        if (!audio || !audio.src || !audio.paused) return;
        const stillSilent =
            volumeMode === "app" ? appVolume <= 0 : systemMuted || systemVolume <= 0;
        if (stillSilent) return;
        autoPausedBySilenceRef.current = false;
        audio.play().catch(() => {
            autoPausedBySilenceRef.current = true;
        });
    }, [pauseIfMuted, volumeMode, appVolume, systemVolume, systemMuted]);

    useEffect(() => {
        if (!pauseIfMuted) autoPausedBySilenceRef.current = false;
    }, [pauseIfMuted]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.loop = repeat === "one";
    }, [repeat]);

    // ─── controls ──────────────────────────────────────────────────────────────

    const handleVolumeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isFinite(parsed)) return;
            const v = Math.max(0, Math.min(1, parsed));
            if (volumeModeRef.current === "app") {
                setAppVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
            } else {
                const targetPct = Math.round(v * 100);
                if (volumeLimit > 0 && targetPct > volumeLimit) return;
                setSystemVolume(v);
                setSystemMuted(targetPct === 0);
                lastLocalVolumeSetRef.current = Date.now();
                if (isBrowserTauri()) {
                    getTauri()
                        .then(async (m) => {
                            await m.invoke("set_system_volume", {value: targetPct});
                            if (targetPct > 0) {
                                await m.invoke("set_system_mute", {mute: false});
                                setSystemMuted(false);
                            }
                        })
                        .catch(() => {});
                }
            }
        },
        [
            volumeLimit,
            setAppVolume,
            setSystemVolume,
            setSystemMuted,
            lastLocalVolumeSetRef,
        ],
    );

    const seekTo = useCallback((t: number) => {
        const clamped = Math.max(0, t);
        setCurrentTime(clamped);
        currentTimeRef.current = clamped;
        const song = selectedSongRef.current;
        if (song) {
            saveSessionState({
                filePath: song.path,
                currentTime: clamped,
                timestamp: Date.now(),
            });
        }
        if (nativeEngineActiveRef.current) {
            bpSendCommandRef.current({command: "seek", position: clamped}).catch(() => {});
        } else if (audioRef.current) {
            audioRef.current.currentTime = clamped;
        }
    }, [setCurrentTime]);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        seekTo(t);
    }, [seekTo]);

    const toggleSystemMute = useCallback(() => {
        if (!isBrowserTauri()) return;
        const shouldMute = !systemMuted;
        setSystemMuted(shouldMute);
        lastLocalVolumeSetRef.current = Date.now();
        getTauri()
            .then((m) => m.invoke("set_system_mute", {mute: shouldMute}))
            .catch(() => {});
    }, [systemMuted, setSystemMuted, lastLocalVolumeSetRef]);

    const goUp = useCallback(() => {
        if (!currentPath || !musicFolder) return;
        const parent = currentPath
            .replace(/\\/g, "/")
            .split("/")
            .slice(0, -1)
            .join("\\");
        if (parent.length >= musicFolder.length) setCurrentPath(parent);
    }, [currentPath, musicFolder]);

    // ─── return ────────────────────────────────────────────────────────────────

    const isLossless = selectedSong?.ext
        ? ['flac', 'wav', 'alac', 'aiff', 'dsd', 'dsf'].includes(selectedSong.ext.toLowerCase())
        : false;

    const runtime: PlaybackRuntimeInfo = {
        status: runtimeStatus,
        requestedMode: outputMode,
        effectiveMode: effectiveOutputMode,
        path: selectedSong?.path ?? null,
        position: currentTime,
        duration,
        deviceName: bp.engineState?.deviceName ?? null,
        sampleRate: metadata?.sample_rate ?? bp.engineState?.sampleRate ?? null,
        bitDepth: isLossless ? (metadata?.bit_depth ?? bp.engineState?.bitDepth ?? null) : null,
        error: runtimeError,
    };

    return {
        files,
        filesLoadedOnce,
        sessionRestored,
        loadingFiles,
        currentPath,
        setCurrentPath,
        selectedSong,
        setSelectedSong,
        metadata,
        setMetadata,
        coverDataUrl,
        isPlaying,
        setIsPlaying,
        currentTime,
        setCurrentTime,
        duration,
        activeVolume,
        audioRef,
        playSong,
        togglePlayPause,
        resetPlayer,
        playNext,
        playPrev,
        togglePlayPauseRef,
        playNextRef,
        playPrevRef,
        handleVolumeChange,
        handleSeek,
        seekTo,
        toggleSystemMute,
        goUp,
        gainBoost: gainBoostValue,
        setGainBoost,
        gainBoostSupported,
        minGainBoost,
        maxGainBoost,
        equalizer,
        refreshFiles,
        bpEngineState: bp.engineState,
        nativeEngineActive,
        runtimeStatus,
        runtimeError,
        effectiveOutputMode,
        runtime,
        retryNative: () => {
            nativeSuppressedRef.current = false;
            setNativeSuppressed(false);
            setRuntimeError(null);
            if (selectedSongRef.current) {
                enginePlayRef.current(selectedSongRef.current, currentTimeRef.current, playbackGenerationRef.current).catch(() => {});
            }
        },
    };
}
