"use client";

import { type ChangeEvent, useState } from "react";
import type { FileEntry } from "../FolderExplorer";
import type { SongMetadata } from "../PlayerPanel";
import { t, type Lang } from "../../lib/translations";
import SleepTimerMenu from '../SleepTimerMenu';
import type {SleepTimerControls} from '../../hooks/useSleepTimer';

interface SpotifyPlayerBarProps {
    sleepTimer: SleepTimerControls;
    lang: Lang;
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
    showRightSidebar: boolean;
    setShowRightSidebar: (v: boolean | ((prev: boolean) => boolean)) => void;
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

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SpotifyPlayerBar({
    sleepTimer,
    lang,
    selectedSong,
    metadata,
    coverDataUrl,
    currentTime,
    duration,
    isPlaying,
    shuffle,
    repeat,
    volume,
    accentColor,
    showRightSidebar,
    setShowRightSidebar,
    togglePlayPause,
    playNext,
    playPrev,
    handleSeek,
    setShuffle,
    setRepeat,
    handleVolumeChange,
    toggleSystemMute,
    onOpenEditMetadata,
}: SpotifyPlayerBarProps) {
    const [isLiked, setIsLiked] = useState(false);
    const [isHoveringSeek, setIsHoveringSeek] = useState(false);
    const [isHoveringVolume, setIsHoveringVolume] = useState(false);

    const title = metadata?.title || selectedSong?.name.replace(/\.[^/.]+$/, "") || t(lang, "player.noTrackSelected");
    const artist = metadata?.artist || (selectedSong ? t(lang, "player.unknownArtist") : "Symvonia");

    const safeTime = duration > 0 ? Math.min(duration, Math.max(0, currentTime)) : Math.max(0, currentTime);
    const seekPct = duration > 0 ? Math.min(100, Math.max(0, (safeTime / duration) * 100)) : 0;
    const volPct = Math.round(volume * 100);

    return (
        <footer className="w-full h-22 bg-black border-t border-zinc-850/80 px-4 flex items-center justify-between z-40 select-none shrink-0 gap-4">
            {/* 1. Left Section: Track Info & Cover Art */}
            <div className="flex items-center gap-2 sm:gap-3 w-1/4 min-w-[120px] sm:min-w-[180px] max-w-[320px]">
                <div className="relative group shrink-0 w-14 h-14 rounded-md overflow-hidden bg-zinc-900 border border-zinc-800 shadow-md">
                    {coverDataUrl ? (
                        <img
                            src={coverDataUrl}
                            alt="Cover"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-850 text-zinc-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </div>
                    )}
                </div>

                <div className="flex flex-col min-w-0 justify-center">
                    <div
                        className={`text-sm font-semibold text-zinc-100 truncate leading-snug ${onOpenEditMetadata ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                        title={title}
                        onClick={() => onOpenEditMetadata?.(selectedSong || undefined)}
                    >
                        {title}
                    </div>
                    <div
                        className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer truncate leading-snug"
                        title={artist}
                    >
                        {artist}
                    </div>
                </div>

                <button
                    onClick={() => setIsLiked(!isLiked)}
                    className={`ml-1 transition-colors p-1.5 hover:scale-105 active:scale-95 shrink-0 ${
                        isLiked ? "text-emerald-500" : "text-zinc-400 hover:text-white"
                    }`}
                    title={isLiked ? t(lang, 'spotify.unlike') : t(lang, 'spotify.like')}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill={isLiked ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                </button>
            </div>

            {/* 2. Center Section: Controls & Audio Timeline Bar */}
            <div className="flex flex-col items-center justify-center flex-1 max-w-[620px] gap-2">
                {/* Control Buttons */}
                <div className="flex items-center gap-4">
                    {/* Shuffle */}
                    <button
                        onClick={() => setShuffle(!shuffle)}
                        className={`transition-colors p-1.5 relative hover:scale-105 active:scale-95 ${
                            shuffle ? "text-emerald-500" : "text-zinc-400 hover:text-white"
                        }`}
                        title={shuffle ? t(lang, 'status.shuffleOff') : t(lang, 'status.shuffleOn')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
                            <path d="m18 2 4 4-4 4" />
                            <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
                            <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
                            <path d="m18 14 4 4-4 4" />
                        </svg>
                        {shuffle && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />}
                    </button>

                    {/* Previous */}
                    <button
                        onClick={playPrev}
                        disabled={!selectedSong}
                        className="text-zinc-400 hover:text-white disabled:opacity-30 transition-transform active:scale-90 p-1.5"
                        title={t(lang, 'status.prev')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                        </svg>
                    </button>

                    {/* Play/Pause Button */}
                    <button
                        onClick={togglePlayPause}
                        disabled={!selectedSong}
                        className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 shadow-lg"
                        title={isPlaying ? t(lang, 'status.pause') : t(lang, 'status.play')}
                    >
                        {isPlaying ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>

                    {/* Next */}
                    <button
                        onClick={playNext}
                        disabled={!selectedSong}
                        className="text-zinc-400 hover:text-white disabled:opacity-30 transition-transform active:scale-90 p-1.5"
                        title={t(lang, 'status.next')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                        </svg>
                    </button>

                    {/* Repeat */}
                    <button
                        onClick={() => {
                            if (repeat === "off") setRepeat("all");
                            else if (repeat === "all") setRepeat("one");
                            else setRepeat("off");
                        }}
                        className={`transition-colors p-1.5 relative hover:scale-105 active:scale-95 ${
                            repeat !== "off" ? "text-emerald-500" : "text-zinc-400 hover:text-white"
                        }`}
                        title={repeat === "one" ? t(lang, 'status.repeatOne') : repeat === "all" ? t(lang, 'status.repeatAll') : t(lang, 'status.repeatOff')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m17 2 4 4-4 4" />
                            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                            <path d="m7 22-4-4 4-4" />
                            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                        </svg>
                        {repeat !== "off" && (
                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center">
                                {repeat === "one" ? (
                                    <span className="text-[9px] font-bold text-emerald-500">1</span>
                                ) : (
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                                )}
                            </span>
                        )}
                    </button>
                    <SleepTimerMenu lang={lang} accentColor={accentColor} hasTrack={Boolean(selectedSong)} timer={sleepTimer} />
                </div>

                {/* Timeline Seekbar (Horizontal 3-part layout: Left Time + Bar + Right Time) */}
                <div className="w-full flex items-center gap-2.5 text-xs text-zinc-400 font-mono select-none">
                    <span className="w-10 text-right text-[11px] font-medium text-zinc-400">
                        {formatTime(safeTime)}
                    </span>

                    <div
                        className="relative flex-1 h-3 flex items-center cursor-pointer group"
                        onMouseEnter={() => setIsHoveringSeek(true)}
                        onMouseLeave={() => setIsHoveringSeek(false)}
                    >
                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                            <div
                                className={`h-full rounded-full transition-all duration-75 ${
                                    isHoveringSeek ? "bg-emerald-500" : "bg-zinc-200"
                                }`}
                                style={{ width: `${seekPct}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        {isHoveringSeek && (
                            <div
                                className="absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none"
                                style={{ left: `calc(${seekPct}% - 6px)` }}
                            />
                        )}
                    </div>

                    <span className="w-10 text-left text-[11px] font-medium text-zinc-400">
                        {duration > 0 ? formatTime(duration) : "0:00"}
                    </span>
                </div>
            </div>

            {/* 3. Right Section: Utility Tools & Volume Slider */}
            <div className="flex items-center justify-end gap-3 w-1/4 min-w-[180px] max-w-[320px]">
                {/* Now Playing Right Panel Toggle Button */}
                <button
                    onClick={() => setShowRightSidebar((prev) => !prev)}
                    className={`p-1.5 rounded-md hover:bg-zinc-800/80 transition-colors ${
                        showRightSidebar ? "text-emerald-500" : "text-zinc-400 hover:text-white"
                    }`}
                    title={t(lang, 'spotify.nowPlayingView')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" />
                        <path d="M15 3v18" />
                        <path d="m10 9 3 3-3 3" />
                    </svg>
                </button>

                {/* Compact Volume Control */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleSystemMute}
                        className="text-zinc-400 hover:text-white transition-colors p-1"
                        title={volume === 0 ? t(lang, 'status.unmute') : t(lang, 'status.mute')}
                    >
                        {volume === 0 ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="1" y1="1" x2="23" y2="23" />
                                <path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            </svg>
                        ) : volume < 0.5 ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        )}
                    </button>

                    <div
                        className="relative w-24 h-3 flex items-center cursor-pointer group"
                        onMouseEnter={() => setIsHoveringVolume(true)}
                        onMouseLeave={() => setIsHoveringVolume(false)}
                    >
                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden relative">
                            <div
                                className={`h-full rounded-full transition-all duration-75 ${
                                    isHoveringVolume ? "bg-emerald-500" : "bg-zinc-200"
                                }`}
                                style={{ width: `${volPct}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        {isHoveringVolume && (
                            <div
                                className="absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none"
                                style={{ left: `calc(${volPct}% - 6px)` }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </footer>
    );
}
