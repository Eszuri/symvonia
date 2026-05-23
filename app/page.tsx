'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import FolderExplorer, { FileEntry } from './components/FolderExplorer';
import PlayerPanel, { SongMetadata } from './components/PlayerPanel';
import SeekBar from './components/SeekBar';
import PlaybackControls from './components/PlaybackControls';
import VolumeControl from './components/VolumeControl';

const ROOT_PATH = 'D:\\Anime_Ost';
const isBrowserTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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

const MOCK_FILES: FileEntry[] = [
    { name: 'Folder Anime', path: 'D:\\Anime_Ost\\Folder Anime', is_dir: true, ext: '', mtime: 100 },
    { name: '01 - Opening.mp3', path: 'D:\\Anime_Ost\\01 - Opening.mp3', is_dir: false, ext: 'mp3', mtime: 200 },
    { name: '02 - Ending.mp3', path: 'D:\\Anime_Ost\\02 - Ending.mp3', is_dir: false, ext: 'mp3', mtime: 300 },
    { name: '03 - OST Theme.flac', path: 'D:\\Anime_Ost\\03 - OST Theme.flac', is_dir: false, ext: 'flac', mtime: 400 },
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
    const filesRef = useRef<FileEntry[]>([]);
    const selectedSongRef = useRef<FileEntry | null>(null);
    const volumeRef = useRef<number>(volume);

    // Sync state values to refs for callback stability
    filesRef.current = files;
    selectedSongRef.current = selectedSong;
    volumeRef.current = volume;

    // F12 Developer Tools Listener
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

    // Load directory files list
    const loadFiles = useCallback(async (dirPath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<FileEntry[]>('list_files', { path: dirPath });
            setFiles(result);
            setDebugError('');
        } catch (e) {
            const msg = String(e);
            setDebugError(msg);
            console.error('list_files error:', e);
            setFiles(MOCK_FILES);
        }
    }, []);

    // Load track metadata from Tauri backend
    const loadMetadata = useCallback(async (_filePath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<SongMetadata>('get_metadata', { filePath: _filePath });
            setMetadata(result);
            if (result.duration) setDuration(result.duration);

            if (result.cover_b64 && result.cover_mime && isBrowserTauri) {
                mod.invoke('set_wallpaper', {
                    coverB64: result.cover_b64,
                    coverMime: result.cover_mime,
                }).catch((e: unknown) => {
                    const msg = String(e);
                    console.error('Gagal set wallpaper:', msg);
                    setDebugError(`Wallpaper error: ${msg}`);
                });
            }
        } catch {
            setMetadata(null);
        }
    }, []);

    // Fetch files list on current path change
    useEffect(() => {
        loadFiles(currentPath);
    }, [currentPath, loadFiles]);

    // Main play track function
    const playSong = useCallback(async (file: FileEntry) => {
        if (file.is_dir) return;

        const audio = audioRef.current;
        if (!audio) return;

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
            await audio.play();

            setSelectedSong(file);
            loadMetadata(file.path);
        } catch (e) {
            console.error('Gagal play:', e);
        }
    }, [loadMetadata]);

    // Handle play next track
    const playNext = useCallback(() => {
        const current = selectedSongRef.current;
        const list = filesRef.current;
        if (!current) return;

        const audioFiles = list.filter(f => !f.is_dir);
        const idx = audioFiles.findIndex(f => f.path === current.path);
        const nextFile = audioFiles[idx + 1];
        if (nextFile) {
            playSong(nextFile);
        } else {
            // Reached the end of folder playlist
            audioRef.current?.pause();
        }
    }, [playSong]);

    // Handle play previous track
    const playPrev = useCallback(() => {
        const current = selectedSongRef.current;
        const list = filesRef.current;
        if (!current) return;

        const audioFiles = list.filter(f => !f.is_dir);
        const idx = audioFiles.findIndex(f => f.path === current.path);
        const prevFile = audioFiles[idx - 1];
        if (prevFile) {
            playSong(prevFile);
        }
    }, [playSong]);

    // Keep playNext reference up-to-date for HTMLAudioElement event listener
    const playNextRef = useRef(playNext);
    useEffect(() => {
        playNextRef.current = playNext;
    }, [playNext]);

    // Initialize event-driven HTMLAudioElement
    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;

        // Synchronize initial volume setting
        audio.volume = volumeRef.current;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };
        const handleDurationChange = () => {
            setDuration(audio.duration || 0);
        };
        const handleEnded = () => {
            playNextRef.current();
        };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.pause();
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('ended', handleEnded);
            audioRef.current = null;
        };
    }, []);

    // Play or pause the audio track
    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;

        if (audio.paused) {
            audio.play().catch(e => console.error('Gagal play:', e));
        } else {
            audio.pause();
        }
    }, []);

    // Change volume level
    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        if (audioRef.current) {
            audioRef.current.volume = v;
        }
    }, []);

    // Seek playback position
    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        setCurrentTime(t);
        if (audioRef.current) {
            audioRef.current.currentTime = t;
        }
    }, []);

    // Go up one directory level
    const goUp = useCallback(() => {
        const parent = currentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('\\');
        const parentPath = parent || ROOT_PATH;
        if (parentPath.length >= ROOT_PATH.length) {
            setCurrentPath(parentPath);
        }
    }, [currentPath]);

    const relativePath = currentPath.replace(ROOT_PATH, '') || '\\';
    const displayPath = `D:\\Anime_Ost${relativePath}`;

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
                {/* Sidebar penjelajah folder */}
                <FolderExplorer
                    files={files}
                    selectedSong={selectedSong}
                    displayPath={displayPath}
                    debugError={debugError}
                    goUp={goUp}
                    setCurrentPath={setCurrentPath}
                    playSong={playSong}
                />

                {/* Player Panel */}
                <main className="flex-1 flex items-center justify-center p-6">
                    <div className="flex flex-col items-center gap-5 w-full max-w-2xl">
                        {/* Cover dan Metadata */}
                        <PlayerPanel
                            metadata={metadata}
                            selectedSong={selectedSong}
                        />

                        {/* Progress Timeline */}
                        <SeekBar
                            currentTime={currentTime}
                            duration={duration}
                            handleSeek={handleSeek}
                        />

                        {/* Controls */}
                        <PlaybackControls
                            selectedSong={selectedSong}
                            isPlaying={isPlaying}
                            playPrev={playPrev}
                            togglePlayPause={togglePlayPause}
                            playNext={playNext}
                        />

                        {/* Volume Control */}
                        <VolumeControl
                            volume={volume}
                            handleVolumeChange={handleVolumeChange}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
}
