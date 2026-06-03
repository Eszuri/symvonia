'use client';

import { motion } from 'framer-motion';
import { FileEntry } from './FolderExplorer';
import { getAccent } from '../lib/colors';

interface PlaybackControlsProps {
    selectedSong: FileEntry | null;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: 'off' | 'all' | 'one';
    playPrev: () => void;
    togglePlayPause: () => void;
    playNext: () => void;
    setShuffle: (v: boolean) => void;
    setRepeat: (v: 'off' | 'all' | 'one') => void;
    accentColor: string;
}

function ShuffleIcon({ active }: { active: boolean }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 18h6l4-6H2z" opacity={active ? 1 : 0.5} />
            <path d="M16 6h6l-4 6h-6z" opacity={active ? 1 : 0.5} />
            <path d="m16 6 2-2 2 2" />
            <path d="m2 18 2-2 2 2" />
            <path d="M8 12h8" />
        </svg>
    );
}

function RepeatIcon({ mode }: { mode: 'off' | 'all' | 'one' }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            {mode === 'one' && (
                <text x="12" y="14" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">1</text>
            )}
        </svg>
    );
}

export default function PlaybackControls({
    selectedSong,
    isPlaying,
    shuffle,
    repeat,
    playPrev,
    togglePlayPause,
    playNext,
    setShuffle,
    setRepeat,
    accentColor,
}: PlaybackControlsProps) {
    const accent = getAccent(accentColor);
    const hasSong = !!selectedSong;

    const cycleRepeat = () => {
        if (repeat === 'off') setRepeat('all');
        else if (repeat === 'all') setRepeat('one');
        else setRepeat('off');
    };

    return (
        <div className="flex items-center gap-4">
            <motion.button
                onClick={() => setShuffle(!shuffle)}
                disabled={!hasSong}
                whileHover={hasSong ? { scale: 1.1 } : {}}
                whileTap={hasSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors
                    ${shuffle ? `${accent.text400} ${accent.bg10}` : 'text-zinc-500 hover:text-zinc-300'}
                    disabled:opacity-30 disabled:cursor-default`}
                title={shuffle ? 'Shuffle: ON' : 'Shuffle: OFF'}
            >
                <ShuffleIcon active={shuffle} />
            </motion.button>

            <motion.button
                onClick={playPrev}
                disabled={!hasSong}
                whileHover={hasSong ? { scale: 1.1 } : {}}
                whileTap={hasSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
            </motion.button>

            <motion.button
                onClick={togglePlayPause}
                disabled={!hasSong}
                whileHover={hasSong ? { scale: 1.06 } : {}}
                whileTap={hasSong ? { scale: 0.94 } : {}}
                transition={{ duration: 0.12 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-zinc-950 cursor-pointer
                    ${hasSong ? `${accent.bg500} shadow-lg ${accent.shadow25}` : 'bg-zinc-800 text-zinc-600'}`}
                style={hasSong ? { boxShadow: `0 4px 20px ${accent.hex500}30` } : {}}
            >
                {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </motion.button>

            <motion.button
                onClick={playNext}
                disabled={!hasSong}
                whileHover={hasSong ? { scale: 1.1 } : {}}
                whileTap={hasSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
            </motion.button>

            <motion.button
                onClick={cycleRepeat}
                disabled={!hasSong}
                whileHover={hasSong ? { scale: 1.1 } : {}}
                whileTap={hasSong ? { scale: 0.9 } : {}}
                transition={{ duration: 0.12 }}
                className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors
                    ${repeat !== 'off' ? `${accent.text400} ${accent.bg10}` : 'text-zinc-500 hover:text-zinc-300'}
                    disabled:opacity-30 disabled:cursor-default`}
                title={`Repeat: ${repeat === 'off' ? 'OFF' : repeat === 'all' ? 'ALL' : 'ONE'}`}
            >
                <RepeatIcon mode={repeat} />
            </motion.button>
        </div>
    );
}
