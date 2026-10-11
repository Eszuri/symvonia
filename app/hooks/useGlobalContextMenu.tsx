import React, { useState, useCallback } from 'react';
import { getTauri } from '../lib/homeState';
import { t } from '../lib/translations';
import type { ContextMenuItem } from '../components/ContextMenu';

async function openDevTools() {
    try {
        const mod = await getTauri();
        await mod.invoke("open_devtools");
    } catch {
        // not in Tauri
    }
}

function appendDevTools(items: ContextMenuItem[], lang: string): ContextMenuItem[] {
    return [
        ...(items.length > 0 ? [{separator: true} as ContextMenuItem] : []),
        {
            label: t(lang as "en" | "id", "contextMenu.openDevTools"),
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                </svg>
            ),
            onClick: openDevTools,
        },
    ];
}

import type { useAudioPlayer } from './useAudioPlayer';
import type { usePlayerSettings } from './usePlayerSettings';

interface UseGlobalContextMenuProps {
    lang: 'en' | 'id';
    player: ReturnType<typeof useAudioPlayer>;
    settings: ReturnType<typeof usePlayerSettings>;
    setSettingsOpen: (open: boolean) => void;
    setStreamingOpen: (open: boolean) => void;
    settingsOpenRef: React.MutableRefObject<boolean>;
    streamingOpenRef: React.MutableRefObject<boolean>;
    equalizerOpenRef?: React.MutableRefObject<boolean>;
    metadataEditOpenRef?: React.MutableRefObject<boolean>;
    lyricsSearchOpenRef?: React.MutableRefObject<boolean>;
    toolbarEditOpenRef?: React.MutableRefObject<boolean>;
}

export function useGlobalContextMenu({
    lang,
    player,
    settings,
    setSettingsOpen,
    setStreamingOpen,
    settingsOpenRef,
    streamingOpenRef,
    equalizerOpenRef,
    metadataEditOpenRef,
    lyricsSearchOpenRef,
    toolbarEditOpenRef,
}: UseGlobalContextMenuProps) {
    const [globalContextMenu, setGlobalContextMenu] = useState<{
        x: number;
        y: number;
        items: ContextMenuItem[];
    } | null>(null);

    const hideGlobalContextMenu = useCallback(() => setGlobalContextMenu(null), []);

    const showGlobalContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (
                settingsOpenRef.current ||
                streamingOpenRef.current ||
                equalizerOpenRef?.current ||
                metadataEditOpenRef?.current ||
                lyricsSearchOpenRef?.current ||
                toolbarEditOpenRef?.current
            ) return;

            e.preventDefault();
            e.stopPropagation();

            const hasSong = !!player.selectedSong;
            const items: ContextMenuItem[] = [
                {
                    label: t(lang, "contextMenu.reloadPage"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M8 16H3v5" />
                        </svg>
                    ),
                    onClick: () => window.location.reload(),
                },
                {separator: true} as ContextMenuItem,
                {
                    label: t(lang, "contextMenu.playPause"),
                    icon: player.isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="4" width="4" height="16" />
                            <rect x="14" y="4" width="4" height="16" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                    ),
                    onClick: player.togglePlayPause,
                    disabled: !hasSong,
                },
                {
                    label: t(lang, "contextMenu.next"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 4 15 12 5 20 5 4" />
                            <line x1="19" y1="5" x2="19" y2="19" />
                        </svg>
                    ),
                    onClick: player.playNext,
                    disabled: !hasSong,
                },
                {
                    label: t(lang, "contextMenu.prev"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="19 20 9 12 19 4 19 20" />
                            <line x1="5" y1="19" x2="5" y2="5" />
                        </svg>
                    ),
                    onClick: player.playPrev,
                    disabled: !hasSong,
                },
                {separator: true} as ContextMenuItem,
                {
                    label: t(lang, "contextMenu.increaseVolume"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                    ),
                    onClick: () => {
                        const step = settings.volumeStep / 100;
                        const newVol = Math.min(1, player.activeVolume + step);
                        player.handleVolumeChange({
                            target: {value: String(newVol)},
                        } as React.ChangeEvent<HTMLInputElement>);
                    },
                },
                {
                    label: t(lang, "contextMenu.decreaseVolume"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                    ),
                    onClick: () => {
                        const step = settings.volumeStep / 100;
                        const newVol = Math.max(0, player.activeVolume - step);
                        player.handleVolumeChange({
                            target: {value: String(newVol)},
                        } as React.ChangeEvent<HTMLInputElement>);
                    },
                },
                {separator: true} as ContextMenuItem,
                {
                    label: t(lang, "contextMenu.shuffle"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 3 21 3 21 8" />
                            <line x1="4" y1="20" x2="21" y2="3" />
                            <polyline points="21 16 21 21 16 21" />
                            <line x1="15" y1="15" x2="21" y2="21" />
                            <line x1="4" y1="4" x2="9" y2="9" />
                        </svg>
                    ),
                    onClick: () => settings.setShuffleState(!settings.shuffle),
                    disabled: !hasSong,
                    active: settings.shuffle,
                    badge: settings.shuffle
                        ? (t(lang, "playback.shuffleOn").split(":")[1]?.trim() ?? "ON")
                        : undefined,
                },
                {
                    label:
                        settings.repeat === "off"
                            ? t(lang, "playback.repeatOff")
                            : settings.repeat === "all"
                                ? t(lang, "playback.repeatAll")
                                : t(lang, "playback.repeatOne"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="17 1 21 5 17 9" />
                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                            <polyline points="7 23 3 19 7 15" />
                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                    ),
                    onClick: () => {
                        const next =
                            settings.repeat === "off"
                                ? "all"
                                : settings.repeat === "all"
                                    ? "one"
                                    : "off";
                        settings.setRepeatState(next);
                    },
                    disabled: !hasSong,
                    active: settings.repeat !== "off",
                    badge: settings.repeat === "one" ? "×1" : undefined,
                },
                {separator: true} as ContextMenuItem,
                {
                    label: t(lang, "contextMenu.openSettings"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    ),
                    onClick: () => setSettingsOpen(true),
                },
                {
                    label: t(lang, "contextMenu.openStreaming"),
                    icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 11a9 9 0 0 1 9 9" />
                            <path d="M4 4a16 16 0 0 1 16 16" />
                            <circle cx="5" cy="19" r="1" />
                        </svg>
                    ),
                    onClick: () => setStreamingOpen(true),
                },
            ];
            setGlobalContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [...items, ...appendDevTools(items, lang)],
            });
        },
        [
            lang,
            setSettingsOpen,
            setStreamingOpen,
            settingsOpenRef,
            streamingOpenRef,
            equalizerOpenRef,
            metadataEditOpenRef,
            lyricsSearchOpenRef,
            toolbarEditOpenRef,
            player,
            settings,
        ],
    );

    return {
        globalContextMenu,
        hideGlobalContextMenu,
        showGlobalContextMenu,
    };
}
