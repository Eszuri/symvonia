import {useCallback, useEffect, useRef, useState} from "react";
import type {FileEntry} from "../../components/FolderExplorer";
import {getTauri, isBrowserTauri} from "../../lib/homeState";
import {listenTauri, type LibraryCacheInvalidatedEvent} from "../../lib/tauri";
import {makeTempFileEntry, normalizePath} from "./playbackTypes";

export interface UseAudioQueueOptions {
    musicFolder: string | null;
    folderSort: string;
    fileSort: string;
    sortDir: string;
    nameSource: string;
    formats: string[];
    showError: (msg: string) => void;
    isMountedRef: React.RefObject<boolean>;
    onSongSelectedSync?: (filePath: string) => void;
    onSongSelectedMissing?: () => void;
}

export function useAudioQueue({
    musicFolder,
    folderSort,
    fileSort,
    sortDir,
    nameSource,
    formats,
    showError,
    isMountedRef,
    onSongSelectedSync,
    onSongSelectedMissing,
}: UseAudioQueueOptions) {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [filesLoadedOnce, setFilesLoadedOnce] = useState(false);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [currentPath, setCurrentPath] = useState<string | null>(() => musicFolder || null);
    const [selectedSong, setSelectedSong] = useState<FileEntry | null>(null);

    const filesRef = useRef<FileEntry[]>([]);
    const currentPathRef = useRef<string | null>(currentPath);
    const selectedSongRef = useRef<FileEntry | null>(null);
    const playlistRef = useRef<FileEntry[]>([]);
    const playlistFolderRef = useRef<string | null>(null);
    const loadFilesTokenRef = useRef(0);
    const libraryRootPromiseRef = useRef<Promise<void> | null>(null);
    const skipPlaylistRebuildRef = useRef(false);

    const folderSortRef = useRef<string>(folderSort);
    const fileSortRef = useRef<string>(fileSort);
    const sortDirRef = useRef<string>(sortDir);
    const nameSourceRef = useRef<string>(nameSource);
    const formatsRef = useRef<string[]>(formats);

    useEffect(() => {
        filesRef.current = files;
        currentPathRef.current = currentPath;
        selectedSongRef.current = selectedSong;
        folderSortRef.current = folderSort;
        fileSortRef.current = fileSort;
        sortDirRef.current = sortDir;
        nameSourceRef.current = nameSource;
        formatsRef.current = formats;
    }, [files, currentPath, selectedSong, folderSort, fileSort, sortDir, nameSource, formats]);

    const listFiles = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
        await libraryRootPromiseRef.current;
        const mod = await getTauri();
        return mod.invoke<FileEntry[]>("list_files", {
            path: dirPath,
            folderSort: folderSortRef.current || "name",
            fileSort: fileSortRef.current || "name",
            sortDir: sortDirRef.current || "asc",
            nameSource: nameSourceRef.current || "filename",
            formats: formatsRef.current && formatsRef.current.length > 0
                ? formatsRef.current
                : ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'wma'],
        });
    }, []);

    const loadFiles = useCallback(
        async (dirPath: string) => {
            const token = ++loadFilesTokenRef.current;
            setLoadingFiles(true);
            try {
                const result = await listFiles(dirPath);
                if (token !== loadFilesTokenRef.current) return;
                setFiles(result || []);
                setSelectedSong((prev) => {
                    if (!prev) return null;
                    const updated = (result || []).find((f) => f.path === prev.path);
                    return updated || prev;
                });
            } catch (e) {
                if (token !== loadFilesTokenRef.current) return;
                console.error("[Symvonia] Failed to list files in:", dirPath, e);
                showError(String(e));
                setFiles([]);
            } finally {
                if (token === loadFilesTokenRef.current) {
                    setLoadingFiles(false);
                    setFilesLoadedOnce(true);
                }
            }
        },
        [listFiles, showError],
    );

    const refreshFiles = useCallback(() => {
        if (!currentPath) return;
        if (isBrowserTauri()) {
            getTauri()
                .then((mod) => mod.invoke("invalidate_library_directory", {path: currentPath}))
                .catch(() => {})
                .finally(() => loadFiles(currentPath));
            return;
        }
        loadFiles(currentPath);
    }, [currentPath, loadFiles]);

    const goUp = useCallback(() => {
        if (!currentPath || !musicFolder) return;
        const parent = currentPath
            .replace(/\\/g, "/")
            .split("/")
            .slice(0, -1)
            .join("\\");
        if (parent.length >= musicFolder.length) setCurrentPath(parent);
    }, [currentPath, musicFolder]);

    const syncSongPlaylist = useCallback(async (filePath: string) => {
        const songParent = filePath.replace(/[/\\][^/\\]+$/, "");
        try {
            let fileList = filesRef.current;
            if (currentPathRef.current !== songParent || fileList.length === 0) {
                if (isBrowserTauri()) {
                    fileList = await listFiles(songParent);
                    if (isMountedRef.current) {
                        setFiles(fileList);
                        setCurrentPath(songParent);
                    }
                }
            }
            const songFile = fileList.find((f) => !f.is_dir && f.path === filePath);
            const targetSong = songFile || makeTempFileEntry(filePath);
            if (isMountedRef.current) {
                setSelectedSong(targetSong);
                onSongSelectedSync?.(filePath);
            }
            playlistRef.current = fileList.filter((f) => !f.is_dir);
            playlistFolderRef.current = songParent;
        } catch {
            const tempFile = makeTempFileEntry(filePath);
            if (isMountedRef.current) {
                setSelectedSong(tempFile);
                onSongSelectedSync?.(filePath);
            }
        }
    }, [listFiles, onSongSelectedSync, isMountedRef]);

    const getNextSong = useCallback((shuffle: boolean, repeat: "off" | "all" | "one"): FileEntry | null => {
        const list = playlistRef.current;
        if (list.length === 0) return null;

        if (shuffle) {
            const curPath = selectedSongRef.current?.path;
            const candidates = list.filter((f) => f.path !== curPath);
            return candidates.length > 0
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : list[0];
        }

        const idx = selectedSongRef.current
            ? list.findIndex((f) => f.path === selectedSongRef.current!.path)
            : -1;
        const nextFile = idx >= 0 ? list[idx + 1] : list[0];
        if (!nextFile && repeat === "all") return list[0];
        return nextFile || null;
    }, []);

    const getPrevSong = useCallback((shuffle: boolean, repeat: "off" | "all" | "one"): FileEntry | null => {
        const list = playlistRef.current;
        if (list.length === 0) return null;

        if (shuffle) {
            const curPath = selectedSongRef.current?.path;
            const candidates = list.filter((f) => f.path !== curPath);
            return candidates.length > 0
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : list[0];
        }

        const idx = selectedSongRef.current
            ? list.findIndex((f) => f.path === selectedSongRef.current!.path)
            : -1;
        return idx > 0
            ? list[idx - 1]
            : repeat === "all"
                ? list[list.length - 1]
                : null;
    }, []);

    // Set library root when musicFolder changes
    useEffect(() => {
        if (!isBrowserTauri()) {
            libraryRootPromiseRef.current = null;
            return;
        }
        const previous = libraryRootPromiseRef.current ?? Promise.resolve();
        const promise = previous
            .catch(() => {})
            .then(() => getTauri())
            .then((mod) => mod.invoke("set_library_root", {path: musicFolder}))
            .then(() => undefined);
        libraryRootPromiseRef.current = promise;
        promise.catch((error) => console.error("[Symvonia] Failed to set library root:", error));
    }, [musicFolder]);

    // Align currentPath with musicFolder
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (musicFolder) {
                setCurrentPath((prev) => {
                    const normalizedPrev = prev ? normalizePath(prev) : "";
                    const normalizedRoot = normalizePath(musicFolder);
                    if (!normalizedPrev || (normalizedPrev !== normalizedRoot && !normalizedPrev.startsWith(`${normalizedRoot}/`))) {
                        return musicFolder;
                    }
                    return prev;
                });
            } else {
                setCurrentPath(null);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [musicFolder]);

    // Cache invalidation listener
    useEffect(() => {
        if (!isBrowserTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | null = null;
        void listenTauri<LibraryCacheInvalidatedEvent>("library-cache-invalidated", (event) => {
            if (disposed || !musicFolder) return;
            if (normalizePath(event.root_path) !== normalizePath(musicFolder)) return;
            const affected = event.affected_paths.map(normalizePath);
            const current = currentPathRef.current ? normalizePath(currentPathRef.current) : "";
            const playlistFolder = playlistFolderRef.current ? normalizePath(playlistFolderRef.current) : "";
            const isAffected = (path: string) => affected.includes(path);
            const currentAffected = Boolean(current) && isAffected(current);
            const playlistAffected = Boolean(playlistFolder) && isAffected(playlistFolder);
            if (currentAffected) void loadFiles(currentPathRef.current!);
            if (playlistAffected && playlistFolderRef.current) {
                void listFiles(playlistFolderRef.current).then((result) => {
                    if (!isMountedRef.current) return;
                    playlistRef.current = result.filter((file) => !file.is_dir);
                    const selected = selectedSongRef.current;
                    if (selected && !playlistRef.current.some((file) => file.path === selected.path)) {
                        selectedSongRef.current = null;
                        setSelectedSong(null);
                        onSongSelectedMissing?.();
                    }
                }).catch(() => {});
            }
        }).then((cleanup) => {
            if (disposed) cleanup();
            else unlisten = cleanup;
        }).catch(() => {});
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [listFiles, loadFiles, musicFolder, isMountedRef, onSongSelectedMissing]);

    // Load files when path changes
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (currentPath) {
                void loadFiles(currentPath);
            } else {
                setFiles([]);
                setFilesLoadedOnce(true);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [currentPath, loadFiles]);

    // Load files when sorting or formats change
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (currentPath) void loadFiles(currentPath);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [currentPath, folderSort, fileSort, sortDir, nameSource, formats, loadFiles]);

    // Rebuild playlist on sort change
    useEffect(() => {
        skipPlaylistRebuildRef.current = true;
    }, [folderSort, nameSource]);

    useEffect(() => {
        if (skipPlaylistRebuildRef.current) {
            skipPlaylistRebuildRef.current = false;
            return;
        }
        if (!playlistFolderRef.current) return;
        if (currentPath !== playlistFolderRef.current) return;
        const freshFiles = files.filter((f) => !f.is_dir);
        playlistRef.current = freshFiles;
    }, [currentPath, files]);

    return {
        files,
        setFiles,
        filesRef,
        filesLoadedOnce,
        setFilesLoadedOnce,
        loadingFiles,
        setLoadingFiles,
        currentPath,
        setCurrentPath,
        currentPathRef,
        selectedSong,
        setSelectedSong,
        selectedSongRef,
        playlistRef,
        playlistFolderRef,
        loadFilesTokenRef,
        listFiles,
        loadFiles,
        refreshFiles,
        goUp,
        syncSongPlaylist,
        getNextSong,
        getPrevSong,
    };
}
