"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import {HoverInfoProvider, useHoverInfo} from "./contexts/HoverInfoContext";
import HomeAlerts from "./components/home/HomeAlerts";
import HomeHeader from "./components/home/HomeHeader";
import HomeModals from "./components/home/HomeModals";
import EqualizerModal from "./components/EqualizerModal";
import MetadataEditModal from "./components/MetadataEditModal";
import ToolbarEditModal from "./components/ToolbarEditModal";
import HomePlayerArea from "./components/home/HomePlayerArea";
import ContextMenu from "./components/ContextMenu";
import {FullInitSkeleton} from "./components/Skeleton";
import {t} from "./lib/translations";
import {useAppLogging} from "./hooks/useAppLogging";
import {useAppUpdater} from "./hooks/useAppUpdater";
import {useAudioPlayer} from "./hooks/useAudioPlayer";
import {useKeyboardShortcuts} from "./hooks/useKeyboardShortcuts";
import {usePlayerSettings} from "./hooks/usePlayerSettings";
import {getTauri, isBrowserTauri} from "./lib/homeState";
import {resetAppConfig} from "./lib/storage";
import {useModalRouter} from "./hooks/useModalRouter";
import {useGlobalContextMenu} from "./hooks/useGlobalContextMenu";
import {useBitPerfectEngine} from "./hooks/useBitPerfectEngine";
import {useEqualizerPlugin} from "./hooks/useEqualizerPlugin";
import {useTagEditorPlugin} from "./hooks/useTagEditorPlugin";

export default function Home() {
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );

    return (
        <HoverInfoProvider>
            {!mounted ? <FullInitSkeleton /> : <HomeContent />}
        </HoverInfoProvider>
    );
}

function StatusBarText({text}: {text: string}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [scrollDist, setScrollDist] = useState<number | null>(null); // null = no scroll
    const [duration, setDuration] = useState(8);

    useEffect(() => {
        const container = containerRef.current;
        const inner = textRef.current;
        if (!container || !inner) return;

        const measure = () => {
            const cw = container.offsetWidth;
            const tw = inner.scrollWidth;
            if (tw > cw) {
                setScrollDist(tw + 60);
                setDuration(Math.max(5, tw / 55));
            } else {
                setScrollDist(null);
            }
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(container);
        return () => ro.disconnect();
    }, [text]);

    const isScrolling = scrollDist !== null;

    return (
        <div
            ref={containerRef}
            className="overflow-hidden w-full whitespace-nowrap"
        >
            <span
                style={
                    isScrolling
                        ? {
                            display: "inline-flex",
                            gap: "3.75rem",
                            animation: `status-scroll ${duration}s linear infinite`,
                            ["--scroll-dist" as string]: `-${scrollDist}px`,
                        }
                        : {
                            display: "inline-block",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            verticalAlign: "middle",
                        }
                }
            >
                <span ref={textRef}>{text}</span>
                {isScrolling && <span aria-hidden>{text}</span>}
            </span>
        </div>
    );
}

function HomeContent() {
    const {hoverInfo} = useHoverInfo();
    const {
        debugError,
        setDebugError,
        logs,
        toastVisible,
        setToastVisible,
        addLog,
        showError,
    } = useAppLogging();

    const SIDEBAR_BREAKPOINT = 900;
    const [isCompact, setIsCompact] = useState<boolean>(
        typeof window !== "undefined" ? window.innerWidth < SIDEBAR_BREAKPOINT : false,
    );
    const [showLeftSidebar, setShowLeftSidebar] = useState(true);
    const [showRightSidebar, setShowRightSidebar] = useState(true);
    const [resetSidebarToken, setResetSidebarToken] = useState(0);

    const [pendingFolderChange, setPendingFolderChange] = useState(false);

    const {
        settingsOpen,
        setSettingsOpen,
        streamingOpen,
        setStreamingOpen,
        equalizerOpen,
        metadataEditOpen,
        lyricsSearchOpen,
        aiLyricsModalOpen,
        toolbarEditOpen,
        editingTargetFile,
        openEqualizer,
        closeEqualizer,
        openSettings,
        closeSettings,
        openStreaming,
        closeStreaming,
        openMetadataEdit,
        closeMetadataEdit,
        openLyricsSearch,
        closeLyricsSearch,
        openAiLyricsModal,
        closeAiLyricsModal,
        openToolbarEdit,
        closeToolbarEdit,
    } = useModalRouter();


    const settingsOpenRef = useRef(false);
    const streamingOpenRef = useRef(false);
    const pendingFolderChangeRef = useRef(false);
    const equalizerOpenRef = useRef(false);
    const metadataEditOpenRef = useRef(false);
    const lyricsSearchOpenRef = useRef(false);
    const toolbarEditOpenRef = useRef(false);

    useEffect(() => {
        settingsOpenRef.current = settingsOpen;
        streamingOpenRef.current = streamingOpen;
        pendingFolderChangeRef.current = pendingFolderChange;
        equalizerOpenRef.current = equalizerOpen;
        metadataEditOpenRef.current = metadataEditOpen;
        lyricsSearchOpenRef.current = lyricsSearchOpen;
        toolbarEditOpenRef.current = toolbarEditOpen;
    }, [settingsOpen, streamingOpen, pendingFolderChange, equalizerOpen, metadataEditOpen, lyricsSearchOpen, toolbarEditOpen]);

    const settings = usePlayerSettings();
    const lang = settings.language;

    // ── Status bar notification ──────────────────────────────────────────────
    const [statusNotif, setStatusNotif] = useState<{
        type: 'cover-saved' | 'metadata-saved' | 'volume-limit' | 'auto-fallback';
        msgKey: string;
        vars?: Record<string, string | number>;
    } | null>(null);
    const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // C2: Cleanup notification timer on unmount to prevent memory leak
    useEffect(() => {
        return () => {
            if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
        };
    }, []);

    const showStatusNotif = useCallback(
        (type: 'cover-saved' | 'metadata-saved' | 'volume-limit' | 'auto-fallback', vars?: Record<string, string | number>) => {
            if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
            const msgKey =
                type === 'cover-saved'
                    ? 'notification.coverSaved'
                    : type === 'metadata-saved'
                    ? 'notification.metadataSaved'
                    : type === 'auto-fallback'
                    ? 'audio.autoFallback.notification'
                    : 'notification.volumeLimit';
            setStatusNotif({
                type,
                msgKey,
                vars,
            });
            if (type === 'cover-saved' || type === 'metadata-saved' || type === 'auto-fallback') {
                const duration = type === 'auto-fallback' ? 10000 : 3000;
                notifTimerRef.current = setTimeout(() => {
                    setStatusNotif((prev) => (prev?.type === type ? null : prev));
                }, duration);
            }
        },
        [],
    );

    // Show/clear volume-limit notification reactively
    const prevVolumeLimitExceeded = useRef(false);
    useEffect(() => {
        const exceeded = settings.volumeLimitExceeded;
        if (exceeded && !prevVolumeLimitExceeded.current) {
            showStatusNotif('volume-limit', {limit: settings.volumeLimit});
        } else if (!exceeded && prevVolumeLimitExceeded.current) {
            setStatusNotif((prev) => prev?.type === 'volume-limit' ? null : prev);
        }
        prevVolumeLimitExceeded.current = exceeded;
    }, [settings.volumeLimitExceeded, settings.volumeLimit, showStatusNotif]);

    const { status: bpStatus } = useBitPerfectEngine();
    const isPluginInstalled = bpStatus?.installed === true;
    const isEqualizerInstalled = isPluginInstalled;
    const isTagEditorInstalled = isPluginInstalled;
    const player = useAudioPlayer({
        lang,
        musicFolder: settings.musicFolder,
        autoWallpaper: settings.autoWallpaper,
        folderSort: settings.folderSort,
        fileSort: settings.fileSort,
        sortDir: settings.sortDir,
        nameSource: settings.nameSource,
        formats: settings.formats,
        shuffle: settings.shuffle,
        repeat: settings.repeat,
        volumeMode: settings.volumeMode,
        appVolume: settings.appVolume,
        systemVolume: settings.systemVolume,
        setAppVolume: settings.setAppVolume,
        setSystemVolume: settings.setSystemVolume,
        volumeLimit: settings.volumeLimit,
        showError,
        addLog,
        setSystemMuted: settings.setSystemMuted,
        lastLocalVolumeSetRef: settings.lastLocalVolumeSetRef,
        pauseIfMuted: settings.pauseIfMuted,
        systemMuted: settings.systemMuted,
        fadeAudio: settings.fadeAudio,
        fadeDuration: settings.fadeDuration,
        outputMode: settings.outputMode,
        setOutputMode: settings.setOutputMode,
        outputDevice: settings.outputDevice,
        setOutputDevice: settings.setOutputDeviceState,
        autoFallbackHtmlAudio: settings.autoFallbackHtmlAudio,
        onAutoFallback: () => showStatusNotif('auto-fallback'),
        nativeEngineInstalled: settings.outputMode === 'html_audio' ? true : bpStatus?.installed ?? null,
    });

    useKeyboardShortcuts({
        shortcutsRef: settings.shortcutsRef,
        settingsOpenRef,
        streamingOpenRef,
        pendingFolderChangeRef,
        equalizerOpenRef,
        togglePlayPauseRef: player.togglePlayPauseRef,
        playNextRef: player.playNextRef,
        playPrevRef: player.playPrevRef,
        appVolumeRef: settings.appVolumeRef,
        systemVolumeRef: settings.systemVolumeRef,
        volumeStepRef: settings.volumeStepRef,
        setAppVolume: settings.setAppVolume,
        setSystemVolume: settings.setSystemVolume,
        setSystemMuted: settings.setSystemMuted,
        volumeModeRef: settings.volumeModeRef,
        volumeLimitRef: settings.volumeLimitRef,
        audioRef: player.audioRef,
        lastLocalVolumeSetRef: settings.lastLocalVolumeSetRef,
    });

    const {
        updateChecking,
        updateStatus,
        updateDownloaded,
        updateTotal,
        handleCheckUpdate,
        autoUpdateInfo,
        autoUpdateDownloading,
        autoUpdateProgress,
        autoUpdateTotal,
        dismissAutoUpdate,
        skipAutoUpdateVersion,
        startAutoUpdateDownload,
    } = useAppUpdater({addLog, lang});

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (!isCompact) {
                setShowLeftSidebar(true);
                setShowRightSidebar(true);
            } else {
                setShowLeftSidebar(false);
                setShowRightSidebar(false);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [isCompact]);

    // H1: Store isCompact boolean instead of raw windowWidth to avoid cascading re-renders
    // C1: Cancel animation frame on unmount to prevent memory leak
    useEffect(() => {
        let raf = 0;
        const handleResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                setIsCompact(window.innerWidth < SIDEBAR_BREAKPOINT);
            });
        };
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(raf);
        };
    }, []);

    useEffect(() => {
        const preventNative = (e: MouseEvent) => e.preventDefault();
        document.addEventListener("contextmenu", preventNative, true);
        return () =>
            document.removeEventListener("contextmenu", preventNative, true);
    }, []);

    useEffect(() => {
        const blockReload = (e: KeyboardEvent) => {
            if (
                ((e.ctrlKey || e.metaKey) && e.key == "r") ||
                ((e.ctrlKey || e.metaKey) && e.key == "R")
            ) {
                e.preventDefault();
            }
        };
        document.addEventListener("keydown", blockReload, true);
        return () => document.removeEventListener("keydown", blockReload, true);
    }, []);

    const { globalContextMenu, hideGlobalContextMenu, showGlobalContextMenu } = useGlobalContextMenu({
        lang,
        player,
        settings,
        setSettingsOpen,
        setStreamingOpen,
        settingsOpenRef,
        streamingOpenRef,
        equalizerOpenRef,
        metadataEditOpenRef,
        lyricsSearchOpenRef,
        toolbarEditOpenRef,
    });

    useEffect(() => {
        if (settingsOpen || streamingOpen || equalizerOpen || metadataEditOpen || lyricsSearchOpen || toolbarEditOpen) {
            hideGlobalContextMenu();
        }
    }, [settingsOpen, streamingOpen, equalizerOpen, metadataEditOpen, lyricsSearchOpen, toolbarEditOpen, hideGlobalContextMenu]);

    // M1: Destructure specific stable functions to avoid regenerating callback on every currentTime update
    const doPickFolder = useCallback(async () => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<string | null>("pick_folder");
            if (result) {
                settings.setMusicFolder(result);
                player.setCurrentPath(result);
                player.setSelectedSong(null);
                player.setMetadata(null);
            }
        } catch (e) {
            const msg = String(e);
            setDebugError(`${t(lang, "alert.error")}: ${msg}`);
            showError(`${t(lang, "alert.error")}: ${msg}`);
        }
    }, [lang, settings.setMusicFolder, player.setCurrentPath, player.setSelectedSong, player.setMetadata, setDebugError, showError]);

    const handlePickFolder = useCallback(async () => {
        if (!isBrowserTauri()) {
            setDebugError(t(lang, "alert.error"));
            showError(t(lang, "alert.error"));
            return;
        }
        if (player.isPlaying) {
            setPendingFolderChange(true);
            return;
        }
        await doPickFolder();
    }, [lang, player.isPlaying, doPickFolder, setDebugError, showError]);

    const handleResetAllSettings = useCallback(async () => {
        (window as unknown as { __symvoniaResetInProgress?: boolean }).__symvoniaResetInProgress = true;
        try {
            await resetAppConfig();
        } catch {}
        window.location.reload();
    }, []);

    const handlePickWallpaper = useCallback(async () => {
        if (!isBrowserTauri()) {
            setDebugError(t(lang, "alert.error"));
            showError(t(lang, "alert.error"));
            return;
        }
        try {
            const mod = await getTauri();
            const result = await mod.invoke<string | null>("pick_wallpaper");
            if (result) {
                settings.setDefaultWallpaper(result);
            }
        } catch (e) {
            const msg = String(e);
            setDebugError(`${t(lang, "alert.error")}: ${msg}`);
            showError(`${t(lang, "alert.error")}: ${msg}`);
        }
    }, [lang, settings.setDefaultWallpaper, setDebugError, showError]);

    const confirmFolderChange = useCallback(() => {
        setPendingFolderChange(false);
        player.resetPlayer();
        doPickFolder();
    }, [doPickFolder, player.resetPlayer]);

    const displayPath = player.currentPath || "";

    const showSkeleton = !settings.initialized;

    if (showSkeleton) {
        return (
            <div className="h-full flex flex-col overflow-hidden bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
                <FullInitSkeleton />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
            <HomeHeader
                lang={lang}
                isCompact={isCompact}
                musicFolder={settings.musicFolder}
                isPlaying={player.isPlaying}
                showLeftSidebar={showLeftSidebar}
                showRightSidebar={showRightSidebar}
                accentColor={settings.accentColor}
                onOpenStreaming={openStreaming}
                onOpenSettings={openSettings}
                onOpenEqualizer={isEqualizerInstalled ? openEqualizer : undefined}
                onOpenEditMetadata={isTagEditorInstalled ? openMetadataEdit : undefined}
                onToggleLeftSidebar={() => setShowLeftSidebar((v) => !v)}
                onToggleRightSidebar={() => setShowRightSidebar((v) => !v)}
                onGlobalContextMenu={showGlobalContextMenu}
            />

            <HomePlayerArea
                lang={lang}
                musicFolder={settings.musicFolder}
                isCompact={isCompact}
                showLeftSidebar={showLeftSidebar}
                showRightSidebar={showRightSidebar}
                files={player.files}
                loadingFiles={player.loadingFiles}
                selectedSong={player.selectedSong}
                metadata={player.metadata}
                coverDataUrl={player.coverDataUrl}
                displayPath={displayPath}
                currentTime={player.currentTime}
                duration={player.duration}
                isPlaying={player.isPlaying}
                shuffle={settings.shuffle}
                repeat={settings.repeat}
                volume={player.activeVolume}
                volumeStep={settings.volumeStep}
                volumeMode={settings.volumeMode}
                systemVolumeSynced={settings.systemVolumeSynced}
                systemMuted={settings.systemMuted}
                volumeLimit={settings.volumeLimit}
                gainBoost={player.gainBoost}
                minGainBoost={player.minGainBoost}
                maxGainBoost={player.maxGainBoost}
                setGainBoost={player.setGainBoost}
                gainBoostSupported={player.gainBoostSupported}
                resetSidebarToken={resetSidebarToken}
                accentColor={settings.accentColor}
                handlePickFolder={handlePickFolder}
                goUp={player.goUp}
                setCurrentPath={player.setCurrentPath}
                playSong={player.playSong}
                handleSeek={player.handleSeek}
                seekTo={player.seekTo}
                playPrev={player.playPrev}
                togglePlayPause={player.togglePlayPause}
                playNext={player.playNext}
                setShuffle={settings.setShuffleState}
                setRepeat={settings.setRepeatState}
                handleVolumeChange={player.handleVolumeChange}
                toggleSystemMute={player.toggleSystemMute}
                onGlobalContextMenu={showGlobalContextMenu}
                onCoverSaved={() => showStatusNotif('cover-saved')}
                onOpenEditMetadata={isTagEditorInstalled ? openMetadataEdit : undefined}
                runtime={player.runtime}
                fileSort={settings.fileSort}
                setFileSort={settings.setFileSortState}
                sortDir={settings.sortDir}
                setSortDir={settings.setSortDirState}
                onRefreshFolder={player.refreshFiles}
                layoutMode={settings.layoutMode}
                lyricsSearchOpen={lyricsSearchOpen}
                onOpenLyricsSearch={openLyricsSearch}
                onCloseLyricsSearch={closeLyricsSearch}
                aiLyricsModalOpen={aiLyricsModalOpen}
                onOpenAiLyricsModal={openAiLyricsModal}
                onCloseAiLyricsModal={closeAiLyricsModal}
                toolbarColumns={settings.toolbarColumns}
                onOpenToolbarEdit={openToolbarEdit}
            />


            <HomeModals
                lang={lang}
                setLang={settings.setLanguage}
                pendingFolderChange={pendingFolderChange}
                onConfirmFolderChange={confirmFolderChange}
                onCancelFolderChange={() => setPendingFolderChange(false)}
                settingsOpen={settingsOpen}
                onCloseSettings={closeSettings}
                isPlaying={player.isPlaying}
                musicFolder={settings.musicFolder}
                onChangeFolder={handlePickFolder}
                autoWallpaper={settings.autoWallpaper}
                setAutoWallpaper={settings.setAutoWallpaperState}
                resetOnClose={settings.resetOnClose}
                setResetOnClose={settings.setResetOnCloseState}
                volumeStep={settings.volumeStep}
                setVolumeStep={settings.setVolumeStep}
                volumeMode={settings.volumeMode}
                setVolumeMode={(v: string) =>
                    settings.setVolumeModeState(v as "app" | "system")
                }
                volumeLimit={settings.volumeLimit}
                setVolumeLimit={settings.handleVolumeLimitSetting}
                pauseIfMuted={settings.pauseIfMuted}
                setPauseIfMuted={settings.setPauseIfMuted}
                fadeAudio={settings.fadeAudio}
                setFadeAudio={settings.setFadeAudio}
                fadeDuration={settings.fadeDuration}
                setFadeDuration={settings.setFadeDuration}
                volume={player.activeVolume}
                defaultWallpaper={settings.defaultWallpaper}
                onPickWallpaper={handlePickWallpaper}
                onClearWallpaper={() => settings.setDefaultWallpaper(null)}
                wallpaperFitMode={settings.wallpaperFitMode}
                setWallpaperFitMode={settings.setWallpaperFitMode}
                wallpaperEffect={settings.wallpaperEffect}
                setWallpaperEffect={settings.setWallpaperEffect}
                wallpaperTransition={settings.wallpaperTransition}
                setWallpaperTransition={settings.setWallpaperTransition}
                outputDevice={settings.outputDevice}
                setOutputDevice={settings.setOutputDeviceState}
                outputMode={settings.outputMode}
                setOutputMode={settings.setOutputMode}
                autoFallbackHtmlAudio={settings.autoFallbackHtmlAudio}
                setAutoFallbackHtmlAudio={settings.setAutoFallbackHtmlAudio}
                folderSort={settings.folderSort}
                setFolderSort={settings.setFolderSortState}
                fileSort={settings.fileSort}
                setFileSort={settings.setFileSortState}
                sortDir={settings.sortDir}
                setSortDir={settings.setSortDirState}
                nameSource={settings.nameSource}
                setNameSource={settings.setNameSourceState}
                formats={settings.formats}
                setFormats={settings.setFormatsState}
                shortcuts={settings.shortcuts}
                updateShortcut={settings.updateShortcut}
                resetShortcuts={settings.resetShortcuts}
                accentColor={settings.accentColor}
                setAccentColor={settings.setAccentColorState}
                customAccentHex={settings.customAccentHex}
                setCustomAccentHex={settings.setCustomAccentHexState}
                layoutMode={settings.layoutMode}
                setLayoutMode={settings.setLayoutModeState}
                onResetSidebarWidth={() => setResetSidebarToken((t) => t + 1)}
                onResetAllSettings={handleResetAllSettings}
                logs={logs}
                onCheckUpdate={handleCheckUpdate}
                updateStatus={updateStatus}
                updateChecking={updateChecking}
                updateDownloaded={updateDownloaded}
                updateTotal={updateTotal}
                audioRuntime={player.runtime}
                onResetPlayer={player.resetPlayer}
                onRetryNativeAudio={player.retryNative}
                streamingOpen={streamingOpen}
                onCloseStreaming={closeStreaming}
            />

            <EqualizerModal
                isOpen={equalizerOpen}
                onClose={closeEqualizer}
                equalizer={player.equalizer}
                accentColor={settings.accentColor}
                lang={lang}
                disabled={(player.runtime.effectiveMode ?? settings.outputMode) !== 'html_audio'}
            />

            <MetadataEditModal
                isOpen={metadataEditOpen}
                onClose={closeMetadataEdit}
                selectedSong={editingTargetFile || player.selectedSong}
                metadata={editingTargetFile && editingTargetFile.path !== player.selectedSong?.path ? null : player.metadata}
                lang={lang}
                accentColor={settings.accentColor}
                onSaveSuccess={() => {
                    // Re-list current folder files and rebuild playlist queue
                    player.refreshFiles();

                    // If edited file is the active playing/selected song, reload its metadata
                    const activeSong = player.selectedSong;
                    const editedPath = editingTargetFile?.path || activeSong?.path;
                    if (activeSong && editedPath === activeSong.path) {
                        player.playSong(activeSong);
                    }
                    showStatusNotif('metadata-saved');
                }}
            />

            <ToolbarEditModal
                isOpen={toolbarEditOpen}
                onClose={closeToolbarEdit}
                toolbarColumns={settings.toolbarColumns}
                setToolbarColumns={settings.setToolbarColumns}
                accentColor={settings.accentColor}
                lang={lang}
            />

            <HomeAlerts
                lang={lang}
                toastVisible={toastVisible}
                debugError={debugError}
                onCloseToast={() => setToastVisible(false)}
                updateAlertInfo={autoUpdateInfo}
                updateAlertDownloading={autoUpdateDownloading}
                updateAlertProgress={autoUpdateProgress}
                updateAlertTotal={autoUpdateTotal}
                onUpdate={startAutoUpdateDownload}
                onRemindLater={dismissAutoUpdate}
                onStayCurrent={skipAutoUpdateVersion}
            />

            {globalContextMenu && (
                <ContextMenu
                    x={globalContextMenu.x}
                    y={globalContextMenu.y}
                    items={globalContextMenu.items}
                    onClose={hideGlobalContextMenu}
                />
            )}

            {/* Status Bar */}
            <div className="w-full h-6 bg-zinc-950/85 backdrop-blur-md border-t border-white/5 px-3 text-[11px] text-zinc-400 font-medium select-none flex items-center justify-between z-50 shrink-0 relative overflow-hidden">
                <div className="flex-1 min-w-0 overflow-hidden relative">
                    {hoverInfo && <StatusBarText text={hoverInfo} />}
                </div>
                {statusNotif && (
                    <div
                        className={`shrink-0 flex items-center gap-1.5 px-2 mx-2 rounded text-[10px] font-semibold whitespace-nowrap ${
                            statusNotif.type === 'volume-limit' || statusNotif.type === 'auto-fallback'
                                ? 'text-amber-300'
                                : 'text-emerald-400'
                        }`}
                    >
                        {statusNotif.type === 'volume-limit' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        ) : statusNotif.type === 'auto-fallback' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                        <span>{t(lang, statusNotif.msgKey, statusNotif.vars)}</span>
                    </div>
                )}
                <div className="flex items-center gap-3 shrink-0 text-zinc-600 text-[10px] uppercase tracking-wider font-semibold ml-3">
                    <span>v1.0.6</span>
                    <span className="h-2.5 w-px bg-zinc-800" />
                    <span>Symvonia</span>
                </div>
            </div>
        </div>
    );
}
