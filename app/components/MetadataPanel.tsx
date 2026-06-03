'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileEntry } from './FolderExplorer';
import { SongMetadata } from './PlayerPanel';
import { getAccent } from '../lib/colors';

interface MetadataPanelProps {
    selectedSong: FileEntry | null;
    metadata: SongMetadata | null;
    accentColor: string;
    resetSidebarToken: number;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 320;
const STORAGE_KEY = 'music-app-meta-width';

function loadSavedWidth(): number {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const v = bytes / Math.pow(1024, i);
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">{label}</span>
            <span className={`text-sm ${value === '—' ? 'text-zinc-600' : 'text-zinc-200'} truncate`} title={value}>
                {value}
            </span>
        </div>
    );
}

function SectionTitle({ title }: { title: string }) {
    return <h4 className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase mt-5 first:mt-0 mb-2.5">{title}</h4>;
}

function channelsLabel(ch: number | null): string {
    if (ch === null) return '—';
    if (ch === 1) return 'Mono';
    if (ch === 2) return 'Stereo';
    return `${ch} ch`;
}

export default function MetadataPanel({ selectedSong, metadata, accentColor, resetSidebarToken }: MetadataPanelProps) {
    const accent = getAccent(accentColor);
    const songTitle = selectedSong
        ? (metadata?.title || selectedSong.name.replace(/\.[^/.]+$/, ''))
        : null;

    const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(DEFAULT_WIDTH);

    useEffect(() => {
        setWidth(loadSavedWidth());
    }, []);

    useEffect(() => {
        if (resetSidebarToken === 0) return;
        setWidth(DEFAULT_WIDTH);
        window.localStorage.removeItem(STORAGE_KEY);
    }, [resetSidebarToken]);

    useEffect(() => {
        if (width === DEFAULT_WIDTH) return;
        window.localStorage.setItem(STORAGE_KEY, String(width));
    }, [width]);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startXRef.current - e.clientX;
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
        setWidth(next);
    }, []);

    const onMouseUp = useCallback(() => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [width, onMouseMove, onMouseUp]);

    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    const trackStr = metadata?.track_number != null
        ? metadata.total_tracks != null
            ? `${metadata.track_number} / ${metadata.total_tracks}`
            : String(metadata.track_number)
        : null;

    const discStr = metadata?.disc_number != null
        ? metadata.total_discs != null
            ? `${metadata.disc_number} / ${metadata.total_discs}`
            : String(metadata.disc_number)
        : null;

    return (
        <aside
            style={{ width }}
            className="relative flex shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950/40"
        >
            <div
                onMouseDown={onMouseDown}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = accent.hex400 + '40';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '';
                }}
                className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize transition-colors z-10"
            />

            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span className="text-xs font-medium text-zinc-400 tracking-wide">DETAIL</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence mode="wait">
                    {selectedSong ? (
                        <motion.div
                            key={selectedSong.path}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Cover art small */}
                            <div className="w-full aspect-square max-w-[160px] mx-auto rounded-xl overflow-hidden bg-zinc-900/80 ring-1 ring-white/5 mb-4">
                                <AnimatePresence mode="wait">
                                    {metadata?.cover_b64 ? (
                                        <motion.img
                                            key={selectedSong.path}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            src={`data:${metadata.cover_mime};base64,${metadata.cover_b64}`}
                                            alt="Cover"
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <motion.div
                                            key="placeholder"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 0.12 }}
                                            exit={{ opacity: 0 }}
                                            className="w-full h-full flex items-center justify-center"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                                <path d="M9 18V5l12-2v13" />
                                                <circle cx="6" cy="18" r="3" />
                                                <circle cx="18" cy="16" r="3" />
                                            </svg>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Audio metadata */}
                            <SectionTitle title="Info Lagu" />
                            <div className="space-y-3 pl-1">
                                <MetaRow label="Judul" value={songTitle || '—'} />
                                <MetaRow label="Artis" value={metadata?.artist || 'Unknown Artist'} />
                                {metadata?.album && <MetaRow label="Album" value={metadata.album} />}
                                {metadata?.genre && <MetaRow label="Genre" value={metadata.genre} />}
                                {metadata?.year != null && <MetaRow label="Tahun" value={String(metadata.year)} />}
                                {trackStr && <MetaRow label="Track" value={trackStr} />}
                                {discStr && <MetaRow label="Disc" value={discStr} />}
                                <MetaRow label="Durasi" value={formatDuration(metadata?.duration ?? null)} />
                            </div>

                            {/* Technical info */}
                            <SectionTitle title="Info Teknis" />
                            <div className="space-y-3 pl-1">
                                {metadata?.bitrate != null && (
                                    <MetaRow label="Bitrate" value={`${metadata.bitrate} kbps`} />
                                )}
                                {metadata?.sample_rate != null && (
                                    <MetaRow label="Sample Rate" value={`${(metadata.sample_rate / 1000).toFixed(1)} kHz`} />
                                )}
                                {metadata?.channels != null && (
                                    <MetaRow label="Channel" value={channelsLabel(metadata.channels)} />
                                )}
                                <MetaRow label="Format" value={selectedSong.ext.toUpperCase()} />
                                <MetaRow label="Ukuran" value={formatSize(selectedSong.size)} />
                            </div>

                            {/* File info */}
                            <SectionTitle title="Info File" />
                            <div className="space-y-3 pl-1">
                                <MetaRow label="Nama File" value={selectedSong.name} />
                                <MetaRow label="Dibuat" value={formatDate(selectedSong.ctime)} />
                                <MetaRow label="Dimodifikasi" value={formatDate(selectedSong.mtime)} />
                            </div>

                            {/* Comment */}
                            {metadata?.comment && (
                                <>
                                    <SectionTitle title="Komentar" />
                                    <div className="pl-1">
                                        <p className="text-sm text-zinc-300 leading-relaxed break-words">
                                            {metadata.comment}
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Path */}
                            <SectionTitle title="Lokasi" />
                            <div className="pl-1">
                                <p className="text-xs text-zinc-500 break-all leading-relaxed font-mono">
                                    {selectedSong.path}
                                </p>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="no-song"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center justify-center h-full text-center pt-24"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 16v-4M12 8h.01" />
                                </svg>
                            </div>
                            <p className="text-sm text-zinc-500">Pilih lagu untuk melihat detail</p>
                            <p className="text-xs text-zinc-600 mt-1">Metadata dan info file akan muncul di sini</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </aside>
    );
}
