"use client";

import {AnimatePresence, motion} from "framer-motion";
import {
    memo,
    useCallback,
    useState,
    useEffect,
    useRef,
    type ChangeEvent,
} from "react";
import FolderExplorer, {FileEntry} from "../FolderExplorer";
import PlayerPanel, {SongMetadata} from "../PlayerPanel";
import type {PlaybackRuntimeInfo} from '../../hooks/audio/playbackTypes';
import SeekBar from "../SeekBar";
import PlaybackControls from "../PlaybackControls";
import type {SleepTimerControls} from '../../hooks/useSleepTimer';
import VolumeControl from "../VolumeControl";
import GainBoostControl from "../GainBoostControl";
import MetadataPanel from "../MetadataPanel";
import AutoHideTimerMenu from "../AutoHideTimerMenu";
import {EmptyFolderState, NoFolderEmptyState} from "./HomeEmptyStates";
import ContextMenu, {type ContextMenuItem} from "../ContextMenu";
import {EditIcon} from "../icons";
import {getTauri} from "../../lib/homeState";
import {getStoredValue, setStoredValue} from "../../lib/storage";
import SpotifyLayout from "../layout/SpotifyLayout";
import {t, type Lang} from "../../lib/translations";
import {contentMotion} from "../../lib/animations";

interface HomePlayerAreaProps {
    sleepTimer: SleepTimerControls;
    lang: Lang;
    layoutMode?: 'default' | 'spotify';
    musicFolder: string | null;
    isCompact: boolean;
    showLeftSidebar: boolean;
    showRightSidebar: boolean;
    files: FileEntry[];
    loadingFiles: boolean;
    selectedSong: FileEntry | null;
    metadata: SongMetadata | null;
    coverDataUrl: string | null;
    displayPath: string;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: "off" | "all" | "one";
    volume: number;
    volumeStep: number;
    volumeMode: "app" | "system";
    systemVolumeSynced: boolean;
    systemMuted: boolean;
    volumeLimit: number;
    gainBoost: number;
    minGainBoost: number;
    maxGainBoost: number;
    setGainBoost: (v: number) => void;
    gainBoostSupported: boolean;
    resetSidebarToken: number;
    accentColor: string;
    handlePickFolder: () => void;
    goUp: () => void;
    setCurrentPath: (path: string) => void;
    playSong: (file: FileEntry, startAt?: number) => void;
    handleSeek: (e: ChangeEvent<HTMLInputElement>) => void;
    seekTo?: (timeSec: number) => void;
    playPrev: () => void;
    togglePlayPause: () => void;
    playNext: () => void;
    setShuffle: (v: boolean) => void;
    setRepeat: (v: "off" | "all" | "one") => void;
    handleVolumeChange: (e: ChangeEvent<HTMLInputElement>) => void;
    toggleSystemMute: () => void;
    onGlobalContextMenu: (e: React.MouseEvent) => void;
    onCoverSaved: () => void;
    onOpenEditMetadata?: (file?: FileEntry) => void;
    runtime?: PlaybackRuntimeInfo;
    fileSort?: string;
    setFileSort?: (v: string) => void;
    sortDir?: string;
    setSortDir?: (v: string) => void;
    onRefreshFolder?: () => void;
    lyricsSearchOpen?: boolean;
    onOpenLyricsSearch?: () => void;
    onCloseLyricsSearch?: () => void;
    aiLyricsModalOpen?: boolean;
    onOpenAiLyricsModal?: () => void;
    onCloseAiLyricsModal?: () => void;
    toolbarColumns?: string[];
    onOpenToolbarEdit?: () => void;
}


async function openDevTools() {
    try {
        const mod = await getTauri();
        await mod.invoke("open_devtools");
    } catch {
        // not in Tauri
    }
}

function appendDevTools(
    items: ContextMenuItem[],
    lang: Lang,
): ContextMenuItem[] {
    return [
        ...(items.length > 0 ? [{separator: true} as ContextMenuItem] : []),
        {
            label: t(lang, "contextMenu.openDevTools"),
            icon: (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                </svg>
            ),
            onClick: openDevTools,
        },
    ];
}

function HomePlayerArea({
    sleepTimer,
    lang,
    musicFolder,
    isCompact,
    showLeftSidebar,
    showRightSidebar,
    files,
    loadingFiles,
    selectedSong,
    metadata,
    coverDataUrl,
    displayPath,
    currentTime,
    duration,
    isPlaying,
    shuffle,
    repeat,
    volume,
    volumeStep,
    volumeMode,
    systemVolumeSynced,
    systemMuted,
    volumeLimit,
    gainBoost,
    minGainBoost,
    maxGainBoost,
    setGainBoost,
    gainBoostSupported,
    resetSidebarToken,
    accentColor,
    handlePickFolder,
    goUp,
    setCurrentPath,
    playSong,
    handleSeek,
    seekTo,
    playPrev,
    togglePlayPause,
    playNext,
    setShuffle,
    setRepeat,
    handleVolumeChange,
    toggleSystemMute,
    onGlobalContextMenu,
    onCoverSaved,
    onOpenEditMetadata,
    runtime,
    fileSort,
    setFileSort,
    sortDir,
    setSortDir,
    onRefreshFolder,
    lyricsSearchOpen,
    onOpenLyricsSearch,
    onCloseLyricsSearch,
    aiLyricsModalOpen,
    onOpenAiLyricsModal,
    onCloseAiLyricsModal,
    toolbarColumns,
    onOpenToolbarEdit,
    layoutMode = 'default',
}: HomePlayerAreaProps) {
    const leftVisible = showLeftSidebar || !isCompact;
    const rightVisible = showRightSidebar || !isCompact;

    const mainWidthClass =
        !leftVisible && !rightVisible
            ? "max-lg:flex-1"
            : leftVisible !== rightVisible
                ? "max-lg:w-1/2 max-lg:flex-none max-lg:min-w-0"
                : "max-lg:w-[320px] max-lg:flex-none max-lg:min-w-0";

    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        items: ContextMenuItem[];
    } | null>(null);
    const [isFullScreenAlbum, setIsFullScreenAlbum] = useState(() => getStoredValue('fullscreen', false));
    const [controlsVisible, setControlsVisible] = useState(true);
    const [hideDelayMs, setHideDelayMs] = useState(() => getStoredValue('autohide_delay_ms', 3000));
    const controlsHoverRef = useRef(false);
    const sleepTimerOpenRef = useRef(false);
    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

    const updateHideDelayMs = useCallback((val: number) => {
        setHideDelayMs(val);
        setStoredValue('autohide_delay_ms', val);
    }, []);

    const triggerControlsVisibility = useCallback(() => {
        setControlsVisible(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;

        if (hideDelayMs === 0 || sleepTimerOpenRef.current) return;

        hideTimerRef.current = setTimeout(() => {
            if (!controlsHoverRef.current && !sleepTimerOpenRef.current && isFullScreenAlbum && selectedSong) {
                setControlsVisible(false);
            }
        }, hideDelayMs);
    }, [isFullScreenAlbum, hideDelayMs, selectedSong]);

    const handleSleepTimerOpenChange = useCallback((open: boolean) => {
        sleepTimerOpenRef.current = open;
        triggerControlsVisibility();
    }, [triggerControlsVisibility]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (isFullScreenAlbum) {
                triggerControlsVisibility();
            } else {
                setControlsVisible(true);
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }
        });
        return () => {
            cancelAnimationFrame(frame);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, [isFullScreenAlbum, triggerControlsVisibility]);

    const hideContextMenu = useCallback(() => setContextMenu(null), []);

    // Album/cover art context menu
    const showAlbumMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!metadata?.cover_b64) return;
            e.preventDefault();
            e.stopPropagation();
            const items: ContextMenuItem[] = [
                {
                    label: t(lang, "contextMenu.fullScreenAlbum"),
                    icon: (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                    ),
                    onClick: () =>
                        setIsFullScreenAlbum((prev) => {
                            const next = !prev;
                            setStoredValue('fullscreen', next);
                            return next;
                        }),
                    active: isFullScreenAlbum,
                    badge: isFullScreenAlbum ? "ON" : undefined,
                },
                {
                    label: t(lang, "contextMenu.saveImage"),
                    icon: (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    ),
                    onClick: async () => {
                        try {
                            const mod = await getTauri();
                            await mod.invoke("save_cover_image", {
                                coverB64: metadata.cover_b64,
                                mime: metadata.cover_mime,
                            });
                            onCoverSaved();
                        } catch {
                            // not in Tauri
                        }
                    },
                },
            ];
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [...items, ...appendDevTools(items, lang)],
            });
        },
        [lang, metadata, isFullScreenAlbum, onCoverSaved],
    );

    // Folder context menu
    const showFolderMenu = useCallback(
        (e: React.MouseEvent, file: FileEntry) => {
            if (!file.is_dir) return;
            e.preventDefault();
            e.stopPropagation();
            const items: ContextMenuItem[] = [
                {
                    label: t(lang, "contextMenu.openFolder"),
                    icon: (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                    ),
                    onClick: () => setCurrentPath(file.path),
                },
            ];
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [...items, ...appendDevTools(items, lang)],
            });
        },
        [lang, setCurrentPath],
    );

    // Audio file context menu
    const showFileMenu = useCallback(
        (e: React.MouseEvent, file: FileEntry) => {
            if (file.is_dir) return;
            e.preventDefault();
            e.stopPropagation();
            const isCurrentSong = selectedSong?.path === file.path;
            const items: ContextMenuItem[] = [
                {
                    label: t(lang, "contextMenu.playSong"),
                    icon: (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                    ),
                    onClick: () => playSong(file),
                    disabled: isCurrentSong && isPlaying,
                },
                {
                    label: t(lang, "contextMenu.copyPath"),
                    icon: (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    ),
                    onClick: () => {
                        try {
                            navigator.clipboard.writeText(file.path);
                        } catch {
                            // clipboard not available
                        }
                    },
                },
                {
                    label: t(lang, "contextMenu.editMetadata"),
                    icon: <EditIcon size={14} />,
                    disabled: !onOpenEditMetadata,
                    onClick: () => {
                        if (onOpenEditMetadata) {
                            onOpenEditMetadata(file);
                        }
                    },
                },
            ];
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [...items, ...appendDevTools(items, lang)],
            });
        },
        [lang, selectedSong, isPlaying, playSong, onOpenEditMetadata],
    );

    if (layoutMode === 'spotify') {
        return (
            <SpotifyLayout
                sleepTimer={sleepTimer}
                lang={lang}
                musicFolder={musicFolder}
                displayPath={displayPath}
                files={files}
                selectedSong={selectedSong}
                metadata={metadata}
                coverDataUrl={coverDataUrl}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                shuffle={shuffle}
                repeat={repeat}
                volume={volume}
                volumeStep={volumeStep}
                volumeMode={volumeMode}
                systemMuted={systemMuted}
                volumeLimit={volumeLimit}
                accentColor={accentColor}
                handlePickFolder={handlePickFolder}
                goUp={goUp}
                setCurrentPath={setCurrentPath}
                playSong={playSong}
                togglePlayPause={togglePlayPause}
                playNext={playNext}
                playPrev={playPrev}
                handleSeek={handleSeek}
                seekTo={seekTo}
                setShuffle={setShuffle}
                setRepeat={setRepeat}
                handleVolumeChange={handleVolumeChange}
                toggleSystemMute={toggleSystemMute}
                onOpenEditMetadata={onOpenEditMetadata}
            />
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
                {!musicFolder ? (
                    <motion.div
                        key="no-folder"
                        {...contentMotion}
                        className="flex-1"
                    >
                        <NoFolderEmptyState
                            lang={lang}
                            onPickFolder={handlePickFolder}
                            accentColor={accentColor}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="player-area"
                        {...contentMotion}
                        className="flex flex-1 overflow-hidden"
                    >
                        {/* Left sidebar — global context menu on empty areas */}
                        <AnimatePresence>
                            {(showLeftSidebar || !isCompact) && (
                                <motion.aside
                                    initial={isCompact ? {width: 0, opacity: 0} : false}
                                    animate={{width: "auto", opacity: 1}}
                                    exit={{width: 0, opacity: 0}}
                                    transition={{duration: 0.2}}
                                    className="flex shrink-0 overflow-hidden max-lg:flex-1 max-lg:min-w-0"
                                >
                                    <FolderExplorer
                                        lang={lang}
                                        files={files}
                                        loading={loadingFiles}
                                        selectedSong={selectedSong}
                                        playingAncestorPrefix={selectedSong?.path ?? null}
                                        displayPath={displayPath}
                                        goUp={goUp}
                                        setCurrentPath={setCurrentPath}
                                        playSong={playSong}
                                        onChangeFolder={handlePickFolder}
                                        onRefreshFolder={onRefreshFolder}
                                        musicFolder={musicFolder}
                                        resetSidebarToken={resetSidebarToken}
                                        accentColor={accentColor}
                                        fileSort={fileSort}
                                        setFileSort={setFileSort}
                                        sortDir={sortDir}
                                        setSortDir={setSortDir}
                                        toolbarColumns={toolbarColumns}
                                        onOpenToolbarEdit={onOpenToolbarEdit}
                                        onContextDir={showFolderMenu}
                                        onContextFile={showFileMenu}
                                        onGlobalContextMenu={onGlobalContextMenu}
                                    />
                                </motion.aside>
                            )}
                        </AnimatePresence>

                        {/* Main player area — global context menu */}
                        <main
                            onContextMenu={onGlobalContextMenu}
                            className={`flex flex-col items-center justify-center overflow-x-hidden ${isFullScreenAlbum ? "overflow-y-hidden" : "overflow-y-auto"} ${mainWidthClass} flex-1 min-w-0 h-full relative`}
                        >
                            <AnimatePresence>
                                {isFullScreenAlbum &&
                                    coverDataUrl &&
                                    files.length > 0 && (
                                        <motion.div
                                            {...contentMotion}
                                            className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
                                        >
                                            <img
                                                onContextMenu={showAlbumMenu}
                                                src={coverDataUrl}
                                                className="w-full h-full object-contain pointer-events-auto"
                                                alt={t(lang, 'player.cover')}
                                            />
                                        </motion.div>
                                    )}
                            </AnimatePresence>

                            <div
                                className={`flex flex-col items-center w-full h-full z-10 pointer-events-none ${isFullScreenAlbum ? "lg:p-4" : "p-2 sm:p-4 md:p-6"}`}
                            >
                                {files.length === 0 && !selectedSong && !loadingFiles ? (
                                    <div className="pointer-events-auto h-full flex flex-col justify-center w-full">
                                        {!musicFolder ? (
                                            <NoFolderEmptyState lang={lang} onPickFolder={handlePickFolder} accentColor={accentColor} />
                                        ) : (
                                            <EmptyFolderState lang={lang} folder={displayPath} />
                                        )}
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={false}
                                        animate={{
                                            y: isFullScreenAlbum && !controlsVisible ? 20 : 0,
                                        }}
                                        transition={{
                                            y: {duration: 0.4},
                                        }}
                                        onMouseEnter={() => {
                                            controlsHoverRef.current = true;
                                            triggerControlsVisibility();
                                        }}
                                        onMouseLeave={() => {
                                            controlsHoverRef.current = false;
                                            triggerControlsVisibility();
                                        }}
                                        onMouseMove={triggerControlsVisibility}
                                        className={`flex flex-col items-center justify-center gap-2.5 sm:gap-4 w-full min-w-0 pointer-events-auto relative will-change-opacity transform-gpu ${isFullScreenAlbum ? "mt-auto lg:max-w-2xl lg:mb-4 lg:p-4 lg:sm:p-6" : "my-auto py-1 max-w-2xl"}`}
                                    >
                                        {isFullScreenAlbum && (
                                            <motion.div
                                                initial={false}
                                                animate={{
                                                    opacity:
                                                        isFullScreenAlbum && !controlsVisible ? 0 : 1,
                                                }}
                                                transition={{opacity: {duration: 0.1}}}
                                            >
                                                <AutoHideTimerMenu
                                                    lang={lang}
                                                    hideDelayMs={hideDelayMs}
                                                    setHideDelayMs={updateHideDelayMs}
                                                    accentColor={accentColor}
                                                    disabled={!selectedSong}
                                                />
                                            </motion.div>
                                        )}
                                        <motion.div
                                            initial={false}
                                            animate={{
                                                opacity: isFullScreenAlbum && !controlsVisible ? 0 : 1,
                                            }}
                                            transition={{opacity: {duration: 0.4}}}
                                            className={`w-full will-change-transform transform-gpu ${isFullScreenAlbum ? "bg-black/40 backdrop-blur-xl border-t border-white/10 lg:border lg:rounded-3xl p-4 sm:p-6 lg:shadow-2xl flex flex-col items-center gap-4 transition-all duration-500" : "flex flex-col items-center w-full gap-2.5 sm:gap-4"}`}
                                        >
                                            <PlayerPanel
                                                lang={lang}
                                                metadata={metadata}
                                                selectedSong={selectedSong}
                                                accentColor={accentColor}
                                                coverDataUrl={coverDataUrl}
                                                onContextMenu={showAlbumMenu}
                                                hideCover={isFullScreenAlbum}
                                                runtime={runtime}
                                            />
                                            <div className="w-full px-2">
                                                <SeekBar
                                                    lang={lang}
                                                    currentTime={selectedSong ? currentTime : 0}
                                                    duration={selectedSong ? duration : 0}
                                                    handleSeek={handleSeek}
                                                    accentColor={accentColor}
                                                />
                                            </div>
                                            <div className="w-full flex justify-center mt-2">
                                                <PlaybackControls
                                                    sleepTimer={sleepTimer}
                                                    onSleepTimerOpenChange={handleSleepTimerOpenChange}
                                                    lang={lang}
                                                    selectedSong={selectedSong}
                                                    isPlaying={selectedSong ? isPlaying : false}
                                                    shuffle={shuffle}
                                                    repeat={repeat}
                                                    playPrev={playPrev}
                                                    togglePlayPause={togglePlayPause}
                                                    playNext={playNext}
                                                    setShuffle={setShuffle}
                                                    setRepeat={setRepeat}
                                                    accentColor={accentColor}
                                                />
                                            </div>
                                            <div className="w-full flex justify-center mt-1">
                                                <VolumeControl
                                                    lang={lang}
                                                    volume={volume}
                                                    volumeStep={volumeStep}
                                                    volumeMode={volumeMode}
                                                    systemVolumeSynced={systemVolumeSynced}
                                                    systemMuted={systemMuted}
                                                    volumeLimit={volumeLimit}
                                                    handleVolumeChange={handleVolumeChange}
                                                    onToggleSystemMute={toggleSystemMute}
                                                    accentColor={accentColor}
                                                    isExclusiveMode={runtime?.requestedMode === 'wasapi_exclusive' || runtime?.effectiveMode === 'wasapi_exclusive'}
                                                />
                                            </div>
                                            <div className="w-full flex justify-center mt-1">
                                                <GainBoostControl
                                                    gain={gainBoost}
                                                    minGain={minGainBoost}
                                                    maxGain={maxGainBoost}
                                                    setGain={setGainBoost}
                                                    supported={gainBoostSupported}
                                                    accentColor={accentColor}
                                                    lang={lang}
                                                    disabled={runtime?.effectiveMode !== 'html_audio'}
                                                />
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </div>
                        </main>

                        {/* Right sidebar — global context menu on empty areas */}
                        <AnimatePresence>
                            {(showRightSidebar || !isCompact) && (
                                <motion.aside
                                    onContextMenu={onGlobalContextMenu}
                                    initial={isCompact ? {width: 0, opacity: 0} : false}
                                    animate={{width: "auto", opacity: 1}}
                                    exit={{width: 0, opacity: 0}}
                                    transition={{duration: 0.2}}
                                    className="flex shrink-0 overflow-hidden max-lg:flex-1 max-lg:min-w-0"
                                >
                                    <MetadataPanel
                                        lang={lang}
                                        selectedSong={selectedSong}
                                        metadata={metadata}
                                        accentColor={accentColor}
                                        coverDataUrl={coverDataUrl}
                                        resetSidebarToken={resetSidebarToken}
                                        onContextMenu={showAlbumMenu}
                                        currentTime={currentTime}
                                        onSeek={seekTo}
                                        lyricsSearchOpen={lyricsSearchOpen}
                                        onOpenLyricsSearch={onOpenLyricsSearch}
                                        onCloseLyricsSearch={onCloseLyricsSearch}
                                        aiLyricsModalOpen={aiLyricsModalOpen}
                                        onOpenAiLyricsModal={onOpenAiLyricsModal}
                                        onCloseAiLyricsModal={onCloseAiLyricsModal}
                                    />

                                </motion.aside>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Local context menus for specific elements (album, folder, file) */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={hideContextMenu}
                />
            )}
        </div>
    );
}

export default memo(HomePlayerArea);
