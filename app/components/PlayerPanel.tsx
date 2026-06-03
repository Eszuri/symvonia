'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {FileEntry} from './FolderExplorer';

export interface SongMetadata {
    title: string | null;
    artist: string | null;
    album: string | null;
    duration: number | null;
    cover_b64: string | null;
    cover_mime: string | null;
}

interface PlayerPanelProps {
    metadata: SongMetadata | null;
    selectedSong: FileEntry | null;
}

export default function PlayerPanel({metadata, selectedSong}: PlayerPanelProps) {
    const songTitle = selectedSong
        ? (metadata?.title || selectedSong.name.replace(/\.[^/.]+$/, ''))
        : 'No song selected';
    const songArtist = selectedSong ? (metadata?.artist || 'Unknown Artist') : '';
    const songAlbum = selectedSong ? (metadata?.album || null) : null;

    return (
        <div className="w-full flex flex-col items-center gap-5">
            {/* Cover */}
            <motion.div
                key={selectedSong?.path || 'no-song'}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.02 }}
                className="w-full aspect-square rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center shadow-2xl shadow-black/50 ring-1 ring-white/5 cursor-pointer"
            >
                <AnimatePresence mode="wait">
                    {metadata?.cover_b64 ? (
                        <motion.img
                            key={selectedSong?.path}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            src={`data:${metadata.cover_mime};base64,${metadata.cover_b64}`}
                            alt="Cover"
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <motion.span
                            key="placeholder"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.2 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="text-8xl"
                        >
                            🎵
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Metadata below cover */}
            <div className="text-center w-full px-2">
                <h2 className="text-xl font-semibold text-zinc-100 wrap-break-word">{songTitle}</h2>
                {selectedSong && (
                    <>
                        <p className="text-sm text-zinc-400 mt-1.5 wrap-break-word">{songArtist}</p>
                        {songAlbum && (
                            <p className="text-sm text-zinc-500 mt-0.5 wrap-break-word">{songAlbum}</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
