'use client';

import {useCallback, useEffect, useRef, useState} from 'react';

const AUDIO_EXTS = new Set(['mp3', 'flac', 'ogg', 'wav', 'm4a', 'wma']);
const ROOT_PATH = 'D:\\Anime_Ost';

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    ext: string;
    mtime: number;
}

interface SongMetadata {
    title: string | null;
    artist: string | null;
    album: string | null;
    duration: number | null;
    cover_b64: string | null;
    cover_mime: string | null;
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

const isBrowserTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const MOCK_FILES: FileEntry[] = [
    {name: 'Folder Anime', path: 'D:\\Anime_Ost\\Folder Anime', is_dir: true, ext: '', mtime: 100},
    {name: '01 - Opening.mp3', path: 'D:\\Anime_Ost\\01 - Opening.mp3', is_dir: false, ext: 'mp3', mtime: 200},
    {name: '02 - Ending.mp3', path: 'D:\\Anime_Ost\\02 - Ending.mp3', is_dir: false, ext: 'mp3', mtime: 300},
    {name: '03 - OST Theme.flac', path: 'D:\\Anime_Ost\\03 - OST Theme.flac', is_dir: false, ext: 'flac', mtime: 400},
];

export default function Home() {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [currentPath, setCurrentPath] = useState(ROOT_PATH);
    const [selectedSong, setSelectedSong] = useState<FileEntry | null>(null);
    const [metadata, setMetadata] = useState<SongMetadata | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [debugError, setDebugError] = useState('');

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animFrameRef = useRef<number>(0);
    const filesRef = useRef<FileEntry[]>([]);
    const selectedSongRef = useRef<FileEntry | null>(null);
    const playSongRef = useRef<(file: FileEntry) => void>(() => {});

    filesRef.current = files;
    selectedSongRef.current = selectedSong;

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'F12') {
                import('@tauri-apps/api/webview').then(m =>
                    (m as any).getCurrentWebview().openDevTools()
                ).catch(() => {});
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    const loadFiles = useCallback(async (dirPath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<FileEntry[]>('list_files', {path: dirPath});
            setFiles(result);
            setDebugError('');
        } catch (e) {
            const msg = String(e);
            setDebugError(msg);
            console.error('list_files error:', e);
            setFiles(MOCK_FILES);
        }
    }, []);

    const loadMetadata = useCallback(async (_filePath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<SongMetadata>('get_metadata', {filePath: _filePath});
            setMetadata(result);
            if (result.duration) setDuration(result.duration);
        } catch {
            setMetadata(null);
        }
    }, []);

    useEffect(() => {
        loadFiles(currentPath);
    }, [currentPath, loadFiles]);

    useEffect(() => {
        audioRef.current = new Audio();
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    const updateProgress = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
        animFrameRef.current = requestAnimationFrame(updateProgress);
    }, []);

    const playNext = useCallback(() => {
        const current = selectedSongRef.current;
        const list = filesRef.current;
        if (!current) return;

        const audioFiles = list.filter(f => !f.is_dir);
        const idx = audioFiles.findIndex(f => f.path === current.path);
        const nextFile = audioFiles[idx + 1];
        if (nextFile) {
            playSongRef.current(nextFile);
        } else {
            setIsPlaying(false);
            cancelAnimationFrame(animFrameRef.current);
        }
    }, []);

    const playPrev = useCallback(() => {
        const current = selectedSongRef.current;
        const list = filesRef.current;
        if (!current) return;

        const audioFiles = list.filter(f => !f.is_dir);
        const idx = audioFiles.findIndex(f => f.path === current.path);
        const prevFile = audioFiles[idx - 1];
        if (prevFile) {
            playSongRef.current(prevFile);
        }
    }, []);

    const playSong = useCallback(async (file: FileEntry) => {
        if (file.is_dir) return;

        const audio = audioRef.current;
        if (!audio) return;

        audio.pause();
        setIsPlaying(false);
        cancelAnimationFrame(animFrameRef.current);

        try {
            let src: string;
            if (isBrowserTauri) {
                const mod = await getTauri();
                src = mod.convertFileSrc(file.path);
            } else {
                src = file.path;
            }
            audio.src = src;
            audio.volume = volume;
            audio.onended = playNext;
            await audio.play();

            setSelectedSong(file);
            setIsPlaying(true);
            loadMetadata(file.path);
            animFrameRef.current = requestAnimationFrame(updateProgress);
        } catch (e) {
            console.error('Gagal play:', e);
        }
    }, [volume, loadMetadata, updateProgress, playNext]);

    playSongRef.current = playSong;

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
            cancelAnimationFrame(animFrameRef.current);
        } else {
            audio.play();
            setIsPlaying(true);
            animFrameRef.current = requestAnimationFrame(updateProgress);
        }
    }, [isPlaying, updateProgress]);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        if (audioRef.current) audioRef.current.volume = v;
    }, []);

    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        setCurrentTime(t);
        if (audioRef.current) audioRef.current.currentTime = t;
    }, []);

    const goUp = useCallback(() => {
        const parent = currentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('\\');
        const parentPath = parent || ROOT_PATH;
        if (parentPath.length >= ROOT_PATH.length) {
            setCurrentPath(parentPath);
        }
    }, [currentPath]);

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const relativePath = currentPath.replace(ROOT_PATH, '') || '\\';
    const displayPath = `D:\\Anime_Ost${relativePath}`;

    const songTitle = selectedSong ? (metadata?.title || selectedSong.name.replace(/\.[^/.]+$/, '')) : 'No song selected';
    const songArtist = metadata?.artist || 'Unknown Artist';
    const songAlbum = metadata?.album || null;

    return (
        <div className="h-full flex flex-col bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
            {/* Header */}
            <header className="flex items-center justify-center px-5 py-3 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm relative">
                <div className="flex items-center gap-3 absolute left-5">
                    <span className="text-xl">🎵</span>
                </div>
                <h1 className="text-lg font-bold tracking-tight text-zinc-100">My Music</h1>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full absolute right-5 ${isPlaying ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/30'
                    }`}>
                    {isPlaying ? '● Playing' : '● Stopped'}
                </span>
            </header>

            {/* Main */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-72 flex flex-col border-r border-zinc-800/50 bg-black/30">
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/30">
                        <button
                            onClick={goUp}
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/60 
                text-zinc-400 hover:text-zinc-100 transition-all active:scale-95 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </button>
                        <span className="text-xs text-zinc-500 truncate">{displayPath}</span>
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
                </aside>

                {/* Player Panel */}
                <main className="flex-1 flex items-center justify-center p-6">
                    <div className="flex flex-col items-center gap-5 w-full max-w-2xl">
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
                            <p className="text-sm text-zinc-400 mt-1.5 wrap-break-word">{songArtist}</p>
                            {songAlbum && (
                                <p className="text-sm text-zinc-500 mt-0.5 wrap-break-word">{songAlbum}</p>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="w-full">
                            <input
                                type="range"
                                min="0"
                                max={duration || 0}
                                value={currentTime}
                                onChange={handleSeek}
                                className="w-full h-1 appearance-none bg-zinc-800 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500
                  [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-green-500/30"
                                style={{
                                    background: `linear-gradient(to right, #22c55e ${progressPct}%, #27272a ${progressPct}%)`,
                                }}
                            />
                            <div className="flex justify-between text-[11px] text-zinc-600 mt-1">
                                <span>{formatTime(currentTime)}</span>
                                <span>{duration > 0 ? formatTime(duration) : '--:--:--'}</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-6">
                            <button onClick={playPrev} disabled={!selectedSong} className="text-zinc-400 hover:text-zinc-100 transition-colors text-2xl disabled:opacity-30 cursor-pointer">⏮</button>
                            <button
                                onClick={togglePlayPause}
                                disabled={!selectedSong}
                                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 disabled:bg-zinc-800
                  disabled:text-zinc-600 text-zinc-950 flex items-center justify-center text-2xl
                  transition-all shadow-lg shadow-green-500/25 disabled:shadow-none cursor-pointer"
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            <button onClick={playNext} disabled={!selectedSong} className="text-zinc-400 hover:text-zinc-100 transition-colors text-2xl disabled:opacity-30 cursor-pointer">⏭</button>
                        </div>

                        {/* Volume */}
                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                            <span className="text-xs">🔉</span>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-32 h-1 appearance-none bg-zinc-800 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-300"
                                style={{
                                    background: `linear-gradient(to right, #d4d4d8 ${volume * 100}%, #27272a ${volume * 100}%)`,
                                }}
                            />
                            <span className="text-xs tabular-nums w-8 text-right text-zinc-500">{Math.round(volume * 100)}%</span>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
