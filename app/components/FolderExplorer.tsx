'use client';

import React from 'react';

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
}

export default function FolderExplorer({
    files,
    selectedSong,
    displayPath,
    debugError,
    goUp,
    setCurrentPath,
    playSong,
}: FolderExplorerProps) {
    return (
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
    );
}
