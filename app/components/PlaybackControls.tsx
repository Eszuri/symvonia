'use client';

import { motion } from 'framer-motion';
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
            <motion.button
                onClick={playPrev}
                disabled={!selectedSong}
                whileHover={selectedSong ? { scale: 1.1 } : {}}
                whileTap={selectedSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className="text-zinc-400 hover:text-zinc-100 text-2xl disabled:opacity-30 cursor-pointer"
            >
                ⏮
            </motion.button>
            <motion.button
                onClick={togglePlayPause}
                disabled={!selectedSong}
                whileHover={selectedSong ? { scale: 1.06 } : {}}
                whileTap={selectedSong ? { scale: 0.94 } : {}}
                transition={{ duration: 0.12 }}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 disabled:bg-zinc-800
                  disabled:text-zinc-600 text-zinc-950 flex items-center justify-center text-2xl
                  shadow-lg shadow-green-500/25 disabled:shadow-none cursor-pointer"
            >
                {isPlaying ? '⏸' : '▶'}
            </motion.button>
            <motion.button
                onClick={playNext}
                disabled={!selectedSong}
                whileHover={selectedSong ? { scale: 1.1 } : {}}
                whileTap={selectedSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className="text-zinc-400 hover:text-zinc-100 text-2xl disabled:opacity-30 cursor-pointer"
            >
                ⏭
            </motion.button>
        </div>
    );
}
