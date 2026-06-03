'use client';

import { motion } from 'framer-motion';
import {FileEntry} from './FolderExplorer';
import { getAccent } from '../lib/colors';

interface PlaybackControlsProps {
    selectedSong: FileEntry | null;
    isPlaying: boolean;
    playPrev: () => void;
    togglePlayPause: () => void;
    playNext: () => void;
    accentColor: string;
}

export default function PlaybackControls({
    selectedSong,
    isPlaying,
    playPrev,
    togglePlayPause,
    playNext,
    accentColor,
}: PlaybackControlsProps) {
    const accent = getAccent(accentColor);
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
                className={`w-14 h-14 rounded-full ${accent.bg500} ${accent.bg400.replace('bg-', 'hover:bg-')} disabled:bg-zinc-800
                  disabled:text-zinc-600 text-zinc-950 flex items-center justify-center text-2xl
                  shadow-lg ${accent.shadow25} disabled:shadow-none cursor-pointer`}
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
