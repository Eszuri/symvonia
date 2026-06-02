'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    ext: string;
    mtime: number;
}

interface FolderExplorerProps {
    files: FileEntry[];
    selectedSong: FileEntry | null;
    displayPath: string;
    debugError: string;
    goUp: () => void;
    setCurrentPath: (path: string) => void;
    playSong: (file: FileEntry) => void;
    onChangeFolder: () => void;
    musicFolder: string;
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
    selectedSong,
    displayPath,
    debugError,
    goUp,
    setCurrentPath,
    playSong,
    onChangeFolder,
    musicFolder,
}: FolderExplorerProps) {
    const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(DEFAULT_WIDTH);

    useEffect(() => {
        setWidth(loadSavedWidth());
    }, []);

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
                <button
                    onClick={goUp}
                    title="Ke folder induk"
                    aria-hidden={displayPath === musicFolder}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 
        text-zinc-400 hover:text-zinc-100 transition-all active:scale-95 shrink-0 ${displayPath === musicFolder ? 'invisible pointer-events-none' : 'cursor-pointer'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>
                <span className="text-xs text-zinc-500 truncate flex-1" title={displayPath}>{displayPath}</span>
                <button
                    onClick={onChangeFolder}
                    title={`Ganti folder (${musicFolder})`}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 
        text-zinc-400 hover:text-zinc-100 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 12h6M12 9l3 3-3 3" />
                    </svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {files.length === 0 ? (
                    <div className="p-4 text-zinc-600 text-center">Tidak ada file</div>
                ) : (
                    files.map((file) => (
                        <button
                            key={file.path}
                            onClick={() => file.is_dir ? setCurrentPath(file.path) : playSong(file)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${selectedSong?.path === file.path
                                ? 'bg-green-500/10 text-green-400 border-l-2 border-green-500'
                                : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border-l-2 border-transparent'
                                }`}
                        >
                            <span className="shrink-0 text-[10px]">
                                {file.is_dir ? '📁' : selectedSong?.path === file.path ? '▶' : '🎵'}
                            </span>
                            <span className="truncate">{file.name}</span>
                        </button>
                    ))
                )}
                {debugError && (
                    <div className="p-2 text-[10px] text-red-400/70 border-t border-zinc-800/30 truncate">
                        {debugError}
                    </div>
                )}
            </div>
            <div
                onMouseDown={onMouseDown}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-green-500/30 active:bg-green-500/50 transition-colors"
            />
        </aside>
    );
}
