'use client';

import {FileEntry} from './FolderExplorer';

interface PlaybackControlsProps {
    selectedSong: FileEntry | null;
    isPlaying: boolean;
    playPrev: () => void;
    togglePlayPause: () => void;
    playNext: () => void;
}

export default function PlaybackControls({
    selectedSong,
    isPlaying,
    playPrev,
    togglePlayPause,
    playNext,
}: PlaybackControlsProps) {
    return (
        <div className="flex items-center gap-6">
            <button
                onClick={playPrev}
                disabled={!selectedSong}
                className="text-zinc-400 hover:text-zinc-100 transition-colors text-2xl disabled:opacity-30 cursor-pointer"
            >
                ⏮
            </button>
            <button
                onClick={togglePlayPause}
                disabled={!selectedSong}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 disabled:bg-zinc-800
                  disabled:text-zinc-600 text-zinc-950 flex items-center justify-center text-2xl
                  transition-all shadow-lg shadow-green-500/25 disabled:shadow-none cursor-pointer"
            >
                {isPlaying ? '⏸' : '▶'}
            </button>
            <button
                onClick={playNext}
                disabled={!selectedSong}
                className="text-zinc-400 hover:text-zinc-100 transition-colors text-2xl disabled:opacity-30 cursor-pointer"
            >
                ⏭
            </button>
        </div>
    );
}
