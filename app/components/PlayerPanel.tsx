'use client';

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
            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center shadow-2xl shadow-black/50 ring-1 ring-white/5">
                {metadata?.cover_b64 ? (
                    <img
                        src={`data:${metadata.cover_mime};base64,${metadata.cover_b64}`}
                        alt="Cover"
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <span className="text-8xl opacity-20">🎵</span>
                )}
            </div>

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
