"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import SpotifyLibrarySidebar from "./SpotifyLibrarySidebar";
import SpotifyMainSection from "./SpotifyMainSection";
import SpotifyNowPlayingPanel from "./SpotifyNowPlayingPanel";
import SpotifyPlayerBar from "./SpotifyPlayerBar";
import type { FileEntry } from "../FolderExplorer";
import type { SongMetadata } from "../PlayerPanel";
import type { Lang } from "../../lib/translations";
import type {SleepTimerControls} from '../../hooks/useSleepTimer';

interface SpotifyLayoutProps {
    sleepTimer: SleepTimerControls;
    lang: Lang;
    musicFolder: string | null;
    displayPath: string;
    files: FileEntry[];
    selectedSong: FileEntry | null;
    metadata: SongMetadata | null;
    coverDataUrl: string | null;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: "off" | "all" | "one";
    volume: number;
    volumeStep: number;
    volumeMode: "app" | "system";
    systemMuted: boolean;
    volumeLimit: number;
    accentColor: string;
    handlePickFolder: () => void;
    goUp: () => void;
    setCurrentPath: (path: string) => void;
    playSong: (file: FileEntry) => void;
    togglePlayPause: () => void;
    playNext: () => void;
    playPrev: () => void;
    handleSeek: (e: ChangeEvent<HTMLInputElement>) => void;
    seekTo?: (timeSec: number) => void;
    setShuffle: (v: boolean) => void;
    setRepeat: (v: "off" | "all" | "one") => void;
    handleVolumeChange: (e: ChangeEvent<HTMLInputElement>) => void;
    toggleSystemMute: () => void;
    onOpenEditMetadata?: (file?: FileEntry) => void;
}

export default function SpotifyLayout({
    sleepTimer,
    lang,
    musicFolder,
    displayPath,
    files,
    selectedSong,
    metadata,
    coverDataUrl,
    currentTime,
    duration,
    isPlaying,
    shuffle,
    repeat,
    volume,
    volumeStep,
    volumeMode,
    systemMuted,
    volumeLimit,
    accentColor,
    handlePickFolder,
    goUp,
    setCurrentPath,
    playSong,
    togglePlayPause,
    playNext,
    playPrev,
    handleSeek,
    seekTo,
    setShuffle,
    setRepeat,
    handleVolumeChange,
    toggleSystemMute,
    onOpenEditMetadata,
}: SpotifyLayoutProps) {
    const [showRightSidebar, setShowRightSidebar] = useState(true);

    return (
        <div className="flex flex-col h-full w-full bg-black text-zinc-100 font-sans overflow-hidden p-1.5 sm:p-2 gap-1.5 sm:gap-2 select-none relative">
            {/* Top Container: 3 Panels */}
            <div className="flex-1 flex gap-1.5 sm:gap-2 min-h-0 min-w-0 overflow-hidden relative">
                {/* Left Panel: Spotify Your Library Sidebar */}
                <SpotifyLibrarySidebar
                    lang={lang}
                    musicFolder={musicFolder}
                    displayPath={displayPath}
                    files={files}
                    selectedSong={selectedSong}
                    handlePickFolder={handlePickFolder}
                    setCurrentPath={setCurrentPath}
                    playSong={playSong}
                />

                {/* Center Panel: Spotify Main View & Tracklist */}
                <SpotifyMainSection
                    lang={lang}
                    files={files}
                    selectedSong={selectedSong}
                    metadata={metadata}
                    displayPath={displayPath}
                    isPlaying={isPlaying}
                    goUp={goUp}
                    setCurrentPath={setCurrentPath}
                    playSong={playSong}
                    togglePlayPause={togglePlayPause}
                />

                {/* Right Panel: Spotify Now Playing View (Visible in side-by-side only on large screens xl:, otherwise floating overlay when enabled) */}
                {showRightSidebar && (
                    <div className="max-xl:absolute max-xl:right-2 max-xl:top-0 max-xl:bottom-0 max-xl:z-50 max-xl:shadow-2xl h-full">
                        <SpotifyNowPlayingPanel
                            lang={lang}
                            selectedSong={selectedSong}
                            metadata={metadata}
                            coverDataUrl={coverDataUrl}
                            files={files}
                            onClose={() => setShowRightSidebar(false)}
                            onOpenEditMetadata={onOpenEditMetadata}
                        />
                    </div>
                )}
            </div>

            {/* Bottom Container: Spotify Player Bar */}
            <SpotifyPlayerBar
                sleepTimer={sleepTimer}
                lang={lang}
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
                showRightSidebar={showRightSidebar}
                setShowRightSidebar={setShowRightSidebar}
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
        </div>
    );
}
