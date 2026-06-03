'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileEntry } from './FolderExplorer';
import { getAccent } from '../lib/colors';

export interface SongMetadata {
    title: string | null;
    artist: string | null;
    album: string | null;
    duration: number | null;
    cover_b64: string | null;
    cover_mime: string | null;
    genre: string | null;
    year: number | null;
    track_number: number | null;
    total_tracks: number | null;
    disc_number: number | null;
    total_discs: number | null;
    comment: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    channels: number | null;
}

interface PlayerPanelProps {
    metadata: SongMetadata | null;
    selectedSong: FileEntry | null;
    accentColor: string;
}

export default function PlayerPanel({ metadata, selectedSong, accentColor }: PlayerPanelProps) {
    const accent = getAccent(accentColor);
    const songTitle = selectedSong
        ? (metadata?.title || selectedSong.name.replace(/\.[^/.]+$/, ''))
        : 'No song selected';
    const songArtist = selectedSong ? (metadata?.artist || 'Unknown Artist') : '';
    const songAlbum = selectedSong ? (metadata?.album || null) : null;

    return (
        <div className="w-full flex flex-col items-center gap-6">
            <motion.div
                key={selectedSong?.path || 'no-song'}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.02 }}
                className="w-full aspect-square rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center ring-1 ring-white/5 cursor-pointer relative"
                style={{
                    boxShadow: selectedSong
                        ? `0 20px 60px -10px ${accent.hex500}15, 0 10px 30px -5px rgba(0,0,0,0.5)`
                        : '0 10px 30px -5px rgba(0,0,0,0.5)',
                }}
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
                        <motion.div
                            key="placeholder"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.15 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                            </svg>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <div className="text-center w-full px-4">
                <h2 className="text-xl font-semibold text-zinc-100 truncate">{songTitle}</h2>
                {selectedSong && (
                    <>
                        <p className={`text-sm mt-1.5 truncate ${accent.text400} opacity-80`}>{songArtist}</p>
                        {songAlbum && (
                            <p className="text-xs text-zinc-500 mt-0.5 truncate">{songAlbum}</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
