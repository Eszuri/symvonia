'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FolderExplorer, { FileEntry } from './components/FolderExplorer';
import PlayerPanel, { SongMetadata } from './components/PlayerPanel';
import SeekBar from './components/SeekBar';
import PlaybackControls from './components/PlaybackControls';
import VolumeControl from './components/VolumeControl';
import ConfirmDialog from './components/ConfirmDialog';
import SettingsModal from './components/SettingsModal';
import MetadataPanel from './components/MetadataPanel';
import StreamingModal from './components/StreamingModal';
import { getAccent, setCustomAccentVars, removeCustomAccentVars } from './lib/colors';

const isBrowserTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const FOLDER_STORAGE_KEY = 'music-app-folder';
const AUTO_WALLPAPER_KEY = 'music-app-auto-wallpaper';
const RESET_ON_CLOSE_KEY = 'music-app-reset-on-close';
const FOLDER_SORT_KEY = 'music-app-folder-sort';
const FILE_SORT_KEY = 'music-app-file-sort';
const SORT_DIR_KEY = 'music-app-sort-dir';
const NAME_SOURCE_KEY = 'music-app-name-source';
const THEME_KEY = 'music-app-theme';
const ACCENT_KEY = 'music-app-accent';
const CUSTOM_ACCENT_KEY = 'music-app-custom-accent';
const WALLPAPER_KEY = 'music-app-wallpaper';
const FORMATS_KEY = 'music-app-formats';
const DEFAULT_FORMATS = ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'wma'];

interface LogEntry {
    id: number;
    time: string;
    level: string;
    message: string;
}

interface TauriCore {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    convertFileSrc: (path: string) => string;
}

let tauriMod: TauriCore | null = null;

function getTauri(): Promise<TauriCore> {
    if (tauriMod) return Promise.resolve(tauriMod);
    return import('@tauri-apps/api/core').then((mod) => {
        tauriMod = mod as unknown as TauriCore;
        return tauriMod;
    });
}

function loadSavedFolder(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(FOLDER_STORAGE_KEY);
}

export default function Home() {
    const [musicFolder, setMusicFolderState] = useState<string | null>(null);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [selectedSong, setSelectedSong] = useState<FileEntry | null>(null);
    const [metadata, setMetadata] = useState<SongMetadata | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [debugError, setDebugError] = useState('');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [toastMsg, setToastMsg] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const logIdRef = useRef(0);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const origConsoleRef = useRef({ error: console.error.bind(console), warn: console.warn.bind(console) });

    const addLog = useCallback((level: string, message: string) => {
        const id = ++logIdRef.current;
        const now = new Date();
        const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry: LogEntry = { id, time, level, message };
        setLogs(prev => [...prev.slice(-499), entry]);
        if (level === 'error') {
            origConsoleRef.current.error(message);
        } else if (level === 'warn') {
            origConsoleRef.current.warn(message);
        }
    }, []);

    const showError = useCallback((msg: string) => {
        setDebugError(msg);
        addLog('error', msg);
        setToastMsg(msg);
        setToastVisible(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastVisible(false), 4000);
    }, [addLog]);

    useEffect(() => {
        const orig = origConsoleRef.current;
        const handler = (ev: ErrorEvent) => {
            const text = ev.error?.message || ev.message || '';
            if (text.includes('AbortError') || text.includes('abort')) return;
            addLog('error', `[RENDER] ${text.slice(0, 200)}`);
        };
        const rejectionHandler = (e: PromiseRejectionEvent) => {
            const text = e.reason?.message || String(e.reason || '');
            if (text.includes('AbortError') || text.includes('abort')) return;
            addLog('error', `[PROMISE] ${text.slice(0, 200)}`);
        };
        console.error = (...args: unknown[]) => {
            const text = args.map(a => String(a)).join(' ');
            if (!text.includes('AbortError')) {
                addLog('error', `[CONSOLE] ${text.slice(0, 200)}`);
            }
            orig.error(...args);
        };
        console.warn = (...args: unknown[]) => {
            const text = args.map(a => String(a)).join(' ');
            addLog('warn', `[CONSOLE] ${text.slice(0, 200)}`);
            orig.warn(...args);
        };
        window.addEventListener('error', handler);
        window.addEventListener('unhandledrejection', rejectionHandler);
        return () => {
            console.error = orig.error;
            console.warn = orig.warn;
            window.removeEventListener('error', handler);
            window.removeEventListener('unhandledrejection', rejectionHandler);
        };
    }, [addLog]);
    const [autoWallpaper, setAutoWallpaperState] = useState(true);
    const [resetOnClose, setResetOnCloseState] = useState(true);
    const [folderSort, setFolderSortState] = useState('name');
    const [fileSort, setFileSortState] = useState('name');
    const [sortDir, setSortDirState] = useState('asc');
    const [nameSource, setNameSourceState] = useState('filename');
    const [formats, setFormatsState] = useState<string[]>(DEFAULT_FORMATS);
    const [theme, setThemeState] = useState('dark');
    const [shuffle, setShuffleState] = useState(false);
    const [repeat, setRepeatState] = useState<'off' | 'all' | 'one'>('off');
    const [accentColor, setAccentColorState] = useState('green');
    const [customAccentHex, setCustomAccentHexState] = useState('#22c55e');
    const [defaultWallpaper, setDefaultWallpaperState] = useState<string | null>(null);
    const [resetSidebarToken, setResetSidebarToken] = useState(0);
    const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [showLeftSidebar, setShowLeftSidebar] = useState(true);
    const [showRightSidebar, setShowRightSidebar] = useState(true);

    const SIDEBAR_BREAKPOINT = 900;
    const isCompact = windowWidth < SIDEBAR_BREAKPOINT;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const filesRef = useRef<FileEntry[]>([]);
    const selectedSongRef = useRef<FileEntry | null>(null);
    const playlistRef = useRef<FileEntry[]>([]);
    const volumeRef = useRef<number>(volume);
    const autoWallpaperRef = useRef<boolean>(autoWallpaper);
    const folderSortRef = useRef<string>('name');
    const fileSortRef = useRef<string>('name');
    const sortDirRef = useRef<string>('asc');
    const nameSourceRef = useRef<string>('filename');
    const formatsRef = useRef<string[]>(DEFAULT_FORMATS);
    const shuffleRef = useRef(false);
    const repeatRef = useRef<'off' | 'all' | 'one'>('off');

    filesRef.current = files;
    selectedSongRef.current = selectedSong;
    volumeRef.current = volume;
    autoWallpaperRef.current = autoWallpaper;
    formatsRef.current = formats;

    const setMusicFolder = useCallback((folder: string | null) => {
        setMusicFolderState(folder);
        if (folder) {
            window.localStorage.setItem(FOLDER_STORAGE_KEY, folder);
        } else {
            window.localStorage.removeItem(FOLDER_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        if (!isCompact) {
            setShowLeftSidebar(true);
            setShowRightSidebar(true);
        } else {
            setShowLeftSidebar(false);
            setShowRightSidebar(false);
        }
    }, [isCompact]);

    useEffect(() => {
        let raf = 0;
        const handleResize = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setWindowWidth(window.innerWidth));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const setDefaultWallpaper = useCallback((path: string | null) => {
        setDefaultWallpaperState(path);
        if (path) {
            window.localStorage.setItem(WALLPAPER_KEY, path);
        } else {
            window.localStorage.removeItem(WALLPAPER_KEY);
        }
    }, []);

    useEffect(() => {
        const saved = loadSavedFolder();
        if (saved) {
            setMusicFolderState(saved);
            setCurrentPath(saved);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const aw = window.localStorage.getItem(AUTO_WALLPAPER_KEY);
        if (aw !== null) setAutoWallpaperState(aw === 'true');
        const rc = window.localStorage.getItem(RESET_ON_CLOSE_KEY);
        if (rc !== null) setResetOnCloseState(rc === 'true');
        const fs = window.localStorage.getItem(FOLDER_SORT_KEY);
        if (fs) setFolderSortState(fs);
        const fls = window.localStorage.getItem(FILE_SORT_KEY);
        if (fls) setFileSortState(fls);
        const sd = window.localStorage.getItem(SORT_DIR_KEY);
        if (sd) setSortDirState(sd);
        const fm = window.localStorage.getItem(FORMATS_KEY);
        if (fm) {
            try { setFormatsState(JSON.parse(fm)); } catch { /* ignore */ }
        }
        const th = window.localStorage.getItem(THEME_KEY);
        if (th) setThemeState(th);
        const ac = window.localStorage.getItem(ACCENT_KEY);
        if (ac) setAccentColorState(ac);
        const ca = window.localStorage.getItem(CUSTOM_ACCENT_KEY);
        if (ca) setCustomAccentHexState(ca);
        const wp = window.localStorage.getItem(WALLPAPER_KEY);
        if (wp) setDefaultWallpaperState(wp);
        const sh = window.localStorage.getItem('music-app-shuffle');
        if (sh !== null) setShuffleState(sh === 'true');
        const rp = window.localStorage.getItem('music-app-repeat');
        if (rp === 'all' || rp === 'one') setRepeatState(rp);
        const ns = window.localStorage.getItem(NAME_SOURCE_KEY);
        if (ns === 'filename' || ns === 'title') setNameSourceState(ns);
    }, []);

    useEffect(() => {
        if (!isBrowserTauri) return;
        window.localStorage.setItem(AUTO_WALLPAPER_KEY, String(autoWallpaper));
    }, [autoWallpaper]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(RESET_ON_CLOSE_KEY, String(resetOnClose));
        if (isBrowserTauri) {
            getTauri().then(mod => mod.invoke('set_reset_on_close', { enabled: resetOnClose })).catch(() => {});
        }
    }, [resetOnClose]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(FOLDER_SORT_KEY, folderSort);
        folderSortRef.current = folderSort;
        if (currentPath) loadFiles(currentPath);
    }, [folderSort, currentPath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(FILE_SORT_KEY, fileSort);
        fileSortRef.current = fileSort;
        if (currentPath) loadFiles(currentPath);
    }, [fileSort, currentPath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SORT_DIR_KEY, sortDir);
        sortDirRef.current = sortDir;
        if (currentPath) loadFiles(currentPath);
    }, [sortDir, currentPath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(NAME_SOURCE_KEY, nameSource);
        nameSourceRef.current = nameSource;
        if (currentPath) loadFiles(currentPath);
    }, [nameSource, currentPath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(FORMATS_KEY, JSON.stringify(formats));
        formatsRef.current = formats;
        if (currentPath) loadFiles(currentPath);
    }, [formats, currentPath]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('music-app-shuffle', String(shuffle));
        shuffleRef.current = shuffle;
    }, [shuffle]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('music-app-repeat', repeat);
        repeatRef.current = repeat;
        if (audioRef.current) audioRef.current.loop = repeat === 'one';
    }, [repeat]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(ACCENT_KEY, accentColor);
        if (accentColor === 'custom') {
            setCustomAccentVars(customAccentHex);
        } else {
            removeCustomAccentVars();
        }
    }, [accentColor, customAccentHex]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(CUSTOM_ACCENT_KEY, customAccentHex);
    }, [customAccentHex]);

    useEffect(() => {
        if (!isBrowserTauri) return;
        getTauri().then(mod => {
            mod.invoke('set_default_wallpaper_path', { path: defaultWallpaper });
        }).catch(() => {});
    }, [defaultWallpaper]);

    useEffect(() => {
        return () => {
            if (isBrowserTauri) {
                getTauri().then(mod =>
                    mod.invoke('clear_wallpaper')
                ).catch(() => {});
            }
        };
    }, []);

    // Stream URL listener — always active even when streaming modal is closed
    useEffect(() => {
        if (!isBrowserTauri) return;
        let unlisten: (() => void) | null = null;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<string>('stream-url-changed', (event) => {
                try {
                    const url = event.payload;
                    const domain = new URL(url).hostname.replace(/^www\./, '');
                    const raw = localStorage.getItem('music-app-stream-history');
                    const entries: Array<{ url: string; timestamp: number; domain: string }> = raw ? JSON.parse(raw) : [];
                    entries.unshift({ url, timestamp: Date.now(), domain });
                    const unique = entries.filter((e, i, a) => a.findIndex(x => x.url === e.url) === i).slice(0, 200);
                    localStorage.setItem('music-app-stream-history', JSON.stringify(unique));
                } catch {}
            }).then((fn) => { unlisten = fn; });
        });
        return () => { unlisten?.(); };
    }, []);

    useEffect(() => {
        const isInputFocused = () => {
            const el = document.activeElement;
            return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
        };

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'F12') {
                import('@tauri-apps/api/webview').then(m =>
                    (m as any).getCurrentWebview().openDevTools()
                ).catch(() => {});
                return;
            }

            // Don't trigger shortcuts while typing in inputs or when modals are open
            if (isInputFocused()) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPauseRef.current();
                    break;
                case 'n':
                case 'N':
                    e.preventDefault();
                    playNextRef.current();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    playPrevRef.current();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    setVolume(prev => {
                        const v = Math.min(1, Math.round((prev + 0.05) * 20) / 20);
                        if (audioRef.current) audioRef.current.volume = v;
                        return v;
                    });
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    setVolume(prev => {
                        const v = Math.max(0, Math.round((prev - 0.05) * 20) / 20);
                        if (audioRef.current) audioRef.current.volume = v;
                        return v;
                    });
                    break;
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    const loadFiles = useCallback(async (dirPath: string) => {
        const needsMetadata = nameSourceRef.current === 'title';
        if (needsMetadata) setLoadingFiles(true);
        try {
            const mod = await getTauri();
            const result = await mod.invoke<FileEntry[]>('list_files', {
                path: dirPath,
                folderSort: folderSortRef.current,
                fileSort: fileSortRef.current,
                sortDir: sortDirRef.current,
                nameSource: nameSourceRef.current,
                formats: formatsRef.current,
            });
            setFiles(result);
            setDebugError('');
        } catch (e) {
            const msg = String(e);
            showError(msg);
            setFiles([]);
        } finally {
            if (needsMetadata) setLoadingFiles(false);
        }
    }, []);

    const loadMetadata = useCallback(async (_filePath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<SongMetadata>('get_metadata', { filePath: _filePath });
            setMetadata(result);
            if (result.duration) setDuration(result.duration);

            if (isBrowserTauri && autoWallpaperRef.current) {
                if (result.cover_b64) {
                    mod.invoke('set_wallpaper', {
                        coverB64: result.cover_b64,
                    }).catch((e: unknown) => {
                        const msg = String(e);
                        showError(`Wallpaper error: ${msg}`);
                    });
                } else {
                    mod.invoke('clear_wallpaper').catch(() => {});
                }
            }
        } catch {
            setMetadata(null);
        }
    }, []);

    useEffect(() => {
        if (currentPath) {
            loadFiles(currentPath);
        } else {
            setFiles([]);
        }
    }, [currentPath, loadFiles]);

    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;
        audio.volume = volumeRef.current;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handleDurationChange = () => setDuration(audio.duration || 0);
        const handleEnded = () => {
            playNextRef.current();
        };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('ended', handleEnded);
            audio.src = '';
            audioRef.current = null;
        };
    }, []);

    const playSong = useCallback(async (file: FileEntry) => {
        if (file.is_dir) return;

        const audio = audioRef.current;
        if (!audio) return;

        if (filesRef.current.some(f => f.path === file.path)) {
            playlistRef.current = filesRef.current.filter(f => !f.is_dir);
        }

        audio.pause();

        try {
            let src: string;
            if (isBrowserTauri) {
                const mod = await getTauri();
                src = mod.convertFileSrc(file.path);
            } else {
                src = file.path;
            }
            audio.src = src;
            audio.volume = volumeRef.current;
            audio.loop = repeatRef.current === 'one';
            await audio.play();

            setSelectedSong(file);
            loadMetadata(file.path);
            addLog('info', `Memutar: ${file.name}`);
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            console.error('Gagal play:', e);
        }
    }, [loadMetadata, addLog]);
 
    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;

        if (audio.paused) {
            audio.play().catch(e => console.error('Gagal play:', e));
        } else {
            audio.pause();
        }
    }, []);

    const togglePlayPauseRef = useRef(togglePlayPause);
    useEffect(() => {
        togglePlayPauseRef.current = togglePlayPause;
    }, [togglePlayPause]);

    const resetPlayer = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
        }
        setSelectedSong(null);
        setMetadata(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        playlistRef.current = [];
        if (isBrowserTauri) {
            getTauri().then(mod => mod.invoke('clear_wallpaper')).catch(() => {});
        }
    }, []);

    const playNext = useCallback(() => {
        const list = playlistRef.current;
        if (list.length === 0) return;

        let nextFile: FileEntry | undefined;
        if (shuffleRef.current) {
            const currentPath = selectedSongRef.current?.path;
            const candidates = list.filter(f => f.path !== currentPath);
            if (candidates.length > 0) {
                nextFile = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                nextFile = list[0];
            }
        } else {
            const current = selectedSongRef.current;
            const idx = current ? list.findIndex(f => f.path === current.path) : -1;
            nextFile = idx >= 0 ? list[idx + 1] : list[0];
            if (!nextFile && repeatRef.current === 'all') {
                nextFile = list[0];
            }
        }
        if (nextFile) {
            playSong(nextFile);
        } else {
            resetPlayer();
        }
    }, [playSong, resetPlayer]);

    const playPrev = useCallback(() => {
        const list = playlistRef.current;
        if (list.length === 0) return;

        let prevFile: FileEntry | undefined;
        if (shuffleRef.current) {
            const currentPath = selectedSongRef.current?.path;
            const candidates = list.filter(f => f.path !== currentPath);
            if (candidates.length > 0) {
                prevFile = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                prevFile = list[0];
            }
        } else {
            const current = selectedSongRef.current;
            const idx = current ? list.findIndex(f => f.path === current.path) : -1;
            prevFile = idx > 0 ? list[idx - 1] : (repeatRef.current === 'all' ? list[list.length - 1] : undefined);
        }
        if (prevFile) {
            playSong(prevFile);
        }
    }, [playSong]);

    const playNextRef = useRef(playNext);
    useEffect(() => {
        playNextRef.current = playNext;
    }, [playNext]);

    const playPrevRef = useRef(playPrev);
    useEffect(() => {
        playPrevRef.current = playPrev;
    }, [playPrev]);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        if (audioRef.current) {
            audioRef.current.volume = v;
        }
    }, []);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        setCurrentTime(t);
        if (audioRef.current) {
            audioRef.current.currentTime = t;
        }
    }, []);

    const goUp = useCallback(() => {
        if (!currentPath || !musicFolder) return;
        const parent = currentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('\\');
        if (parent.length >= musicFolder.length) {
            setCurrentPath(parent);
        }
    }, [currentPath, musicFolder]);

    const [pendingFolderChange, setPendingFolderChange] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [streamingOpen, setStreamingOpen] = useState(false);
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateStatus, setUpdateStatus] = useState('');
    const [updateDownloaded, setUpdateDownloaded] = useState(0);
    const [updateTotal, setUpdateTotal] = useState(0);

    const doPickFolder = useCallback(async () => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<string | null>('pick_folder');
            if (result) {
                setMusicFolder(result);
                setCurrentPath(result);
                setSelectedSong(null);
                setMetadata(null);
            }
        } catch (e) {
            const msg = String(e);
            console.error('pick_folder error:', e);
            setDebugError(`Folder picker error: ${msg}`);
            showError(`Folder picker error: ${msg}`);
        }
    }, [setMusicFolder]);

    const handlePickFolder = useCallback(async () => {
        if (!isBrowserTauri) {
            setDebugError('Folder picker hanya tersedia di aplikasi desktop');
            showError('Folder picker hanya tersedia di aplikasi desktop');
            return;
        }
        if (isPlaying) {
            setPendingFolderChange(true);
            return;
        }
        await doPickFolder();
    }, [isPlaying, doPickFolder]);

    const handlePickWallpaper = useCallback(async () => {
        if (!isBrowserTauri) {
            setDebugError('Gambar picker hanya tersedia di aplikasi desktop');
            showError('Gambar picker hanya tersedia di aplikasi desktop');
            return;
        }
        try {
            const mod = await getTauri();
            const result = await mod.invoke<string | null>('pick_wallpaper');
            if (result) {
                setDefaultWallpaper(result);
            }
        } catch (e) {
            const msg = String(e);
            console.error('pick_wallpaper error:', e);
            setDebugError(`Wallpaper picker error: ${msg}`);
            showError(`Wallpaper picker error: ${msg}`);
        }
    }, [setDefaultWallpaper]);

    const handleCheckUpdate = useCallback(async () => {
        if (!isBrowserTauri) {
            setUpdateStatus('Hanya tersedia di aplikasi desktop');
            return;
        }
        setUpdateChecking(true);
        setUpdateStatus('');
        setUpdateDownloaded(0);
        setUpdateTotal(0);
        try {
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update) {
                setUpdateStatus(`v${update.version} tersedia. Mendownload...`);
                await update.download((ev) => {
                    if (ev.event === 'Started') {
                        setUpdateTotal(ev.data.contentLength ?? 0);
                        setUpdateDownloaded(0);
                    } else if (ev.event === 'Progress') {
                        setUpdateDownloaded((d) => d + ev.data.chunkLength);
                    }
                });
                setUpdateDownloaded((d) => (updateTotal > 0 ? updateTotal : d));
                setUpdateStatus(`v${update.version} siap. Menginstall...`);
                await update.install();
            } else {
                setUpdateStatus('Sudah versi terbaru');
            }
        } catch (e) {
            const msg = String(e);
            setUpdateStatus(`Error: ${msg.slice(0, 80)}`);
            addLog('error', `Update check failed: ${msg}`);
        } finally {
            setUpdateChecking(false);
            setUpdateDownloaded(0);
            setUpdateTotal(0);
        }
    }, [addLog, updateTotal]);

    const confirmFolderChange = useCallback(() => {
        setPendingFolderChange(false);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setCurrentTime(0);
        doPickFolder();
    }, [doPickFolder]);

    const displayPath = currentPath || '';

    return (
        <div className="h-full flex flex-col overflow-hidden bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
            <header className="flex items-center justify-center px-5 py-3 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm relative">
                <div className="absolute left-5 flex items-center gap-1.5">
                    <motion.button
                        onClick={() => setStreamingOpen(true)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 text-zinc-300 hover:text-zinc-100 text-xs font-medium cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 11a9 9 0 0 1 9 9" />
                            <path d="M4 4a16 16 0 0 1 16 16" />
                            <circle cx="5" cy="19" r="1" />
                        </svg>
                        Streaming
                    </motion.button>
                    <motion.button
                        onClick={() => setSettingsOpen(true)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 text-zinc-300 hover:text-zinc-100 text-xs font-medium cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                        Setting
                    </motion.button>
                </div>
                {isCompact && musicFolder && (
                    <div className="absolute left-[108px] flex items-center gap-1.5">
                        <motion.button
                            onClick={() => setShowLeftSidebar(v => !v)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92 }}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${showLeftSidebar ? 'bg-zinc-700/70 text-zinc-200' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
                            title="Toggle sidebar daftar lagu"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3h18v18H3z" />
                                <path d="M8 3v18" />
                            </svg>
                            List
                        </motion.button>
                        <motion.button
                            onClick={() => setShowRightSidebar(v => !v)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92 }}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${showRightSidebar ? 'bg-zinc-700/70 text-zinc-200' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
                            title="Toggle panel detail"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4M12 8h.01" />
                            </svg>
                            Info
                        </motion.button>
                    </div>
                )}
                <h1 className="text-lg font-bold tracking-tight text-zinc-100 truncate max-w-[40%]">
                    {selectedSong
                        ? (metadata?.title || selectedSong.name.replace(/\.[^.]+$/, ''))
                         : 'Symvonia'}
                </h1>
                {(() => {
                    const accent = getAccent(accentColor);
                    return (
                        <motion.span
                            key={isPlaying ? 'playing' : 'stopped'}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-full absolute right-5 flex items-center gap-1.5 ${isPlaying ? `${accent.bg15} ${accent.text400} border ${accent.border500_20}` : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/30'
                                }`}
                        >
                            {isPlaying ? (
                                <>
                                    <motion.span
                                        className={`inline-block w-1.5 h-1.5 rounded-full ${accent.bg400}`}
                                        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                    />
                                    Playing
                                </>
                            ) : (
                                <>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                    Stopped
                                </>
                            )}
                        </motion.span>
                    );
                })()}
            </header>

            <div className="flex flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                {!musicFolder ? (
                    <motion.div
                        key="no-folder"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="flex-1"
                    >
                        <NoFolderEmptyState onPickFolder={handlePickFolder} accentColor={accentColor} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="player-area"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="flex flex-1 overflow-hidden"
                    >
                        <AnimatePresence>
                            {(showLeftSidebar || !isCompact) && (
                                <motion.aside
                                    initial={isCompact ? { width: 0, opacity: 0 } : false}
                                    animate={{ width: 'auto', opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex shrink-0 overflow-hidden"
                                >
                                    <FolderExplorer
                                        files={files}
                                        loading={loadingFiles}
                                        selectedSong={selectedSong}
                                        playingAncestorPrefix={selectedSong?.path ?? null}
                                        displayPath={displayPath}
                                        debugError={debugError}
                                        goUp={goUp}
                                        setCurrentPath={setCurrentPath}
                                        playSong={playSong}
                                        onChangeFolder={handlePickFolder}
                                        musicFolder={musicFolder}
                                        resetSidebarToken={resetSidebarToken}
                                        accentColor={accentColor}
                                    />
                                </motion.aside>
                            )}
                        </AnimatePresence>

                        <main className="flex-1 flex items-center justify-center p-6 overflow-hidden">
                            {files.length === 0 ? (
                                <EmptyFolderState folder={displayPath} />
                            ) : (
                                <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
                                    <PlayerPanel
                                        metadata={metadata}
                                        selectedSong={selectedSong}
                                        accentColor={accentColor}
                                    />
                                    <SeekBar
                                        currentTime={currentTime}
                                        duration={duration}
                                        handleSeek={handleSeek}
                                        accentColor={accentColor}
                                    />
                                    <PlaybackControls
                                        selectedSong={selectedSong}
                                        isPlaying={isPlaying}
                                        shuffle={shuffle}
                                        repeat={repeat}
                                        playPrev={playPrev}
                                        togglePlayPause={togglePlayPause}
                                        playNext={playNext}
                                        setShuffle={setShuffleState}
                                        setRepeat={setRepeatState}
                                        accentColor={accentColor}
                                    />
                                    <VolumeControl
                                        volume={volume}
                                        handleVolumeChange={handleVolumeChange}
                                        accentColor={accentColor}
                                    />
                                </div>
                            )}
                        </main>

                        <AnimatePresence>
                            {(showRightSidebar || !isCompact) && (
                                <motion.aside
                                    initial={isCompact ? { width: 0, opacity: 0 } : false}
                                    animate={{ width: 'auto', opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex shrink-0 overflow-hidden"
                                >
                                    <MetadataPanel
                                        selectedSong={selectedSong}
                                        metadata={metadata}
                                        accentColor={accentColor}
                                        resetSidebarToken={resetSidebarToken}
                                    />
                                </motion.aside>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
            <ConfirmDialog
                open={pendingFolderChange}
                title="Ganti Folder Musik?"
                message="Musik sedang diputar. Mengganti folder akan menghentikan pemutaran saat ini. Lanjutkan?"
                confirmLabel="Ganti & Hentikan"
                cancelLabel="Batal"
                onConfirm={confirmFolderChange}
                onCancel={() => setPendingFolderChange(false)}
                accentColor={accentColor}
            />
            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                musicFolder={musicFolder}
                onChangeFolder={handlePickFolder}
                autoWallpaper={autoWallpaper}
                setAutoWallpaper={setAutoWallpaperState}
                resetOnClose={resetOnClose}
                setResetOnClose={setResetOnCloseState}
                defaultWallpaper={defaultWallpaper}
                onPickWallpaper={handlePickWallpaper}
                onClearWallpaper={() => setDefaultWallpaper(null)}
                folderSort={folderSort}
                setFolderSort={setFolderSortState}
                fileSort={fileSort}
                setFileSort={setFileSortState}
                sortDir={sortDir}
                setSortDir={setSortDirState}
                nameSource={nameSource}
                setNameSource={setNameSourceState}
                formats={formats}
                setFormats={setFormatsState}
                theme={theme}
                setTheme={setThemeState}
                accentColor={accentColor}
                setAccentColor={setAccentColorState}
                customAccentHex={customAccentHex}
                setCustomAccentHex={setCustomAccentHexState}
                onResetSidebarWidth={() => setResetSidebarToken((t) => t + 1)}
                logs={logs}
                onCheckUpdate={handleCheckUpdate}
                updateStatus={updateStatus}
                updateChecking={updateChecking}
                updateDownloaded={updateDownloaded}
                updateTotal={updateTotal}
            />
            <StreamingModal
                open={streamingOpen}
                onClose={() => setStreamingOpen(false)}
                accentColor={accentColor}
            />

            <AnimatePresence>
                {toastVisible && (
                    <motion.div
                        key="toast"
                        initial={{ opacity: 0, y: -12, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -12, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed top-4 right-4 z-[70] flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-900/80 border border-red-700/50 text-sm text-red-200 shadow-2xl shadow-black/40 backdrop-blur-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span>Terjadi error. Cek <strong>Debug</strong> log untuk detail.</span>
                        <button
                            onClick={() => setToastVisible(false)}
                            className="ml-2 w-5 h-5 rounded flex items-center justify-center text-red-300 hover:text-red-100 hover:bg-red-800/60 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function NoFolderEmptyState({ onPickFolder, accentColor }: { onPickFolder: () => void; accentColor: string }) {
    const accent = getAccent(accentColor);
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 rounded-3xl bg-zinc-900/80 border border-zinc-800/50 flex items-center justify-center mb-6 shadow-2xl shadow-black/50">
                <span className="text-5xl opacity-30">📁</span>
            </div>
            <h2 className="text-2xl font-semibold text-zinc-200 mb-2">Selamat Datang di Symvonia</h2>
            <p className="text-sm text-zinc-500 max-w-md mb-8 leading-relaxed">
                Pilih folder tempat kamu menyimpan koleksi musik untuk mulai memutar. Aplikasi akan membaca metadata
                dan cover art dari file audio secara otomatis.
            </p>
            <motion.button
                onClick={onPickFolder}
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center gap-2.5 px-6 py-3 ${accent.bg500} ${accent.hoverBg400} text-zinc-950 font-semibold rounded-xl cursor-pointer shadow-lg ${accent.shadow20}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                Pilih Folder Musik
            </motion.button>
        </div>
    );
}

function EmptyFolderState({ folder }: { folder: string }) {
    return (
        <div className="flex flex-col items-center justify-center text-center max-w-md">
            <div className="w-20 h-20 rounded-2xl bg-zinc-900/60 border border-zinc-800/50 flex items-center justify-center mb-5">
                <span className="text-4xl opacity-30">🎵</span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-200 mb-1.5">Folder Kosong</h3>
            <p className="text-sm text-zinc-500 leading-relaxed mb-1">
                Tidak ada file audio di folder ini.
            </p>
            <p className="text-xs text-zinc-600 font-mono truncate max-w-full px-4" title={folder}>
                {folder}
            </p>
        </div>
    );
}
