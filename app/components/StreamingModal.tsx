'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useCallback, useState, useRef } from 'react';

interface StreamingModalProps {
    open: boolean;
    onClose: () => void;
    accentColor: string;
}

interface Platform {
    id: string;
    name: string;
    url: string;
    color: string;
    icon: React.ReactNode;
}

interface StreamHistoryEntry {
    url: string;
    timestamp: number;
    domain: string;
}

const STREAM_HISTORY_KEY = 'music-app-stream-history';

function removeFromHistory(url: string, timestamp: number) {
    const entries = loadHistory().filter(e => !(e.url === url && e.timestamp === timestamp));
    saveHistory(entries);
    return entries;
}

function removeGroupFromHistory(domain: string) {
    const entries = loadHistory().filter(e => e.domain !== domain);
    saveHistory(entries);
    return entries;
}

function clearAllHistory() {
    saveHistory([]);
    return [] as StreamHistoryEntry[];
}

function YouTubeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <path d="M43.2 13.2a5.1 5.1 0 0 0-3.6-3.6C36.2 8.6 24 8.6 24 8.6s-12.2 0-15.6 1a5.1 5.1 0 0 0-3.6 3.6C3.8 16.6 3.8 24 3.8 24s0 7.4 1 10.8a5.1 5.1 0 0 0 3.6 3.6c3.4 1 15.6 1 15.6 1s12.2 0 15.6-1a5.1 5.1 0 0 0 3.6-3.6c1-3.4 1-10.8 1-10.8s0-7.4-1-10.8z" fill="#FF0000"/>
            <path d="M19.5 30.3V17.7L31.3 24l-11.8 6.3z" fill="#FFF"/>
        </svg>
    );
}

function YouTubeMusicIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#FF0000"/>
            <circle cx="24" cy="24" r="10" stroke="#FFF" strokeWidth="2" fill="none"/>
            <path d="M21 18v12l10-6-10-6z" fill="#FFF"/>
        </svg>
    );
}

function SpotifyIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#1DB954"/>
            <path d="M34.4 21.2c-5.7-3.4-15.2-3.7-20.7-2-.9.3-1.8-.2-2.1-1.1-.3-.9.2-1.8 1.1-2.1 6.3-1.9 16.8-1.6 23.4 2.4.8.5 1.1 1.5.6 2.4-.5.8-1.6 1.1-2.3.4zm-.3 5.7c-.4.7-1.3.9-2 .5-4.8-2.9-12.1-3.8-17.7-2.1-.8.2-1.6-.2-1.8-1-.2-.8.2-1.6 1-1.8 6.4-1.9 14.4-.9 20 2.5.7.4.9 1.3.5 1.9zm-2.3 5.5c-.3.6-1 .8-1.6.4-4.2-2.5-9.4-3.1-15.6-1.7-.7.2-1.3-.2-1.5-.8-.2-.7.2-1.3.8-1.5 6.9-1.6 12.8-.9 17.6 2 .6.3.8 1 .5 1.6z" fill="#FFF"/>
        </svg>
    );
}

function SoundCloudIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#FF5500"/>
            <path d="M33.5 26.5c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5s-.5.2-.5.5v2c0 .3.2.5.5.5zm-2.3 1.5c.3 0 .5-.2.5-.5v-4c0-.3-.2-.5-.5-.5s-.5.2-.5.5v4c0 .3.2.5.5.5zm-2.3 1c.3 0 .5-.2.5-.5v-5c0-.3-.2-.5-.5-.5s-.5.2-.5.5v5c0 .3.2.5.5.5zm-2.3.5c.3 0 .5-.2.5-.5v-5.5c0-.3-.2-.5-.5-.5s-.5.2-.5.5v5.5c0 .3.2.5.5.5zm-2.3.5c.3 0 .5-.2.5-.5v-6c0-.3-.2-.5-.5-.5s-.5.2-.5.5v6c0 .3.2.5.5.5zm-9.5-1c.8 0 1.5-.7 1.5-1.5v-5c0-.8-.7-1.5-1.5-1.5S13 20.7 13 21.5v5c0 .8.7 1.5 1.5 1.5zm-1.5-9.5h2c.3 0 .5-.2.5-.5v-1c0-.3-.2-.5-.5-.5h-2c-.3 0-.5.2-.5.5v1c0 .3.2.5.5.5zm20.8 2c1.5 0 2.8-1.2 2.8-2.8V15c0-.3-.2-.5-.5-.5s-.5.2-.5.5v1.2c0 .7-.6 1.3-1.3 1.3h-.5z" fill="#FFF"/>
            <path d="M35.8 22c0-3.2-2.6-5.8-5.8-5.8-1.4 0-2.7.5-3.7 1.3-.5-.3-1.1-.5-1.7-.5-1.8 0-3.3 1.5-3.3 3.3v.2c-1.3.3-2.3 1.4-2.3 2.8v7c0 1.7 1.3 3 3 3h13c2.5 0 4.5-2 4.5-4.5v-3c0-2.5-2-4.5-4.5-4.5h.3z" fill="#FFF"/>
        </svg>
    );
}

function AppleMusicIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="url(#appleGrad)"/>
            <defs>
                <linearGradient id="appleGrad" x1="0" y1="0" x2="48" y2="48">
                    <stop offset="0%" stopColor="#FC3C44"/>
                    <stop offset="100%" stopColor="#C42D65"/>
                </linearGradient>
            </defs>
            <path d="M32.5 14.2v12.8c0 2.4-1.9 4.3-4.3 4.3s-4.3-1.9-4.3-4.3 1.9-4.3 4.3-4.3c.8 0 1.6.2 2.2.6v-8.8l-10 2.6v10.2c0 2.4-1.9 4.3-4.3 4.3s-4.3-1.9-4.3-4.3 1.9-4.3 4.3-4.3c.8 0 1.6.2 2.2.6V16l14.1-3.7c.5-.1.9.3.8.8-.1.3-.2.7-.3 1.1z" fill="#FFF"/>
        </svg>
    );
}

function BandcampIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#629AA9"/>
            <text x="24" y="30" textAnchor="middle" fill="#FFF" fontSize="20" fontWeight="bold" fontFamily="Arial">bc</text>
        </svg>
    );
}

function DeezerIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#A238FF"/>
            <rect x="10" y="30" width="5" height="3" rx="0.5" fill="#FFF"/>
            <rect x="17" y="27" width="5" height="6" rx="0.5" fill="#FFF"/>
            <rect x="24" y="24" width="5" height="9" rx="0.5" fill="#FFF"/>
            <rect x="31" y="20" width="5" height="13" rx="0.5" fill="#FFF"/>
        </svg>
    );
}

function TidalIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#000"/>
            <path d="M15.5 20l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm9 0l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm-9 9l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5zm9 0l4.5 4.5 4.5-4.5-4.5-4.5-4.5 4.5z" fill="#00FFFF"/>
        </svg>
    );
}

const PLATFORMS: Platform[] = [
    {
        id: 'youtube',
        name: 'YouTube',
        url: 'https://www.youtube.com',
        color: '#FF0000',
        icon: <YouTubeIcon className="w-full h-full" />,
    },
    {
        id: 'youtube-music',
        name: 'YouTube Music',
        url: 'https://music.youtube.com',
        color: '#FF0000',
        icon: <YouTubeMusicIcon className="w-full h-full" />,
    },
    {
        id: 'spotify',
        name: 'Spotify',
        url: 'https://open.spotify.com',
        color: '#1DB954',
        icon: <SpotifyIcon className="w-full h-full" />,
    },
    {
        id: 'soundcloud',
        name: 'SoundCloud',
        url: 'https://soundcloud.com',
        color: '#FF5500',
        icon: <SoundCloudIcon className="w-full h-full" />,
    },
    {
        id: 'apple-music',
        name: 'Apple Music',
        url: 'https://music.apple.com',
        color: '#FC3C44',
        icon: <AppleMusicIcon className="w-full h-full" />,
    },
    {
        id: 'bandcamp',
        name: 'Bandcamp',
        url: 'https://bandcamp.com',
        color: '#629AA9',
        icon: <BandcampIcon className="w-full h-full" />,
    },
    {
        id: 'deezer',
        name: 'Deezer',
        url: 'https://www.deezer.com',
        color: '#A238FF',
        icon: <DeezerIcon className="w-full h-full" />,
    },
    {
        id: 'tidal',
        name: 'Tidal',
        url: 'https://tidal.com',
        color: '#000000',
        icon: <TidalIcon className="w-full h-full" />,
    },
];

function getDomainLabel(domain: string): string {
    const map: Record<string, string> = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'music.youtube.com': 'YouTube Music',
        'open.spotify.com': 'Spotify',
        'soundcloud.com': 'SoundCloud',
        'music.apple.com': 'Apple Music',
        'bandcamp.com': 'Bandcamp',
        'deezer.com': 'Deezer',
        'tidal.com': 'Tidal',
    };
    return map[domain] || domain;
}

function formatStreamTime(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'baru saja';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isBrowserTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function loadHistory(): StreamHistoryEntry[] {
    try {
        const raw = localStorage.getItem(STREAM_HISTORY_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

function saveHistory(entries: StreamHistoryEntry[]) {
    try {
        localStorage.setItem(STREAM_HISTORY_KEY, JSON.stringify(entries));
    } catch {}
}

function addToHistory(url: string) {
    const entries = loadHistory();
    const domain = new URL(url).hostname.replace(/^www\./, '');
    entries.unshift({ url, timestamp: Date.now(), domain });
    const unique = entries.filter((e, i, a) => a.findIndex(x => x.url === e.url) === i).slice(0, 200);
    saveHistory(unique);
}

export default function StreamingModal({ open, onClose, accentColor }: StreamingModalProps) {
    const [history, setHistory] = useState<StreamHistoryEntry[]>([]);
    const [customUrl, setCustomUrl] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleEsc = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (open) {
            document.addEventListener('keydown', handleEsc);
            setHistory(loadHistory());
            return () => document.removeEventListener('keydown', handleEsc);
        }
    }, [open, handleEsc]);

    // Sync history from localStorage when modal opens, and listen for new
    // entries pushed by the global listener in page.tsx. Avoids polling
    // (which previously ran every 2s regardless of activity).
    useEffect(() => {
        if (!open) return;
        setHistory(loadHistory());
        if (!isBrowserTauri()) return;
        let cancelled = false;
        let unlisten: (() => void) | null = null;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen('stream-url-changed', () => {
                if (!cancelled) setHistory(loadHistory());
            }).then((fn) => {
                if (cancelled) fn();
                else unlisten = fn;
            });
        });
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [open]);

    const openStream = useCallback(async (url: string, label: string, title: string) => {
        if (!isBrowserTauri()) {
            window.open(url, '_blank');
            return;
        }
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_webview_stream', { url, label, title });
        } catch (e) {
            console.error('Failed to open stream webview:', e);
            window.open(url, '_blank');
        }
    }, []);

    const handlePlatformClick = useCallback(async (platform: Platform) => {
        await openStream(platform.url, platform.id, platform.name);
    }, [openStream]);

    const handleCustomPlay = useCallback(async () => {
        const trimmed = customUrl.trim();
        if (!trimmed) return;
        try {
            new URL(trimmed);
        } catch {
            return;
        }
        const label = 'stream-' + Date.now();
        await openStream(trimmed, label, 'Streaming');
        addToHistory(trimmed);
        setCustomUrl('');
        setHistory(loadHistory());
    }, [customUrl, openStream]);

    const handleCustomKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCustomPlay();
        }
    }, [handleCustomPlay]);

    const grouped = Object.entries(
        history.reduce<Record<string, StreamHistoryEntry[]>>((acc, entry) => {
            if (!acc[entry.domain]) acc[entry.domain] = [];
            acc[entry.domain].push(entry);
            return acc;
        }, {})
    )
    .map(([domain, entries]) => {
        entries.sort((a, b) => b.timestamp - a.timestamp);
        return [domain, entries] as const;
    })
    .sort((a, b) => {
        const maxA = a[1][0].timestamp;
        const maxB = b[1][0].timestamp;
        return maxB - maxA;
    });

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 5 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-[min(960px,95vw)] max-h-[80vh] flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                        <path d="M4 11a9 9 0 0 1 9 9" />
                                        <path d="M4 4a16 16 0 0 1 16 16" />
                                        <circle cx="5" cy="19" r="1" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-zinc-100">Streaming</h2>
                                    <p className="text-[11px] text-zinc-500">Platform streaming & URL media</p>
                                </div>
                            </div>
                            <motion.button
                                onClick={onClose}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="w-7 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/70 flex items-center justify-center text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </motion.button>
                        </div>

                        {/* Content - Two equal columns */}
                        <div className="flex flex-1 overflow-hidden">
                            {/* Left Column - Platform Grid */}
                            <div className="w-1/2 border-r border-zinc-800/60 overflow-y-auto p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">Streaming Platform</div>
                                <div className="grid grid-cols-1 gap-2">
                                    {PLATFORMS.map((platform) => (
                                        <motion.button
                                            key={platform.id}
                                            onClick={() => handlePlatformClick(platform)}
                                            whileHover={{ scale: 1.02, y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 border border-zinc-700/30 hover:border-zinc-600/50 cursor-pointer transition-colors text-left group"
                                        >
                                            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
                                                {platform.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 truncate">
                                                    {platform.name}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 truncate">
                                                    {new URL(platform.url).hostname}
                                                </div>
                                            </div>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors">
                                                <path d="M7 17 17 7" />
                                                <path d="M7 7h10v10" />
                                            </svg>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Right Column - URL Input + History */}
                            <div className="w-1/2 flex flex-col overflow-hidden">
                                {/* URL Input */}
                                <div className="p-4 border-b border-zinc-800/60">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5 px-1">URL Media</div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 relative">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={customUrl}
                                                onChange={(e) => setCustomUrl(e.target.value)}
                                                onKeyDown={handleCustomKeyDown}
                                                placeholder="https://youtube.com/watch?v=..."
                                                className="w-full px-3 py-2 rounded-xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 text-sm placeholder-zinc-600 outline-none focus:border-zinc-500/70 transition-colors"
                                            />
                                            {customUrl && (
                                                <button
                                                    onClick={() => setCustomUrl('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M18 6 6 18" />
                                                        <path d="m6 6 12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        <motion.button
                                            onClick={handleCustomPlay}
                                            disabled={!customUrl.trim()}
                                            whileHover={{ scale: customUrl.trim() ? 1.04 : 1 }}
                                            whileTap={{ scale: customUrl.trim() ? 0.96 : 1 }}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-colors ${customUrl.trim() ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </motion.button>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 mt-1.5 px-1">Tempel URL dari platform streaming untuk diputar di jendela baru</p>
                                </div>

                                {/* History */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                                            History Media {history.length > 0 && `(${history.length})`}
                                        </div>
                                        {history.length > 0 && (
                                            <motion.button
                                                onClick={() => {
                                                    clearAllHistory();
                                                    setHistory([]);
                                                }}
                                                whileHover={{ scale: 1.04 }}
                                                whileTap={{ scale: 0.96 }}
                                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/40 hover:bg-zinc-700/60 text-zinc-500 hover:text-red-400 text-[10px] font-medium cursor-pointer transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                </svg>
                                                Hapus Semua
                                            </motion.button>
                                        )}
                                    </div>
                                            {grouped.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 mb-3">
                                                <circle cx="12" cy="12" r="10" />
                                                <path d="M12 8v8" />
                                                <path d="M8 12h8" />
                                            </svg>
                                            <p className="text-xs text-zinc-600">Belum ada media yang diputar</p>
                                            <p className="text-[10px] text-zinc-700 mt-1">Putar video dari YouTube atau platform lain untuk memulai</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {grouped.map(([domain, entries]) => (
                                                <div key={domain}>
                                                    <div className="flex items-center justify-between mb-2 px-1 group/header">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold text-zinc-400">{getDomainLabel(domain)}</span>
                                                            <span className="text-[10px] text-zinc-600">{entries.length}</span>
                                                        </div>
                                                        <motion.button
                                                            onClick={() => {
                                                                removeGroupFromHistory(domain);
                                                                setHistory(loadHistory());
                                                            }}
                                                            whileHover={{ scale: 1.1 }}
                                                            whileTap={{ scale: 0.9 }}
                                                            className="w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-zinc-700/50 opacity-0 group-hover/header:opacity-100 transition-all cursor-pointer"
                                                            title={`Hapus semua ${getDomainLabel(domain)}`}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M3 6h18" />
                                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                            </svg>
                                                        </motion.button>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {entries.slice(0, 10).map((entry) => (
                                                            <div
                                                                key={entry.url + entry.timestamp}
                                                                className="group/entry relative"
                                                            >
                                                                <motion.button
                                                                    onClick={() => {
                                                                        const label = 'stream-' + Date.now();
                                                                        openStream(entry.url, label, getDomainLabel(domain));
                                                                    }}
                                                                    whileTap={{ scale: 0.99 }}
                                                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-zinc-800/20 hover:bg-zinc-800/50 cursor-pointer text-left border border-transparent hover:border-zinc-700/30 transition-colors"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors">
                                                                        <circle cx="12" cy="12" r="10" />
                                                                        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                                                                    </svg>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-xs text-zinc-400 truncate group-hover:text-zinc-300 transition-colors">
                                                                            {entry.url.length > 60 ? entry.url.slice(0, 57) + '...' : entry.url}
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-[9px] text-zinc-600 shrink-0">{formatStreamTime(entry.timestamp)}</span>
                                                                </motion.button>
                                                                <motion.button
                                                                    onClick={() => {
                                                                        removeFromHistory(entry.url, entry.timestamp);
                                                                        setHistory(loadHistory());
                                                                    }}
                                                                    whileHover={{ scale: 1.1 }}
                                                                    whileTap={{ scale: 0.9 }}
                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center bg-zinc-800/80 text-zinc-500 hover:text-red-400 hover:bg-zinc-700/80 opacity-0 group-hover/entry:opacity-100 transition-all cursor-pointer shadow-sm"
                                                                    title="Hapus"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                        <path d="M18 6 6 18" />
                                                                        <path d="m6 6 12 12" />
                                                                    </svg>
                                                                </motion.button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
