'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccent } from '../lib/colors';

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    ext: string;
    mtime: number;
    size: number;
    ctime: number;
    display_name: string;
}

interface FolderExplorerProps {
    files: FileEntry[];
    loading: boolean;
    selectedSong: FileEntry | null;
    displayPath: string;
    debugError: string;
    goUp: () => void;
    setCurrentPath: (path: string) => void;
    playSong: (file: FileEntry) => void;
    onChangeFolder: () => void;
    musicFolder: string;
    resetSidebarToken: number;
    accentColor: string;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 288;
const STORAGE_KEY = 'music-app-sidebar-width';

function loadSavedWidth(): number {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

export default function FolderExplorer({
    files,
    loading,
    selectedSong,
    displayPath,
    debugError,
    goUp,
    setCurrentPath,
    playSong,
    onChangeFolder,
    musicFolder,
    resetSidebarToken,
    accentColor,
}: FolderExplorerProps) {
    const accent = getAccent(accentColor);
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
        const delta = e.clientX - startXRef.current;
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

    return (
        <aside
            style={{ width }}
            className="relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-black/30"
        >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/30">
                <motion.button
                    onClick={goUp}
                    title="Ke folder induk"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.12 }}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 
        text-zinc-400 hover:text-zinc-100 shrink-0 ${displayPath === musicFolder ? 'invisible pointer-events-none' : 'cursor-pointer'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </motion.button>
                <span className="text-xs text-zinc-500 truncate flex-1" title={displayPath}>{displayPath}</span>
                <motion.button
                    onClick={onChangeFolder}
                    title={`Ganti folder (${musicFolder})`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.12 }}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 
        text-zinc-400 hover:text-zinc-100 cursor-pointer shrink-0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 12h6M12 9l3 3-3 3" />
                    </svg>
                </motion.button>
            </div>
            <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                        <motion.div
                            key="skeleton"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="py-1"
                        >
                            <SkeletonList accentHex={accent.hex400} />
                        </motion.div>
                    ) : files.length === 0 ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 text-zinc-600 text-center"
                        >
                            Tidak ada file
                        </motion.div>
                    ) : (
                        <motion.div
                            key="list"
                            initial="hidden"
                            animate="show"
                            exit={{ opacity: 0 }}
                            variants={{
                                hidden: {},
                                show: { transition: { staggerChildren: 0.025 } },
                            }}
                        >
                            {files.map((file) => {
                                const isSelected = selectedSong?.path === file.path;
                                return (
                                    <motion.button
                                        key={file.path}
                                        variants={{
                                            hidden: { opacity: 0, x: -8 },
                                            show: { opacity: 1, x: 0 },
                                        }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => file.is_dir ? setCurrentPath(file.path) : playSong(file)}
                                        whileHover={{ x: 2 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left cursor-pointer ${isSelected
                                            ? `${accent.bg10} ${accent.text400} border-l-2 ${accent.border500}`
                                            : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border-l-2 border-transparent'
                                            }`}
                                    >
                                        <span className="shrink-0 text-[10px]">
                                            {file.is_dir ? '📁' : isSelected ? '▶' : '🎵'}
                                        </span>
                                        <span className="truncate">{file.display_name}</span>
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                    {debugError && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="p-2 text-[10px] text-red-400/70 border-t border-zinc-800/30 truncate overflow-hidden"
                        >
                            {debugError}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div
                onMouseDown={onMouseDown}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = accent.hex400 + '40';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '';
                }}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize transition-colors"
            />
        </aside>
    );
}

function SkeletonList({ accentHex }: { accentHex: string }) {
    const widths = ['w-10/12', 'w-8/12', 'w-11/12', 'w-9/12', 'w-7/12', 'w-10/12', 'w-9/12', 'w-8/12'];
    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.04 } },
            }}
        >
            {widths.map((w, i) => (
                <motion.div
                    key={i}
                    variants={{
                        hidden: { opacity: 0, x: -6 },
                        show: { opacity: 1, x: 0 },
                    }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2.5 px-3 py-2 border-l-2 border-transparent"
                >
                    <span className="shrink-0 w-3 h-3 rounded-sm bg-zinc-800/70" />
                    <span
                        className={`relative overflow-hidden h-3 rounded ${w} bg-zinc-800/70`}
                    >
                        <motion.span
                            className="absolute inset-y-0 -left-1/2 w-1/2"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${accentHex}33, transparent)`,
                            }}
                            animate={{ x: ['0%', '300%'] }}
                            transition={{
                                duration: 1.4,
                                repeat: Infinity,
                                ease: 'easeInOut',
                                delay: i * 0.08,
                            }}
                        />
                    </span>
                </motion.div>
            ))}
        </motion.div>
    );
}
