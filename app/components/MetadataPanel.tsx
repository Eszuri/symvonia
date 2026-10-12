'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileEntry } from './FolderExplorer';
import { SongMetadata } from './PlayerPanel';
import { getAccent } from '../lib/colors';
import { t, type Lang } from '../lib/translations';
import { contentMotion } from '../lib/animations';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { useHoverDescription } from '../hooks/useHoverDescription';
import { useHoverInfo } from '../contexts/HoverInfoContext';
import { CopyIcon, MusicNoteIcon, LyricsIcon, DetailsIcon } from './icons';
import { useLyrics } from '../hooks/useLyrics';
import { useAiLyricsPlugin } from '../hooks/useAiLyricsPlugin';
import { LyricsSearchModal } from './LyricsSearchModal';
import { AiLyricsModal } from './AiLyricsModal';
import { getStoredValue, setStoredValue } from '../lib/storage';

interface MetadataPanelProps {
    lang: Lang;
    selectedSong: FileEntry | null;
    metadata: SongMetadata | null;
    accentColor: string;
    coverDataUrl: string | null;
    resetSidebarToken: number;
    currentTime?: number;
    onSeek?: (timeSec: number) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    lyricsSearchOpen?: boolean;
    onOpenLyricsSearch?: () => void;
    onCloseLyricsSearch?: () => void;
    aiLyricsModalOpen?: boolean;
    onOpenAiLyricsModal?: () => void;
    onCloseAiLyricsModal?: () => void;
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 360;

function loadSavedWidth(): number {
    const num = Number(getStoredValue('meta_width', DEFAULT_WIDTH));
    return isNaN(num) ? DEFAULT_WIDTH : Math.min(Math.max(num, MIN_WIDTH), MAX_WIDTH);
}

function loadSavedTab(): 'metadata' | 'lyrics' {
    const raw = getStoredValue('active_metadata_tab', 'metadata');
    return raw === 'lyrics' ? 'lyrics' : 'metadata';
}

function formatDuration(seconds: number | null): string {
    if (seconds == null || isNaN(seconds)) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatDate(timestamp: number | null, lang: Lang = 'id'): string {
    if (!timestamp) return '—';
    // Convert Rust UNIX timestamp (seconds) to JS Date (milliseconds)
    const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
    const locale = lang === 'id' ? 'id-ID' : 'en-US';
    return new Date(ms).toLocaleString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function checkIsHiRes(song: FileEntry | null, meta: SongMetadata | null): boolean {
    if (!song) return false;
    const ext = song.ext.toLowerCase();
    const isLosslessFormat = ext === 'flac' || ext === 'wav' || ext === 'alac' || ext === 'aiff' || ext === 'dsd' || ext === 'dsf';
    const hasHiResSampleRate = meta?.sample_rate != null && meta.sample_rate >= 88200;
    const hasHiResBitDepth = meta?.bit_depth != null && meta.bit_depth > 16;
    return isLosslessFormat && (hasHiResSampleRate || hasHiResBitDepth);
}

function SectionTitle({ title }: { title: string }) {
    return (
        <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-5 mb-2.5 first:mt-0 border-b border-zinc-800/40 pb-1">
            {title}
        </h4>
    );
}

function MetaRow({ label, value, hoverProps }: { label: string; value: string; hoverProps?: React.HTMLAttributes<HTMLDivElement> }) {
    return (
        <div className="flex flex-col gap-0.5 min-w-0" {...(hoverProps ?? {})}>
            <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase truncate cursor-help">{label}</span>
            <span className={`text-xs font-medium ${value === '—' ? 'text-zinc-600' : 'text-zinc-200'} truncate cursor-help select-text`} title={value}>
                {value}
            </span>
        </div>
    );
}

function channelsLabel(lang: Lang, n: number): string {
    if (n === 1) return t(lang, 'metadata.mono');
    if (n === 2) return t(lang, 'metadata.stereo');
    return `${n}${t(lang, 'metadata.ch')}`;
}

function getSourceLabel(lang: Lang, source: string | null): string {
    if (!source) return `❓ ${t(lang, 'lyrics.source.unknown')}`;
    switch (source) {
        case 'lrc_file':
            return `📄 ${t(lang, 'lyrics.source.lrc_file')}`;
        case 'embedded':
            return `🎵 ${t(lang, 'lyrics.source.embedded')}`;
        case 'lrclib':
            return `🌐 ${t(lang, 'lyrics.source.lrclib')}`;
        case 'custom':
            return `✏️ ${t(lang, 'lyrics.source.custom')}`;
        default:
            return `❓ ${t(lang, 'lyrics.source.unknown')}`;
    }
}

function LyricsSection({
    lang,
    selectedSong,
    metadata,
    currentTime,
    onSeek,
    accentColor,
    lyricsSearchOpen,
    onOpenLyricsSearch,
    onCloseLyricsSearch,
    aiLyricsModalOpen,
    onOpenAiLyricsModal,
    onCloseAiLyricsModal,
}: {
    lang: Lang;
    selectedSong: FileEntry | null;
    metadata: SongMetadata | null;
    currentTime?: number;
    onSeek?: (timeSec: number) => void;
    accentColor: string;
    lyricsSearchOpen?: boolean;
    onOpenLyricsSearch?: () => void;
    onCloseLyricsSearch?: () => void;
    aiLyricsModalOpen?: boolean;
    onOpenAiLyricsModal?: () => void;
    onCloseAiLyricsModal?: () => void;
}) {

    const songPath = selectedSong?.path ?? null;
    const songTitle = metadata?.title || selectedSong?.name.replace(/\.[^/.]+$/, '') || undefined;
    const artistName = metadata?.artist || undefined;
    const albumName = metadata?.album || undefined;
    const duration = metadata?.duration || undefined;

    const {
        lines,
        isSynced,
        source,
        loading,
        isFetchingOnline,
        activeIndex,
        importLyricsFile,
        fetchOnlineLyrics,
        searchOnlineLyrics,
        applyLyrics,
        saveAsLrcFile,
    } = useLyrics(songPath, currentTime ?? 0, songTitle, artistName, albumName, duration);

    const { pluginStatus: aiPluginStatus } = useAiLyricsPlugin();
    const isAiPluginInstalled = aiPluginStatus?.installed === true;

    const [isSaving, setIsSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const activeLineRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const accent = getAccent(accentColor);

    // Auto-scroll active lyric line to center of container
    useEffect(() => {
        if (activeIndex < 0 || !activeLineRef.current) return;
        activeLineRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [activeIndex]);

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                importLyricsFile(content, file.name);
            }
        };
        reader.readAsText(file);
    };

    const handleManualSearchClick = async () => {
        if (!songTitle) {
            onOpenLyricsSearch?.();
            return;
        }

        const found = await fetchOnlineLyrics(songTitle, artistName, albumName, duration);
        if (found === false) {
            // Tampilkan modal pencarian manual jika tidak ditemukan otomatis
            onOpenLyricsSearch?.();
        }
    };

    const handleSaveLrc = async () => {
        setIsSaving(true);
        const ok = await saveAsLrcFile();
        setIsSaving(false);
        if (ok) {
            setToastMessage({ type: 'success', text: t(lang, 'lyrics.saveSuccess') });
        } else {
            setToastMessage({ type: 'error', text: t(lang, 'lyrics.saveError') });
        }
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Hover descriptions for status bar (bottom-left)
    const hSource = useHoverDescription(source ? t(lang, 'status.lyrics.source') : null);
    const hType = useHoverDescription(isSynced ? t(lang, 'status.lyrics.typeSynced') : t(lang, 'status.lyrics.typePlain'));
    const hSaveLrc = useHoverDescription(t(lang, 'status.lyrics.saveLrc'));
    const hSearchOnline = useHoverDescription(t(lang, 'status.lyrics.searchOnline'));
    const hImportFile = useHoverDescription(t(lang, 'status.lyrics.importFile'));

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".lrc,.txt"
                onChange={handleFileImport}
                className="hidden"
            />

            {/* Toast Notification Banner */}
            {toastMessage && (
                <div
                    className={`mx-3 my-1.5 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border shadow-lg transition-all animate-fade-in shrink-0 ${
                        toastMessage.type === 'success'
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/90 text-rose-300 border-rose-500/40'
                    }`}
                >
                    <div className="flex items-center space-x-2 truncate">
                        <span>{toastMessage.type === 'success' ? '✓' : '⚠️'}</span>
                        <span className="truncate">{toastMessage.text}</span>
                    </div>
                    <button
                        onClick={() => setToastMessage(null)}
                        className="text-xs opacity-70 hover:opacity-100 cursor-pointer ml-2"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Lyrics Content Container */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 text-center select-none scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
            >
                {loading || isFetchingOnline ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-3 text-zinc-400 py-16">
                        <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin" />
                        <p className="text-xs font-medium">
                            {isFetchingOnline ? t(lang, 'lyrics.autoFetching') : t(lang, 'general.update.checking')}
                        </p>
                    </div>
                ) : lines.length > 0 ? (
                    lines.map((line, idx) => {
                        const isActive = idx === activeIndex;
                        return (
                            <div
                                key={line.id}
                                ref={isActive ? activeLineRef : null}
                                onClick={() => {
                                    if (line.timeSec !== null && onSeek) {
                                        onSeek(line.timeSec);
                                    }
                                }}
                                className={`transition-all duration-250 py-1.5 px-3 rounded-xl cursor-pointer ${
                                    isActive
                                        ? 'scale-105 font-bold text-base text-zinc-100 drop-shadow-md py-2.5 bg-zinc-800/40'
                                        : 'text-zinc-500 hover:text-zinc-300 text-sm font-medium'
                                }`}
                                style={
                                    isActive
                                        ? {
                                              color: accent.hex500 || accentColor,
                                              textShadow: `0 0 16px ${accent.hex500 || accentColor}30`,
                                          }
                                        : undefined
                                }
                            >
                                {line.text}
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center space-y-3 text-center py-12 px-2">
                        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-500">
                            <LyricsIcon size={28} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-zinc-200">
                                {t(lang, 'lyrics.notFound')}
                            </h3>
                            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[220px] mx-auto">
                                {t(lang, 'lyrics.notFoundDesc')}
                            </p>
                        </div>
                        <div className="flex flex-col space-y-2 pt-1 w-full max-w-[210px]">
                            {/* Button 1: ✨ Local AI Lyrics Generator */}
                            {isAiPluginInstalled && (
                                <button
                                    onClick={() => onOpenAiLyricsModal?.()}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-400/30"
                                >
                                    <span>{t(lang, 'lyrics.aiPlugin.generateBtn')}</span>
                                </button>
                            )}

                            {/* Button 2: 🔍 Online LRCLIB Search */}
                            <button
                                onClick={handleManualSearchClick}
                                disabled={isFetchingOnline}
                                {...hSearchOnline}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                                style={{ backgroundColor: accent.hex500 || accentColor }}
                            >
                                <LyricsIcon size={14} />
                                <span>{t(lang, 'lyrics.searchBtn')}</span>
                            </button>

                            {/* Button 3: 📁 Import File */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                {...hImportFile}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors cursor-pointer"
                            >
                                {t(lang, 'lyrics.importBtn')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Bar */}
            {lines.length > 0 && (
                <div className="flex flex-col border-t border-zinc-800/60 bg-zinc-900/40 text-[11px] text-zinc-400 shrink-0">
                    <div className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center space-x-2 truncate">
                            <span className="font-medium text-zinc-300 truncate cursor-help" {...hSource}>
                                {getSourceLabel(lang, source)}
                            </span>
                            <span className="text-zinc-500">•</span>
                            <span className="cursor-help" {...hType}>
                                {isSynced ? t(lang, 'lyrics.typeSynced') : t(lang, 'lyrics.typePlain')}
                            </span>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                            {/* ✨ AI Generator Modal Trigger */}
                            {isAiPluginInstalled && (
                                <button
                                    onClick={() => onOpenAiLyricsModal?.()}
                                    className="px-2 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/40 transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1 shadow-xs"
                                    title={t(lang, 'lyrics.aiPlugin.title')}
                                >
                                    <span className="text-[10px] font-bold">AI</span>
                                </button>
                            )}

                            {/* 💾 Save LRC File Trigger */}
                            {(source === 'lrclib' || source === 'custom') && (
                                <button
                                    onClick={handleSaveLrc}
                                    disabled={isSaving}
                                    {...hSaveLrc}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50 shadow-sm"
                                    title={t(lang, 'lyrics.saveLrcBtn')}
                                >
                                    <span>💾</span>
                                    <span>{isSaving ? t(lang, 'lyrics.saving') : t(lang, 'lyrics.saveLrcBtn')}</span>
                                </button>
                            )}

                            {/* 🔍 Search Online Trigger */}
                            <button
                                onClick={() => onOpenLyricsSearch?.()}
                                {...hSearchOnline}
                                className="px-2 py-1 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                                title={t(lang, 'lyrics.searchBtn')}
                            >
                                🔍
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. LRCLIB Online Search Modal */}
            <LyricsSearchModal
                isOpen={!!lyricsSearchOpen}
                onClose={() => onCloseLyricsSearch?.()}
                lang={lang}
                initialTitle={songTitle}
                initialArtist={artistName}
                accentColor={accentColor}
                searchOnlineLyrics={searchOnlineLyrics}
                onSelectLyric={(content) => applyLyrics(content, 'lrclib')}
            />

            {/* 2. Dedicated Local AI Lyrics Generator Modal */}
            <AiLyricsModal
                isOpen={!!aiLyricsModalOpen}
                onClose={() => onCloseAiLyricsModal?.()}
                lang={lang}
                initialTitle={songTitle}
                initialArtist={artistName}
                accentColor={accentColor}
                songPath={songPath ?? undefined}
                onSelectLyric={(content) => applyLyrics(content, 'lrclib')}
            />
        </div>
    );

}

function MetadataPanel({
    lang,
    selectedSong,
    metadata,
    accentColor,
    coverDataUrl,
    resetSidebarToken,
    currentTime,
    onSeek,
    onContextMenu,
    lyricsSearchOpen,
    onOpenLyricsSearch,
    onCloseLyricsSearch,
    aiLyricsModalOpen,
    onOpenAiLyricsModal,
    onCloseAiLyricsModal,
}: MetadataPanelProps) {

    const accent = getAccent(accentColor);
    const songTitle = selectedSong
        ? (metadata?.title || selectedSong.name.replace(/\.[^/.]+$/, ''))
        : null;

    const [activeTab, setActiveTab] = useState<'metadata' | 'lyrics'>(() => loadSavedTab());


    const changeTab = useCallback((tab: 'metadata' | 'lyrics') => {
        setActiveTab(tab);
        setStoredValue('active_metadata_tab', tab);
    }, []);
    const [width, setWidth] = useState<number>(() => loadSavedWidth());

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(DEFAULT_WIDTH);
    const widthPendingRef = useRef<number | null>(null);

    // Per-field hover descriptions — specific label shown in status bar per item
    const hTitle = useHoverDescription(selectedSong ? t(lang, 'status.meta.title') : null);
    const hArtist = useHoverDescription(selectedSong ? t(lang, 'status.meta.artist') : null);
    const hAlbum = useHoverDescription(selectedSong ? t(lang, 'status.meta.album') : null);
    const hGenre = useHoverDescription(selectedSong ? t(lang, 'status.meta.genre') : null);
    const hYear = useHoverDescription(selectedSong ? t(lang, 'status.meta.year') : null);
    const hTrack = useHoverDescription(selectedSong ? t(lang, 'status.meta.track') : null);
    const hDisc = useHoverDescription(selectedSong ? t(lang, 'status.meta.disc') : null);
    const hDuration = useHoverDescription(selectedSong ? t(lang, 'status.meta.duration') : null);
    const hBitrate = useHoverDescription(selectedSong ? t(lang, 'status.meta.bitrate') : null);
    const hSample = useHoverDescription(selectedSong ? t(lang, 'status.meta.sampleRate') : null);
    const hChannel = useHoverDescription(selectedSong ? t(lang, 'status.meta.channel') : null);
    const hFormat = useHoverDescription(selectedSong ? t(lang, 'status.meta.format') : null);
    const hSize = useHoverDescription(selectedSong ? t(lang, 'status.meta.size') : null);
    const hCoverSz = useHoverDescription(selectedSong ? t(lang, 'status.meta.coverSize') : null);
    const hFileName = useHoverDescription(selectedSong ? t(lang, 'status.meta.fileName') : null);
    const hCreated = useHoverDescription(selectedSong ? t(lang, 'status.meta.created') : null);
    const hModified = useHoverDescription(selectedSong ? t(lang, 'status.meta.modified') : null);
    const hComment = useHoverDescription(selectedSong ? t(lang, 'status.meta.comment') : null);
    const hLocation = useHoverDescription(selectedSong ? t(lang, 'status.meta.location') : null);
    const hCoverArt = useHoverDescription(selectedSong ? t(lang, 'status.meta.cover') : null);
    const { setHoverInfo } = useHoverInfo();

    useEffect(() => {
        if (resetSidebarToken === 0) return;
        const frame = requestAnimationFrame(() => {
            setWidth(DEFAULT_WIDTH);
            setActiveTab('metadata');
            setStoredValue('meta_width', DEFAULT_WIDTH);
            setStoredValue('active_metadata_tab', 'metadata');
        });
        return () => cancelAnimationFrame(frame);
    }, [resetSidebarToken]);

    useEffect(() => {
        const handleWindowResize = () => {
            const currentWinW = window.innerWidth;
            const folderWidth = getStoredValue('sidebar_width', 360);
            const maxAllowed = Math.max(MIN_WIDTH, currentWinW - folderWidth - 300);
            const effectiveMax = Math.min(MAX_WIDTH, maxAllowed);
            setWidth(prev => (prev > effectiveMax ? effectiveMax : prev));
        };
        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, []);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startXRef.current - e.clientX;
        const currentWinW = window.innerWidth;
        const folderWidth = getStoredValue('sidebar_width', 360);
        const maxAllowed = Math.max(MIN_WIDTH, currentWinW - folderWidth - 300);
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
            setStoredValue('meta_width', widthPendingRef.current);
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
            suppressHydrationWarning
            style={{ width }}
            className="relative flex shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950/40 max-lg:flex-1 max-lg:min-w-0 overflow-hidden"
        >
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
                className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize transition-colors z-10 max-lg:hidden"
            />

            {/* Navbar Header (Horizontal Tab Switcher) */}
            <div className="flex items-center border-b border-zinc-800/40 bg-zinc-900/50 p-1.5 gap-1.5 select-none shrink-0">
                <button
                    onClick={() => changeTab('metadata')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeTab === 'metadata'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
                    }`}
                >
                    <DetailsIcon size={14} />
                    <span>{t(lang, 'metadata.heading')}</span>
                </button>
                <button
                    onClick={() => changeTab('lyrics')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeTab === 'lyrics'
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
                    }`}
                >
                    <LyricsIcon size={14} />
                    <span>{t(lang, 'lyrics.title')}</span>
                </button>
            </div>

            {/* Tab 1: Metadata View */}
            {activeTab === 'metadata' && (
                <div
                    className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 md:space-y-4 select-text [&_*::selection]:bg-(--selection-bg) [&_*::selection]:text-(--selection-color)"
                    style={{
                        '--selection-bg': accent.hex500 + '80',
                        '--selection-color': '#ffffff'
                    } as React.CSSProperties}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const sel = window.getSelection()?.toString().trim();
                        setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            items: [
                                {
                                    label: t(lang, 'contextMenu.copyText'),
                                    icon: <CopyIcon size={14} />,
                                    onClick: () => {
                                        if (sel) navigator.clipboard.writeText(sel);
                                    },
                                    disabled: !sel
                                }
                            ]
                        });
                    }}
                >
                    <AnimatePresence mode="wait">
                        {selectedSong ? (
                            <motion.div
                                key={selectedSong.path}
                                {...contentMotion}
                            >
                                {/* Cover art small */}
                                <div
                                    {...hCoverArt}
                                    onContextMenu={onContextMenu}
                                    className="w-full aspect-square max-w-40 mx-auto rounded-xl overflow-hidden bg-zinc-900/80 ring-1 ring-white/5 mb-4"
                                >
                                    <AnimatePresence mode="wait">
                                        {coverDataUrl ? (
                                            <motion.img
                                                key={selectedSong.path}
                                                {...contentMotion}
                                                src={coverDataUrl}
                                                alt={t(lang, 'metadata.cover')}
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <motion.div
                                                key="placeholder"
                                                {...contentMotion}
                                                animate={{ opacity: 0.12, y: 0 }}
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

                                <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1 mb-2.5">
                                    <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                                        {t(lang, 'metadata.songInfo')}
                                    </h4>
                                    {checkIsHiRes(selectedSong, metadata) && (
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase shrink-0">
                                            {t(lang, 'metadata.hiRes')}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3.5 pl-0.5">
                                    <MetaRow label={t(lang, 'metadata.title')} value={songTitle || '—'} hoverProps={hTitle} />
                                    <MetaRow label={t(lang, 'metadata.artist')} value={metadata?.artist || t(lang, 'metadata.unknownArtist')} hoverProps={hArtist} />
                                    {metadata?.album && <MetaRow label={t(lang, 'metadata.album')} value={metadata.album} hoverProps={hAlbum} />}
                                    {metadata?.genre && <MetaRow label={t(lang, 'metadata.genre')} value={metadata.genre} hoverProps={hGenre} />}
                                    {metadata?.year != null && <MetaRow label={t(lang, 'metadata.year')} value={String(metadata.year)} hoverProps={hYear} />}
                                    {trackStr && <MetaRow label={t(lang, 'metadata.track')} value={trackStr} hoverProps={hTrack} />}
                                    {discStr && <MetaRow label={t(lang, 'metadata.disc')} value={discStr} hoverProps={hDisc} />}
                                    <MetaRow label={t(lang, 'metadata.duration')} value={formatDuration(metadata?.duration ?? null)} hoverProps={hDuration} />
                                </div>

                                <SectionTitle title={t(lang, 'metadata.audioSpec')} />
                                <div className="grid grid-cols-2 gap-3.5 pl-0.5">
                                    {metadata?.bitrate != null && (
                                        <MetaRow label={t(lang, 'metadata.bitrate')} value={`${metadata.bitrate} kbps`} hoverProps={hBitrate} />
                                    )}
                                    {metadata?.sample_rate != null && (
                                        <MetaRow label={t(lang, 'metadata.sampleRate')} value={`${(metadata.sample_rate / 1000).toFixed(1)} kHz`} hoverProps={hSample} />
                                    )}
                                    {metadata?.bit_depth != null && (
                                        <MetaRow label={t(lang, 'metadata.bitDepth')} value={`${metadata.bit_depth}-bit`} />
                                    )}
                                    {metadata?.channels != null && (
                                        <MetaRow label={t(lang, 'metadata.channel')} value={channelsLabel(lang, metadata.channels)} hoverProps={hChannel} />
                                    )}
                                    <MetaRow label={t(lang, 'metadata.format')} value={selectedSong.ext.toUpperCase()} hoverProps={hFormat} />
                                    <MetaRow label={t(lang, 'metadata.size')} value={formatSize(selectedSong.size)} hoverProps={hSize} />
                                    {metadata?.cover_b64 && (
                                        <MetaRow
                                            label={t(lang, 'metadata.coverSize')}
                                            value={formatSize(Math.round(metadata.cover_b64.length * 3 / 4))}
                                            hoverProps={hCoverSz}
                                        />
                                    )}
                                </div>

                                <SectionTitle title={t(lang, 'metadata.fileInfo')} />
                                <div className="grid grid-cols-2 gap-3.5 pl-0.5">
                                    <MetaRow label={t(lang, 'metadata.fileName')} value={selectedSong.name} hoverProps={hFileName} />
                                    <MetaRow label={t(lang, 'metadata.modified')} value={formatDate(selectedSong.mtime, lang)} hoverProps={hModified} />
                                    <MetaRow label={t(lang, 'metadata.created')} value={formatDate(selectedSong.ctime, lang)} hoverProps={hCreated} />
                                </div>

                                {metadata?.comment && (
                                    <>
                                        <SectionTitle title={t(lang, 'metadata.comment')} />
                                        <div className="mt-1.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 text-xs text-zinc-300 whitespace-pre-wrap break-words" {...(hComment ?? {})}>
                                            {metadata.comment}
                                        </div>
                                    </>
                                )}

                                {selectedSong.path && (
                                    <>
                                        <SectionTitle title={t(lang, 'metadata.fileLocation')} />
                                        <div className="mt-1.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 text-[11px] text-zinc-400 font-mono break-all leading-relaxed" {...(hLocation ?? {})}>
                                            {selectedSong.path}
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50 select-none py-20">
                                <div className="p-4 rounded-2xl bg-zinc-800/40 border border-zinc-700/50">
                                    <MusicNoteIcon size={40} className="text-zinc-500" />
                                </div>
                                <div className="space-y-1 text-center">
                                    <p className="text-sm font-medium text-zinc-300">{t(lang, 'metadata.emptyTitle')}</p>
                                    <p className="text-xs text-zinc-500">{t(lang, 'metadata.emptyDesc')}</p>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Tab 2: Lyrics View */}
            {(activeTab === 'lyrics' || lyricsSearchOpen || aiLyricsModalOpen) && (
                <LyricsSection
                    lang={lang}
                    selectedSong={selectedSong}
                    metadata={metadata}
                    currentTime={currentTime}
                    onSeek={onSeek}
                    accentColor={accentColor}
                    lyricsSearchOpen={lyricsSearchOpen}
                    onOpenLyricsSearch={onOpenLyricsSearch}
                    onCloseLyricsSearch={onCloseLyricsSearch}
                    aiLyricsModalOpen={aiLyricsModalOpen}
                    onOpenAiLyricsModal={onOpenAiLyricsModal}
                    onCloseAiLyricsModal={onCloseAiLyricsModal}
                />
            )}


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

export default memo(MetadataPanel);
