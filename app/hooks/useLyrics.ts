'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTauri, isBrowserTauri } from '../lib/homeState';

interface LyricLine {
    id: number;
    timeSec: number | null;
    text: string;
}

export interface OnlineLyricItem {
    id?: number;
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    instrumental?: boolean;
    plainLyrics?: string;
    syncedLyrics?: string;
}

export interface LyricsState {
    rawText: string | null;
    lines: LyricLine[];
    isSynced: boolean;
    source: string | null; // "lrc_file" | "embedded" | "custom" | "lrclib"
    loading: boolean;
    isFetchingOnline: boolean;
    activeIndex: number;
    importLyricsFile: (fileContent: string, fileName: string) => void;
    fetchOnlineLyrics: (title?: string, artist?: string, album?: string, duration?: number) => Promise<boolean>;
    searchOnlineLyrics: (query: string) => Promise<OnlineLyricItem[]>;
    applyLyrics: (content: string, sourceName?: string) => void;
    saveAsLrcFile: () => Promise<boolean>;
}

/** Parses raw LRC format string into array of timestamped lines */
function parseLrcText(rawText: string): { lines: LyricLine[]; isSynced: boolean } {
    if (!rawText || !rawText.trim()) {
        return { lines: [], isSynced: false };
    }

    const rawLines = rawText.split(/\r?\n/);
    const parsed: LyricLine[] = [];
    const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    let hasTimestamps = false;

    let idCounter = 0;

    for (const rawLine of rawLines) {
        const text = rawLine.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
        const matches = Array.from(rawLine.matchAll(timeRegex));

        if (matches.length > 0) {
            hasTimestamps = true;
            for (const match of matches) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const fracStr = match[3] || '0';
                let fraction = parseFloat(`0.${fracStr}`);
                if (fracStr.length === 2) fraction = parseInt(fracStr, 10) / 100;
                if (fracStr.length === 3) fraction = parseInt(fracStr, 10) / 1000;

                const timeSec = minutes * 60 + seconds + (isNaN(fraction) ? 0 : fraction);
                parsed.push({
                    id: idCounter++,
                    timeSec,
                    text: text || '♪',
                });
            }
        } else if (text.length > 0 && !rawLine.startsWith('[ti:') && !rawLine.startsWith('[ar:') && !rawLine.startsWith('[al:')) {
            parsed.push({
                id: idCounter++,
                timeSec: null,
                text,
            });
        }
    }

    if (hasTimestamps) {
        parsed.sort((a, b) => {
            if (a.timeSec === null) return 1;
            if (b.timeSec === null) return -1;
            return a.timeSec - b.timeSec;
        });
    }

    return { lines: parsed, isSynced: hasTimestamps };
}

export function useLyrics(
    songPath: string | null,
    currentTime: number,
    songTitle?: string,
    artistName?: string,
    albumName?: string,
    duration?: number
): LyricsState {
    const [rawText, setRawText] = useState<string | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(Boolean(songPath && isBrowserTauri()));
    const [isFetchingOnline, setIsFetchingOnline] = useState<boolean>(false);

    // Function to manually trigger online search for lyrics
    const fetchOnlineLyrics = useCallback(
        async (title?: string, artist?: string, album?: string, dur?: number): Promise<boolean> => {
            const queryTitle = title || songTitle;
            if (!queryTitle || !isBrowserTauri()) return false;

            setIsFetchingOnline(true);
            try {
                const mod = await getTauri();
                const res = await mod.invoke<{ raw_text: string; source: string } | null>('fetch_online_lyrics', {
                    trackName: queryTitle,
                    artistName: artist || artistName || null,
                    albumName: album || albumName || null,
                    duration: dur || duration || null,
                });

                if (res && res.raw_text) {
                    setRawText(res.raw_text);
                    setSource('lrclib');
                    return true;
                }
            } catch (err) {
                console.warn('Failed to fetch online lyrics:', err);
            } finally {
                setIsFetchingOnline(false);
            }
            return false;
        },
        [songTitle, artistName, albumName, duration]
    );

    // Load lyrics from Rust IPC whenever songPath changes (local .lrc or embedded)
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setRawText(null);
            setSource(null);
            setLoading(Boolean(songPath && isBrowserTauri()));
        });
        if (!songPath) {
            return () => cancelAnimationFrame(frame);
        }

        let isMounted = true;

        if (isBrowserTauri()) {
            getTauri()
                .then((mod) => mod.invoke<{ raw_text: string; source: string } | null>('get_lyrics', { filePath: songPath }))
                .then((res) => {
                    if (!isMounted) return;
                    if (res && res.raw_text) {
                        setRawText(res.raw_text);
                        setSource(res.source);
                    } else {
                        setRawText(null);
                        setSource(null);
                    }
                })
                .catch(() => {
                    if (isMounted) {
                        setRawText(null);
                        setSource(null);
                    }
                })
                .finally(() => {
                    if (isMounted) setLoading(false);
                });
        }

        return () => {
            isMounted = false;
        };
    }, [songPath]);

    // Listen for AI lyrics completion event to auto-apply lyrics
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleAiLyricsCompleted = (e: Event) => {
            const customEvt = e as CustomEvent<{ filePath: string; lrcContent: string }>;
            if (customEvt.detail && songPath && customEvt.detail.filePath === songPath) {
                setRawText(customEvt.detail.lrcContent);
                setSource('lrc_file');
            }
        };

        window.addEventListener('ai-lyrics-completed', handleAiLyricsCompleted);
        return () => window.removeEventListener('ai-lyrics-completed', handleAiLyricsCompleted);
    }, [songPath]);


    const searchOnlineLyrics = useCallback(async (query: string): Promise<OnlineLyricItem[]> => {
        if (!query.trim() || !isBrowserTauri()) return [];
        try {
            const mod = await getTauri();
            const results = await mod.invoke<OnlineLyricItem[]>('search_online_lyrics', { query });
            return results || [];
        } catch (err) {
            console.error('Error searching online lyrics:', err);
            return [];
        }
    }, []);

    const applyLyrics = useCallback((content: string, sourceName = 'lrclib') => {
        setRawText(content);
        setSource(sourceName);
    }, []);

    const saveAsLrcFile = useCallback(async (): Promise<boolean> => {
        if (!songPath || !rawText || !isBrowserTauri()) return false;
        try {
            const mod = await getTauri();
            await mod.invoke('save_lrc_file', { filePath: songPath, lrcContent: rawText });
            setSource('lrc_file');
            return true;
        } catch (err) {
            console.error('Failed to save LRC file:', err);
            return false;
        }
    }, [songPath, rawText]);

    const { lines, isSynced } = useMemo(() => {
        if (!rawText) return { lines: [], isSynced: false };
        return parseLrcText(rawText);
    }, [rawText]);

    // Calculate active line index based on currentTime
    const activeIndex = useMemo(() => {
        if (!isSynced || lines.length === 0) return -1;
        let index = -1;
        for (let i = 0; i < lines.length; i++) {
            const timeSec = lines[i].timeSec;
            if (timeSec !== null && timeSec <= currentTime + 0.25) {
                index = i;
            } else if (timeSec !== null && timeSec > currentTime + 0.25) {
                break;
            }
        }
        return index;
    }, [lines, isSynced, currentTime]);

    const importLyricsFile = useCallback((content: string) => {
        setRawText(content);
        setSource('custom');
    }, []);

    return {
        rawText,
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
    };
}

