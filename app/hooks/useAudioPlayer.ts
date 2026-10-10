import {useCallback, useEffect, useRef, useState} from "react";
import type {FileEntry} from "../components/FolderExplorer";
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
import {useAudioQueue} from "./audio/useAudioQueue";
import {useAudioWallpaper} from "./audio/useAudioWallpaper";
import {useAudioVolume} from "./audio/useAudioVolume";
import {normalizePath, makeTempFileEntry, type PlaybackRuntimeInfo} from "./audio/playbackTypes";
import {isWallpaperEngineActive} from "./useWallpaperPlugin";

export interface UseAudioPlayerOptions {
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

    const isMountedRef = useRef(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Callbacks & options refs
    const outputModeRef = useRef<OutputMode>(outputMode);
    const autoFallbackRef = useRef<boolean>(autoFallbackHtmlAudio);
    const onAutoFallbackRef = useRef(onAutoFallback);
    const setOutputModeCallbackRef = useRef(setOutputMode);
    const setOutputDeviceCallbackRef = useRef(setOutputDevice);
    const outputDeviceRef = useRef<string | null>(outputDevice);
    const prevOutputDeviceRef = useRef<string | null>(outputDevice);
    const shuffleRef = useRef(shuffle);
    const repeatRef = useRef<"off" | "all" | "one">(repeat);

    useEffect(() => {
        outputModeRef.current = outputMode;
        autoFallbackRef.current = autoFallbackHtmlAudio;
        onAutoFallbackRef.current = onAutoFallback;
        setOutputModeCallbackRef.current = setOutputMode;
        setOutputDeviceCallbackRef.current = setOutputDevice;
        shuffleRef.current = shuffle;
        repeatRef.current = repeat;
    }, [outputMode, autoFallbackHtmlAudio, onAutoFallback, setOutputMode, setOutputDevice, shuffle, repeat]);

    // Core playback state
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
    const [sessionRestored, setSessionRestored] = useState(false);

    // Playback generation & tracking refs
    const playbackGenerationRef = useRef(0);
    const lastSessionSaveRef = useRef(0);
    const restoredPendingPlayRef = useRef(false);
    const sessionRestoreAttemptedRef = useRef(false);
    const nativeEngineActiveRef = useRef(false);
    const nativeEngineModeRef = useRef<NativeOutputMode | null>(null);
    const activeNativeRequestRef = useRef<string | null>(null);
    const nativePlayingRef = useRef(false);
    const nativeStateRef = useRef<"idle" | "playing" | "paused" | "stopped">("idle");
    const nativeSuppressedRef = useRef(false);
    const nativeRecoveryPromiseRef = useRef<Promise<void> | null>(null);
    const bpSendCommandRef = useRef<(cmd: Record<string, unknown>) => Promise<void>>(async () => {});
    const enginePlayRef = useRef<(file: FileEntry, seekPosition?: number, generation?: number) => Promise<void>>(async () => {});

    // Sub-hook: Audio Wallpaper & Metadata
    const wallpaperHook = useAudioWallpaper({
        lang,
        autoWallpaper,
        showError,
        selectedSongRef: {current: null}, // will be wired to queue
        isMountedRef,
        onDurationChange: (dur) => setDuration(dur),
    });
    const {
        metadata,
        setMetadata,
        metadataRef,
        metadataRequestRef,
        coverDataUrl,
        applyWallpaper,
        loadMetadata,
    } = wallpaperHook;

    // Sub-hook: Audio Queue & Playlist
    const queue = useAudioQueue({
        musicFolder,
        folderSort,
        fileSort,
        sortDir,
        nameSource,
        formats,
        showError,
        isMountedRef,
        onSongSelectedSync: (filePath) => loadMetadata(filePath, true),
        onSongSelectedMissing: () => setMetadata(null),
    });
    const {
        files,
        setFiles,
        filesRef,
        filesLoadedOnce,
        loadingFiles,
        currentPath,
        setCurrentPath,
        selectedSong,
        setSelectedSong,
        selectedSongRef,
        playlistRef,
        playlistFolderRef,
        loadFilesTokenRef,
        listFiles,
        refreshFiles,
        goUp,
        syncSongPlaylist,
        getNextSong,
        getPrevSong,
    } = queue;

    // Wire selectedSongRef to wallpaperHook's internal lookup
    const prevAutoWallpaperRef = useRef(autoWallpaper);
    useEffect(() => {
        const prev = prevAutoWallpaperRef.current;
        prevAutoWallpaperRef.current = autoWallpaper;
        if (prev !== autoWallpaper && autoWallpaper && isBrowserTauri()) {
            if (metadataRef.current) {
                applyWallpaper(metadataRef.current).catch(() => {});
            } else if (selectedSongRef.current) {
                loadMetadata(selectedSongRef.current.path, false).catch(() => {});
            }
        }
    }, [autoWallpaper, applyWallpaper, loadMetadata, metadataRef, selectedSongRef]);

    // Sub-hook: Audio Volume & Mute
    const volume = useAudioVolume({
        volumeMode,
        appVolume,
        systemVolume,
        setAppVolume,
        setSystemVolume,
        volumeLimit,
        systemMuted,
        setSystemMuted,
        lastLocalVolumeSetRef,
        pauseIfMuted,
        isPlaying,
        setIsPlaying,
        audioRef,
    });
    const {
        activeVolume,
        volumeModeRef,
        autoPausedBySilenceRef,
        isVolumeSilent,
        setMinimumResumeVolume,
        handleVolumeChange,
        toggleSystemMute,
    } = volume;

    // Sub-hook: Audio Effects & DSP
    const {fadeVolumeTo, cancelFade, fadeAudioRef, fadeDurationRef} = useVolumeFade(audioRef, fadeAudio, fadeDuration);
    const {getAudioSrc} = useAudioSrc();
    const equalizer = useEqualizer();
    const {
        gain: gainBoostValue,
        setGain: setGainBoost,
        supported: gainBoostSupported,
        minGain: minGainBoost,
        maxGain: maxGainBoost,
        prepareAudio,
    } = useGainBoost(audioRef, equalizer);

    // On-the-fly Output Device Switching
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
                        bpSendCommandRef.current({command: "pause"}).catch(() => {});
                    }
                }).catch((err) => {
                    console.error("[Symvonia] Failed to switch output device on the fly:", err);
                });
            } else if (audioRef.current && 'setSinkId' in audioRef.current) {
                const el = audioRef.current as HTMLMediaElement & {setSinkId?: (id: string) => Promise<void>};
                if (typeof el.setSinkId === 'function') {
                    el.setSinkId(outputDevice || "").catch(() => {});
                }
            }
        }
    }, [outputDevice, isPlaying, runtimeStatus, selectedSongRef]);

    // Session restore implementation
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
                if (isBrowserTauri() && (autoWallpaper || isWallpaperEngineActive())) {
                    getTauri()
                        .then(mod =>
                            mod.invoke("clear_wallpaper", {
                                applyToSystem: autoWallpaper,
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
    }, [
        addLog,
        appVolume,
        autoWallpaper,
        currentPath,
        files,
        filesLoadedOnce,
        getAudioSrc,
        lang,
        listFiles,
        loadFilesTokenRef,
        loadMetadata,
        loadingFiles,
        nativeEngineInstalled,
        outputMode,
        playlistFolderRef,
        playlistRef,
        selectedSongRef,
        setCurrentPath,
        setCurrentTime,
        setFiles,
        setSelectedSong,
        sessionRestored,
        volumeModeRef,
    ]);

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
    }, [
        autoPausedBySilenceRef,
        cancelFade,
        metadataRequestRef,
        nativeEngineInstalled,
        playlistFolderRef,
        playlistRef,
        setCurrentTime,
        setMetadata,
        setSelectedSong,
    ]);

    const clearInvalidNativeDevice = useCallback((error: EngineErrorEvent) => {
        if (!/audio device not found/i.test(error.message)) return;
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
    }, [
        addLog,
        appVolume,
        cancelFade,
        clearInvalidNativeDevice,
        getAudioSrc,
        lang,
        prepareAudio,
        resetPlayer,
        selectedSongRef,
        setCurrentTime,
        showError,
        volumeModeRef,
    ]);

    // Playback actions
    const playSong = useCallback(
        async (file: FileEntry, startAt = 0) => {
            if (file.is_dir) return;

            const audio = audioRef.current;
            if (!audio) return;

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
            saveSessionState({filePath: file.path, currentTime: Math.max(0, startAt), timestamp: Date.now()}, true);
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
            addLog,
            appVolume,
            autoPausedBySilenceRef,
            cancelFade,
            clearInvalidNativeDevice,
            fadeAudioRef,
            fadeDurationRef,
            fadeVolumeTo,
            fallbackNativeToHtml,
            filesRef,
            getAudioSrc,
            isVolumeSilent,
            lang,
            loadMetadata,
            metadataRef,
            pauseIfMuted,
            playlistFolderRef,
            playlistRef,
            prepareAudio,
            resetPlayer,
            selectedSongRef,
            setCurrentTime,
            setMetadata,
            setMinimumResumeVolume,
            setSelectedSong,
            showError,
            volumeModeRef,
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
    }, [
        appVolume,
        applyWallpaper,
        autoPausedBySilenceRef,
        cancelFade,
        fadeAudioRef,
        fadeDurationRef,
        fadeVolumeTo,
        isPlaying,
        isVolumeSilent,
        metadataRef,
        pauseIfMuted,
        playSong,
        prepareAudio,
        selectedSongRef,
        setMinimumResumeVolume,
        volumeModeRef,
    ]);

    const playNext = useCallback(() => {
        const nextFile = getNextSong(shuffleRef.current, repeatRef.current);
        if (nextFile) {
            playSong(nextFile);
        } else {
            resetPlayer();
        }
    }, [getNextSong, playSong, resetPlayer]);

    const playPrev = useCallback(() => {
        const prevFile = getPrevSong(shuffleRef.current, repeatRef.current);
        if (prevFile) {
            playSong(prevFile);
        }
    }, [getPrevSong, playSong]);

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

    // Native WASAPI Engine Setup
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
        [appVolume, nativeOutputMode, volumeModeRef],
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
    }, [selectedSongRef]);

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
        if (
            nativeOutputMode === null ||
            bp.status?.installed !== true ||
            !sessionRestored ||
            !selectedSongRef.current
        ) {
            return;
        }
        getNativeState().catch(() => {});
    }, [bp.status?.installed, getNativeState, nativeOutputMode, selectedSongRef, sessionRestored]);

    useEffect(() => {
        if (previousRequestedModeRef.current === outputMode) return;
        previousRequestedModeRef.current = outputMode;

        if (!sessionRestoreAttemptedRef.current) {
            return;
        }

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
    }, [
        metadataRef,
        metadataRequestRef,
        outputMode,
        playlistFolderRef,
        playlistRef,
        selectedSongRef,
        setCurrentTime,
        setMetadata,
        setSelectedSong,
    ]);

    useEffect(() => {
        if (!nativeEngineActiveRef.current) return;
        bpSendCommandRef.current({
            command: "set_volume",
            volume: volumeMode === "app" ? appVolume : 1,
        }).catch(() => {});
    }, [volumeMode, appVolume]);

    // HTML Audio Element Lifecycle
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
            if (!audio.paused) {
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
    }, [appVolume, selectedSongRef, setCurrentTime, volumeModeRef]);

    // Session Flush on Window Unload
    useEffect(() => {
        const flush = () => {
            if ((window as unknown as {__symvoniaResetInProgress?: boolean}).__symvoniaResetInProgress) return;
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
    }, [selectedSongRef]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.loop = repeat === "one";
    }, [repeat]);

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
    }, [selectedSongRef, setCurrentTime]);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        seekTo(t);
    }, [seekTo]);

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
