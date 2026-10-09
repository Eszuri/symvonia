'use client';

import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {contentMotion} from '../lib/animations';
import ContextMenu, {ContextMenuItem} from './ContextMenu';
import {useHoverInfo} from '../contexts/HoverInfoContext';
import {useHoverDescription} from '../hooks/useHoverDescription';
import {getStoredValue, setStoredValue} from '../lib/storage';
import {getTauri} from '../lib/homeState';
import {ALL_TOOLBAR_COLUMNS, DEFAULT_TOOLBAR_COLUMNS} from './ToolbarEditModal';

async function openDevTools() {
    try {
        const mod = await getTauri();
        await mod.invoke('open_devtools');
    } catch {
        // not in Tauri
    }
}

export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    ext: string;
    mtime: number;
    size: number;
    ctime: number;
    display_name: string;
    sort_key: string;
    artist?: string | null;
    album?: string | null;
    track_number?: number | null;
    year?: number | null;
    genre?: string | null;
    duration?: number | null;
}

interface FolderExplorerProps {
    lang: Lang;
    files: FileEntry[];
    loading: boolean;
    selectedSong: FileEntry | null;
    playingAncestorPrefix: string | null;
    displayPath: string;
    goUp: () => void;
    setCurrentPath: (path: string) => void;
    playSong: (file: FileEntry, startAt?: number) => void;
    onChangeFolder: () => void;
    onRefreshFolder?: () => void;
    musicFolder: string | null;
    resetSidebarToken: number;
    accentColor: string;
    fileSort?: string;
    setFileSort?: (v: string) => void;
    sortDir?: string;
    setSortDir?: (v: string) => void;
    toolbarColumns?: string[];
    onOpenToolbarEdit?: () => void;
    onContextDir?: (e: React.MouseEvent, file: FileEntry) => void;
    onContextFile?: (e: React.MouseEvent, file: FileEntry) => void;
    onGlobalContextMenu?: (e: React.MouseEvent) => void;
}

function isAncestorOf(folderPath: string, targetPath: string): boolean {
    const f = folderPath.toLowerCase();
    const t = targetPath.toLowerCase();
    if (f === t) return false;
    return t.startsWith(f + '\\') || t.startsWith(f + '/');
}

function formatSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number | null): string {
    if (!timestamp) return '—';
    const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '—';
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDuration(sec: number | null | undefined): string {
    if (sec == null || sec <= 0 || isNaN(sec)) return '—';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const MIN_WIDTH = 340;
const MAX_WIDTH = 760;
const DEFAULT_WIDTH = 420;
const ROW_HEIGHT = 36;
const VIRTUAL_BUFFER = 5;

function loadSavedWidth(): number {
    const val = getStoredValue('sidebar_width', DEFAULT_WIDTH);
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(val) || DEFAULT_WIDTH));
}

function renderHeaderColumn(
    colKey: string,
    fileSort: string | undefined,
    sortDir: string | undefined,
    handleSortColumn: (key: string) => void,
    lang: Lang,
    accent: Record<string, string>,
) {
    const isSorted = fileSort === colKey || (colKey === 'track' && fileSort === 'track_no');
    const sortArrow = isSorted && (
        <span className="text-[10px] shrink-0">
            {sortDir === 'asc' ? '▲' : '▼'}
        </span>
    );
    const activeClass = isSorted ? `${accent.text400} font-bold` : '';

    switch (colKey) {
        case 'name':
            return (
                <button
                    key="name"
                    onClick={() => handleSortColumn('name')}
                    className={`flex-1 min-w-[120px] flex items-center gap-1.5 text-left py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer min-w-0 whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.name')}
                >
                    <span className="truncate">{t(lang, 'toolbar.name')}</span>
                    {sortArrow}
                </button>
            );
        case 'artist':
            return (
                <button
                    key="artist"
                    onClick={() => handleSortColumn('artist')}
                    className={`w-28 text-left shrink-0 flex items-center gap-1 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer min-w-0 whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.artist')}
                >
                    <span className="truncate">{t(lang, 'toolbar.artist')}</span>
                    {sortArrow}
                </button>
            );
        case 'album':
            return (
                <button
                    key="album"
                    onClick={() => handleSortColumn('album')}
                    className={`w-28 text-left shrink-0 flex items-center gap-1 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer min-w-0 whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.album')}
                >
                    <span className="truncate">{t(lang, 'toolbar.album')}</span>
                    {sortArrow}
                </button>
            );
        case 'track':
            return (
                <button
                    key="track"
                    onClick={() => handleSortColumn('track')}
                    className={`w-14 text-center shrink-0 flex items-center justify-center gap-0.5 px-0.5 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.track')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.track')}</span>
                    {sortArrow}
                </button>
            );
        case 'year':
            return (
                <button
                    key="year"
                    onClick={() => handleSortColumn('year')}
                    className={`w-12 text-center shrink-0 flex items-center justify-center gap-0.5 px-0.5 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.year')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.year')}</span>
                    {sortArrow}
                </button>
            );
        case 'genre':
            return (
                <button
                    key="genre"
                    onClick={() => handleSortColumn('genre')}
                    className={`w-20 text-left shrink-0 flex items-center gap-1 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer min-w-0 whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.genre')}
                >
                    <span className="truncate">{t(lang, 'toolbar.genre')}</span>
                    {sortArrow}
                </button>
            );
        case 'duration':
            return (
                <button
                    key="duration"
                    onClick={() => handleSortColumn('duration')}
                    className={`w-16 text-right shrink-0 flex items-center justify-end gap-0.5 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.duration')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.duration')}</span>
                    {sortArrow}
                </button>
            );
        case 'ext':
            return (
                <button
                    key="ext"
                    onClick={() => handleSortColumn('ext')}
                    className={`w-12 text-center shrink-0 flex items-center justify-center gap-0.5 px-0.5 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.type')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.type')}</span>
                    {sortArrow}
                </button>
            );
        case 'size':
            return (
                <button
                    key="size"
                    onClick={() => handleSortColumn('size')}
                    className={`w-16 text-right shrink-0 flex items-center justify-end gap-0.5 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.size')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.size')}</span>
                    {sortArrow}
                </button>
            );
        case 'mtime':
            return (
                <button
                    key="mtime"
                    onClick={() => handleSortColumn('mtime')}
                    className={`w-[120px] text-right shrink-0 flex items-center justify-end gap-1 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'toolbar.date')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'toolbar.date')}</span>
                    {sortArrow}
                </button>
            );
        case 'ctime':
            return (
                <button
                    key="ctime"
                    onClick={() => handleSortColumn('ctime')}
                    className={`w-[120px] text-right shrink-0 flex items-center justify-end gap-1 px-1 py-0.5 rounded hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap ${activeClass}`}
                    title={t(lang, 'sort.file.ctime')}
                >
                    <span className="whitespace-nowrap">{t(lang, 'sort.file.ctime')}</span>
                    {sortArrow}
                </button>
            );
        default:
            return null;
    }
}

function renderRowCell(
    colKey: string,
    file: FileEntry,
    isSelected: boolean,
    isPlayingAncestor: boolean,
    isLossless: boolean,
) {
    switch (colKey) {
        case 'name':
            return (
                <div key="name" className="flex-1 min-w-[120px] flex items-center gap-2 min-w-0 pr-1">
                    <span className="shrink-0 text-[11px] flex items-center justify-center w-4">
                        {isSelected ? (
                            <span className="animate-pulse">▶</span>
                        ) : file.is_dir ? (
                            <span>{isPlayingAncestor ? '▶' : '📁'}</span>
                        ) : (
                            <span>🎵</span>
                        )}
                    </span>
                    <span className="truncate">{file.display_name}</span>
                </div>
            );
        case 'artist':
            return (
                <div key="artist" className="w-28 text-left shrink-0 px-1 truncate text-[11px] text-zinc-400 whitespace-nowrap">
                    {file.is_dir ? '—' : (file.artist || '—')}
                </div>
            );
        case 'album':
            return (
                <div key="album" className="w-28 text-left shrink-0 px-1 truncate text-[11px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : (file.album || '—')}
                </div>
            );
        case 'track':
            return (
                <div key="track" className="w-14 text-center shrink-0 px-0.5 text-[11px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : (file.track_number != null ? `#${file.track_number}` : '—')}
                </div>
            );
        case 'year':
            return (
                <div key="year" className="w-12 text-center shrink-0 px-0.5 text-[11px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : (file.year ? String(file.year) : '—')}
                </div>
            );
        case 'genre':
            return (
                <div key="genre" className="w-20 text-left shrink-0 px-1 truncate text-[11px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : (file.genre || '—')}
                </div>
            );
        case 'duration':
            return (
                <div key="duration" className="w-16 text-right shrink-0 px-1 text-[11px] text-zinc-400 whitespace-nowrap">
                    {file.is_dir ? '—' : formatDuration(file.duration)}
                </div>
            );
        case 'ext':
            return (
                <div key="ext" className="w-12 text-center shrink-0 flex items-center justify-center">
                    {file.is_dir ? (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-medium">
                            DIR
                        </span>
                    ) : (
                        <span
                            className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider ${
                                isLossless
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                    : 'bg-zinc-850/80 text-zinc-400 border border-zinc-800/50'
                            }`}
                        >
                            {file.ext || 'FILE'}
                        </span>
                    )}
                </div>
            );
        case 'size':
            return (
                <div key="size" className="w-16 text-right shrink-0 px-1 text-[11px] text-zinc-400 whitespace-nowrap">
                    {file.is_dir ? '—' : formatSize(file.size)}
                </div>
            );
        case 'mtime':
            return (
                <div key="mtime" className="w-[120px] text-right shrink-0 px-1 text-[10px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : formatDate(file.mtime)}
                </div>
            );
        case 'ctime':
            return (
                <div key="ctime" className="w-[120px] text-right shrink-0 px-1 text-[10px] text-zinc-500 whitespace-nowrap">
                    {file.is_dir ? '—' : formatDate(file.ctime)}
                </div>
            );
        default:
            return null;
    }
}

function FolderExplorer({
    lang,
    files,
    loading,
    selectedSong,
    playingAncestorPrefix,
    displayPath,
    goUp,
    setCurrentPath,
    playSong,
    onChangeFolder,
    onRefreshFolder,
    musicFolder,
    resetSidebarToken,
    accentColor,
    fileSort = 'name',
    setFileSort,
    sortDir = 'asc',
    setSortDir,
    toolbarColumns,
    onOpenToolbarEdit,
    onContextDir,
    onContextFile,
    onGlobalContextMenu,
}: FolderExplorerProps) {
    const accent = getAccent(accentColor);
    const [width, setWidth] = useState<number>(() => loadSavedWidth());
    const {setHoverInfo} = useHoverInfo();
    const [contextMenu, setContextMenu] = useState<{x: number; y: number; items: ContextMenuItem[]} | null>(null);
    const [copiedFeedback, setCopiedFeedback] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(DEFAULT_WIDTH);
    const widthPendingRef = useRef<number | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportH, setViewportH] = useState(0);
    const lastFilesRef = useRef<FileEntry[]>(files);

    const goUpHover = useHoverDescription(t(lang, 'status.goUp'));
    const pathHover = useHoverDescription(t(lang, 'status.pathName'));
    const changeFolderHover = useHoverDescription(t(lang, 'status.changeFolder'));
    const refreshHover = useHoverDescription(t(lang, 'folder.refresh'));

    // Compute active columns and minimum table width dynamically
    const activeColumns = useMemo(() => {
        const list = toolbarColumns && toolbarColumns.length > 0 ? toolbarColumns : DEFAULT_TOOLBAR_COLUMNS;
        const withoutName = list.filter((c) => c !== 'name');
        return ['name', ...withoutName];
    }, [toolbarColumns]);

    const minTableWidth = useMemo(() => {
        let w = 0;
        for (const colKey of activeColumns) {
            const def = ALL_TOOLBAR_COLUMNS.find((c) => c.key === colKey);
            w += def ? def.defaultWidth : 80;
        }
        w += 28; // container padding and gaps
        return Math.max(340, w);
    }, [activeColumns]);

    // Statistics for footer
    const stats = useMemo(() => {
        let audioCount = 0;
        let dirCount = 0;
        let totalBytes = 0;
        for (const f of files) {
            if (f.is_dir) {
                dirCount++;
            } else {
                audioCount++;
                totalBytes += f.size || 0;
            }
        }
        return {
            audioCount,
            dirCount,
            totalSizeFormatted: formatSize(totalBytes),
        };
    }, [files]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        setViewportH(el.clientHeight);
        const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (lastFilesRef.current !== files) {
            lastFilesRef.current = files;
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
            setScrollTop(0);
        }
    }, [files]);

    useEffect(() => {
        if (resetSidebarToken === 0) return;
        const frame = requestAnimationFrame(() => {
            setWidth(DEFAULT_WIDTH);
            setStoredValue('sidebar_width', DEFAULT_WIDTH);
        });
        return () => cancelAnimationFrame(frame);
    }, [resetSidebarToken]);

    useEffect(() => {
        const handleWindowResize = () => {
            const currentWinW = window.innerWidth;
            const metaWidth = getStoredValue('meta_width', 360);
            const maxAllowed = Math.max(MIN_WIDTH, currentWinW - metaWidth - 300);
            const effectiveMax = Math.min(MAX_WIDTH, maxAllowed);
            setWidth((prev) => (prev > effectiveMax ? effectiveMax : prev));
        };
        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, []);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = e.clientX - startXRef.current;
        const currentWinW = window.innerWidth;
        const metaWidth = getStoredValue('meta_width', 360);
        const maxAllowed = Math.max(MIN_WIDTH, currentWinW - metaWidth - 300);
        const effectiveMax = Math.min(MAX_WIDTH, maxAllowed);
        const next = Math.min(effectiveMax, Math.max(MIN_WIDTH, startWidthRef.current + delta));
        setWidth(next);
        widthPendingRef.current = next;
    }, []);

    const onMouseUpRef = useRef<(() => void) | null>(null);

    const onMouseUp = useCallback(() => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (widthPendingRef.current !== null) {
            setStoredValue('sidebar_width', widthPendingRef.current);
            widthPendingRef.current = null;
        }
        window.removeEventListener('mousemove', onMouseMove);
        if (onMouseUpRef.current) {
            window.removeEventListener('mouseup', onMouseUpRef.current);
        }
    }, [onMouseMove]);

    useEffect(() => {
        onMouseUpRef.current = onMouseUp;
    }, [onMouseUp]);

    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isDraggingRef.current = true;
            startXRef.current = e.clientX;
            startWidthRef.current = width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        },
        [width, onMouseMove, onMouseUp],
    );

    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    const handleCopyPath = useCallback(() => {
        if (!displayPath) return;
        try {
            navigator.clipboard.writeText(displayPath);
            setCopiedFeedback(true);
            setTimeout(() => setCopiedFeedback(false), 2000);
        } catch {
            // ignore
        }
    }, [displayPath]);

    const handleRefresh = useCallback(() => {
        if (onRefreshFolder) {
            setIsRefreshing(true);
            onRefreshFolder();
            setTimeout(() => setIsRefreshing(false), 600);
        }
    }, [onRefreshFolder]);

    const handleSortColumn = useCallback(
        (columnKey: string) => {
            if (!setFileSort || !setSortDir) return;
            if (fileSort === columnKey) {
                setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            } else {
                setFileSort(columnKey);
                setSortDir('asc');
            }
        },
        [fileSort, sortDir, setFileSort, setSortDir],
    );

    const onHeaderContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const items: ContextMenuItem[] = [
                ...(onOpenToolbarEdit
                    ? [
                          {
                              label: t(lang, 'contextMenu.editToolbar'),
                              icon: (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="3" width="18" height="18" rx="2" />
                                      <path d="M9 3v18" />
                                      <path d="M15 3v18" />
                                  </svg>
                              ),
                              onClick: onOpenToolbarEdit,
                          },
                          {
                              separator: true as const,
                          },
                      ]
                    : []),
                {
                    label: t(lang, 'contextMenu.openDevTools'),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                    ),
                    onClick: openDevTools,
                },
            ];
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items,
            });
        },
        [lang, onOpenToolbarEdit, setContextMenu],
    );

    return (
        <aside
            suppressHydrationWarning
            style={{width}}
            className="relative flex shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md max-lg:flex-1 max-lg:min-w-0 overflow-hidden"
        >
            {/* 1. Top Navigation & Action Bar */}
            <div
                onContextMenu={onGlobalContextMenu}
                className="flex items-center gap-1.5 p-2.5 sm:p-3 border-b border-zinc-800/40 bg-zinc-950/40 min-w-0"
            >
                {/* Back/Parent button */}
                <button
                    {...goUpHover}
                    onClick={goUp}
                    disabled={displayPath === musicFolder}
                    onContextMenu={(e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            items: [
                                {
                                    label: t(lang, 'folder.goUp'),
                                    icon: (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="m15 18-6-6 6-6" />
                                        </svg>
                                    ),
                                    onClick: goUp,
                                    disabled: displayPath === musicFolder,
                                },
                            ],
                        });
                    }}
                    title={t(lang, 'folder.goUp')}
                    className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors shrink-0 ${
                        displayPath === musicFolder
                            ? 'opacity-30 cursor-not-allowed bg-zinc-900/60 text-zinc-600'
                            : 'bg-zinc-850/80 hover:bg-zinc-750 text-zinc-300 hover:text-white cursor-pointer shadow-xs active:scale-95'
                    }`}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>

                {/* Refresh Folder Button */}
                {onRefreshFolder && (
                    <button
                        {...refreshHover}
                        onClick={handleRefresh}
                        title={t(lang, 'folder.refresh')}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-850/80 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0 cursor-pointer shadow-xs active:scale-95"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={isRefreshing ? 'animate-spin' : ''}
                        >
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 21h5v-5" />
                        </svg>
                    </button>
                )}

                {/* Address / Path Pill */}
                <div
                    {...pathHover}
                    onClick={handleCopyPath}
                    title={displayPath ? `${displayPath} (${t(lang, 'folder.copiedPath')})` : ''}
                    className="flex-1 flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900/80 hover:bg-zinc-855 border border-zinc-800/80 rounded-lg min-w-0 cursor-pointer transition-colors group"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-zinc-500 group-hover:text-zinc-300 shrink-0"
                    >
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                    </svg>
                    <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200 truncate flex-1 select-none">
                        {copiedFeedback ? t(lang, 'folder.copiedPath') : displayPath || '—'}
                    </span>
                    {copiedFeedback ? (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className="text-emerald-400 shrink-0"
                        >
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-zinc-600 group-hover:text-zinc-400 shrink-0"
                        >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    )}
                </div>

                {/* Change Folder Button */}
                <button
                    {...changeFolderHover}
                    onClick={onChangeFolder}
                    title={t(lang, 'folder.changeFolder', {folder: musicFolder || ''})}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-850/80 hover:bg-zinc-750 text-zinc-300 hover:text-white cursor-pointer shrink-0 shadow-xs transition-colors active:scale-95"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                        <circle cx="12" cy="13" r="2" />
                    </svg>
                </button>
            </div>

            {/* 2 & 3. Table Area with synchronized scroll & sticky header */}
            <div
                ref={scrollRef}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                onContextMenu={onGlobalContextMenu}
                className="flex-1 overflow-auto custom-scrollbar relative min-w-0"
            >
                <div style={{minWidth: minTableWidth}} className="w-full flex flex-col min-h-full">
                    {/* Sticky Table Toolbar / Column Headers */}
                    <div
                        onContextMenu={onHeaderContextMenu}
                        className="sticky top-0 z-20 flex items-center px-3 py-1.5 bg-zinc-900 border-b border-zinc-800/60 text-[11px] font-semibold text-zinc-400 select-none shrink-0 uppercase tracking-wider gap-1 w-full whitespace-nowrap"
                    >
                        {activeColumns.map((colKey) =>
                            renderHeaderColumn(
                                colKey,
                                fileSort,
                                sortDir,
                                handleSortColumn,
                                lang,
                                accent,
                            ),
                        )}
                    </div>

                    {/* Content List / Skeleton / Empty State */}
                    <AnimatePresence mode="wait" initial={false}>
                        {loading ? (
                            <motion.div key="skeleton" {...contentMotion} className="py-1">
                                <SkeletonList accentHex={accent.hex400} />
                            </motion.div>
                        ) : files.length === 0 ? (
                            <motion.div
                                key="empty"
                                {...contentMotion}
                                className="p-6 text-zinc-500 text-center text-xs flex flex-col items-center justify-center h-48 gap-2"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="28"
                                    height="28"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    className="text-zinc-600"
                                >
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.3-4.3" />
                                </svg>
                                <span>{t(lang, 'folder.empty')}</span>
                            </motion.div>
                        ) : (
                            <VirtualList
                                lang={lang}
                                files={files}
                                scrollTop={scrollTop}
                                viewportH={viewportH}
                                selectedPath={selectedSong?.path ?? null}
                                playingAncestorPrefix={playingAncestorPrefix}
                                onPick={playSong}
                                onEnterDir={setCurrentPath}
                                onContextDir={onContextDir}
                                onContextFile={onContextFile}
                                activeColumns={activeColumns}
                                accentBg10={accent.bg10}
                                accentText400={accent.text400}
                                accentBorder500={accent.border500}
                                accentBg30={accent.bg30}
                            />
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* 4. Footer Summary Bar */}
            <div className="px-3 py-1.5 bg-zinc-950/90 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-medium select-none flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 truncate">
                    <span>
                        {t(lang, 'folder.summary', {
                            files: stats.audioCount,
                            dirs: stats.dirCount,
                            size: stats.totalSizeFormatted,
                        })}
                    </span>
                </div>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={onMouseDown}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = accent.hex400 + '40';
                    setHoverInfo(t(lang, 'status.resizeHandle'));
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '';
                    setHoverInfo(null);
                }}
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize transition-colors max-lg:hidden z-10"
            />

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </aside>
    );
}

const VirtualList = memo(function VirtualList({
    lang,
    files,
    scrollTop,
    viewportH,
    selectedPath,
    playingAncestorPrefix,
    onPick,
    onEnterDir,
    onContextDir,
    onContextFile,
    activeColumns,
    accentBg10,
    accentText400,
    accentBorder500,
    accentBg30,
}: {
    lang: Lang;
    files: FileEntry[];
    scrollTop: number;
    viewportH: number;
    selectedPath: string | null;
    playingAncestorPrefix: string | null;
    onPick: (file: FileEntry) => void;
    onEnterDir: (path: string) => void;
    onContextDir?: (e: React.MouseEvent, file: FileEntry) => void;
    onContextFile?: (e: React.MouseEvent, file: FileEntry) => void;
    activeColumns: string[];
    accentBg10: string;
    accentText400: string;
    accentBorder500: string;
    accentBg30: string;
}) {
    const {setHoverInfo} = useHoverInfo();
    const totalH = files.length * ROW_HEIGHT;
    const visibleCount = viewportH > 0 ? Math.ceil(viewportH / ROW_HEIGHT) : 20;
    let startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_BUFFER);
    const endIdx = Math.min(files.length, startIdx + visibleCount + VIRTUAL_BUFFER * 2);
    if (endIdx - startIdx < visibleCount + VIRTUAL_BUFFER * 2) {
        startIdx = Math.max(0, endIdx - (visibleCount + VIRTUAL_BUFFER * 2));
    }
    const topPad = startIdx * ROW_HEIGHT;
    const bottomPad = totalH - endIdx * ROW_HEIGHT;
    const slice = files.slice(startIdx, endIdx);

    return (
        <motion.div {...contentMotion} className="relative" style={{height: totalH}}>
            <div style={{height: topPad}} />
            {slice.map((file) => {
                const isSelected = selectedPath === file.path;
                const isPlayingAncestor =
                    file.is_dir &&
                    !isSelected &&
                    playingAncestorPrefix != null &&
                    isAncestorOf(file.path, playingAncestorPrefix);

                let rowClass: string;
                let titleAttr: string | undefined;
                if (isSelected) {
                    rowClass = `${accentBg10} ${accentText400} border-l-2 ${accentBorder500} font-medium`;
                } else if (isPlayingAncestor) {
                    rowClass = `${accentBg30} ${accentText400} border-l-2 ${accentBorder500}`;
                    titleAttr = t(lang, 'folder.playingAncestor');
                } else {
                    rowClass =
                        'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border-l-2 border-transparent';
                }

                const isLossless =
                    file.ext.toLowerCase() === 'flac' ||
                    file.ext.toLowerCase() === 'wav' ||
                    file.ext.toLowerCase() === 'alac' ||
                    file.ext.toLowerCase() === 'aiff';

                return (
                    <button
                        key={file.path}
                        onMouseEnter={() =>
                            setHoverInfo(
                                t(lang, file.is_dir ? 'status.folderRow' : 'status.fileRow'),
                            )
                        }
                        onMouseLeave={() => setHoverInfo(null)}
                        onClick={() =>
                            file.is_dir ? onEnterDir(file.path) : onPick(file)
                        }
                        onContextMenu={(e) => {
                            if (file.is_dir) {
                                if (onContextDir) onContextDir(e, file);
                            } else {
                                if (onContextFile) onContextFile(e, file);
                            }
                        }}
                        title={titleAttr || file.name}
                        className={`w-full flex items-center px-3 text-xs text-left cursor-pointer transition-colors duration-75 border-b border-zinc-900/40 gap-1 ${rowClass}`}
                        style={{height: ROW_HEIGHT}}
                    >
                        {activeColumns.map((colKey) =>
                            renderRowCell(
                                colKey,
                                file,
                                isSelected,
                                isPlayingAncestor,
                                isLossless,
                            ),
                        )}
                    </button>
                );
            })}
            <div style={{height: Math.max(0, bottomPad)}} />
        </motion.div>
    );
});

function SkeletonList({accentHex}: {accentHex: string}) {
    const widths = [
        'w-10/12',
        'w-8/12',
        'w-11/12',
        'w-9/12',
        'w-7/12',
        'w-10/12',
        'w-9/12',
        'w-8/12',
    ];
    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{
                hidden: {},
                show: {transition: {staggerChildren: 0.04}},
            }}
        >
            {widths.map((w, i) => (
                <motion.div
                    key={i}
                    variants={{
                        hidden: {opacity: 0, y: 8},
                        show: {opacity: 1, y: 0},
                    }}
                    transition={{duration: 0.25, ease: 'easeInOut'}}
                    className="flex items-center gap-2.5 px-3 py-2 border-l-2 border-transparent"
                >
                    <span className="shrink-0 w-3 h-3 rounded-sm bg-zinc-800/70" />
                    <span
                        className={`relative overflow-hidden h-3 rounded ${w} bg-zinc-800/70`}
                    >
                        <motion.span
                            className="absolute inset-x-0 -top-1/2 h-1/2"
                            style={{
                                background: `linear-gradient(0deg, transparent, ${accentHex}33, transparent)`,
                            }}
                            animate={{y: ['0%', '300%']}}
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

export default memo(FolderExplorer);


