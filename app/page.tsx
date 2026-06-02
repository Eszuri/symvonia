'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import FolderExplorer, { FileEntry } from './components/FolderExplorer';
import PlayerPanel, { SongMetadata } from './components/PlayerPanel';
import SeekBar from './components/SeekBar';
import PlaybackControls from './components/PlaybackControls';
import VolumeControl from './components/VolumeControl';
import ConfirmDialog from './components/ConfirmDialog';

const isBrowserTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const FOLDER_STORAGE_KEY = 'music-app-folder';

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
    const [currentPath, setCurrentPath] = useState<string | null>(null);
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

    filesRef.current = files;
    selectedSongRef.current = selectedSong;
    volumeRef.current = volume;

    const setMusicFolder = useCallback((folder: string | null) => {
        setMusicFolderState(folder);
        if (folder) {
            window.localStorage.setItem(FOLDER_STORAGE_KEY, folder);
        } else {
            window.localStorage.removeItem(FOLDER_STORAGE_KEY);
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
        return () => {
            if (isBrowserTauri) {
                getTauri().then(mod =>
                    mod.invoke('clear_wallpaper')
                ).catch(() => {});
            }
        };
    }, []);

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
            const result = await mod.invoke<FileEntry[]>('list_files', { path: dirPath });
            setFiles(result);
            setDebugError('');
        } catch (e) {
            const msg = String(e);
            setDebugError(msg);
            console.error('list_files error:', e);
            setFiles([]);
        }
    }, []);

    const loadMetadata = useCallback(async (_filePath: string) => {
        try {
            const mod = await getTauri();
            const result = await mod.invoke<SongMetadata>('get_metadata', { filePath: _filePath });
            setMetadata(result);
            if (result.duration) setDuration(result.duration);

            if (isBrowserTauri) {
                if (result.cover_b64) {
                    mod.invoke('set_wallpaper', {
                        coverB64: result.cover_b64,
                    }).catch((e: unknown) => {
                        const msg = String(e);
                        console.error('Gagal set wallpaper:', msg);
                        setDebugError(`Wallpaper error: ${msg}`);
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
            audioRef.current?.pause();
        }
    }, [playSong]);

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

    const playNextRef = useRef(playNext);
    useEffect(() => {
        playNextRef.current = playNext;
    }, [playNext]);

    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;

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

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !audio.src) return;

        if (audio.paused) {
            audio.play().catch(e => console.error('Gagal play:', e));
        } else {
            audio.pause();
        }
    }, []);

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
        }
    }, [setMusicFolder]);

    const handlePickFolder = useCallback(async () => {
        if (!isBrowserTauri) {
            setDebugError('Folder picker hanya tersedia di aplikasi desktop');
            return;
        }
        if (isPlaying) {
            setPendingFolderChange(true);
            return;
        }
        await doPickFolder();
    }, [isPlaying, doPickFolder]);

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
        <div className="h-full flex flex-col bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
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

            <div className="flex flex-1 overflow-hidden">
                {!musicFolder ? (
                    <NoFolderEmptyState onPickFolder={handlePickFolder} />
                ) : (
                    <>
                        <FolderExplorer
                            files={files}
                            selectedSong={selectedSong}
                            displayPath={displayPath}
                            debugError={debugError}
                            goUp={goUp}
                            setCurrentPath={setCurrentPath}
                            playSong={playSong}
                            onChangeFolder={handlePickFolder}
                            musicFolder={musicFolder}
                        />

                        <main className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
                            {files.length === 0 ? (
                                <EmptyFolderState folder={displayPath} />
                            ) : (
                                <div className="flex flex-col items-center gap-5 w-full max-w-2xl">
                                    <PlayerPanel
                                        metadata={metadata}
                                        selectedSong={selectedSong}
                                    />
                                    <SeekBar
                                        currentTime={currentTime}
                                        duration={duration}
                                        handleSeek={handleSeek}
                                    />
                                    <PlaybackControls
                                        selectedSong={selectedSong}
                                        isPlaying={isPlaying}
                                        playPrev={playPrev}
                                        togglePlayPause={togglePlayPause}
                                        playNext={playNext}
                                    />
                                    <VolumeControl
                                        volume={volume}
                                        handleVolumeChange={handleVolumeChange}
                                    />
                                </div>
                            )}
                        </main>
                    </>
                )}
            </div>
            <ConfirmDialog
                open={pendingFolderChange}
                title="Ganti Folder Musik?"
                message="Musik sedang diputar. Mengganti folder akan menghentikan pemutaran saat ini. Lanjutkan?"
                confirmLabel="Ganti & Hentikan"
                cancelLabel="Batal"
                onConfirm={confirmFolderChange}
                onCancel={() => setPendingFolderChange(false)}
            />
        </div>
    );
}

function NoFolderEmptyState({ onPickFolder }: { onPickFolder: () => void }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 rounded-3xl bg-zinc-900/80 border border-zinc-800/50 flex items-center justify-center mb-6 shadow-2xl shadow-black/50">
                <span className="text-5xl opacity-30">📁</span>
            </div>
            <h2 className="text-2xl font-semibold text-zinc-200 mb-2">Selamat Datang di My Music</h2>
            <p className="text-sm text-zinc-500 max-w-md mb-8 leading-relaxed">
                Pilih folder tempat kamu menyimpan koleksi musik untuk mulai memutar. Aplikasi akan membaca metadata
                dan cover art dari file audio secara otomatis.
            </p>
            <button
                onClick={onPickFolder}
                className="flex items-center gap-2.5 px-6 py-3 bg-green-500 hover:bg-green-400 text-zinc-950 font-semibold rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg shadow-green-500/20"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                Pilih Folder Musik
            </button>
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
