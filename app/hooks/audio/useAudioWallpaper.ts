import {useCallback, useEffect, useRef, useState} from "react";
import type {SongMetadata} from "../../components/PlayerPanel";
import type {FileEntry} from "../../components/FolderExplorer";
import {getTauri, isBrowserTauri} from "../../lib/homeState";
import {t, type Lang} from "../../lib/translations";
import {isWallpaperEngineActive} from "../useWallpaperPlugin";

export interface UseAudioWallpaperOptions {
    lang: Lang;
    autoWallpaper: boolean;
    showError: (msg: string) => void;
    selectedSongRef: React.RefObject<FileEntry | null>;
    isMountedRef: React.RefObject<boolean>;
    onDurationChange?: (duration: number) => void;
}

export function useAudioWallpaper({
    lang,
    autoWallpaper,
    showError,
    selectedSongRef,
    isMountedRef,
    onDurationChange,
}: UseAudioWallpaperOptions) {
    const [metadata, setMetadata] = useState<SongMetadata | null>(null);
    const metadataRef = useRef<SongMetadata | null>(null);
    const metadataRequestRef = useRef(0);
    const autoWallpaperRef = useRef(autoWallpaper);
    const prevAutoWallpaperRef = useRef(autoWallpaper);

    useEffect(() => {
        metadataRef.current = metadata;
    }, [metadata]);

    const coverDataUrl = metadata?.cover_b64
        ? `data:${metadata.cover_mime || 'image/jpeg'};base64,${metadata.cover_b64}`
        : null;

    const applyWallpaper = useCallback(
        async (meta: SongMetadata, token?: number) => {
            const isEngineActive = isWallpaperEngineActive();
            const shouldApplyToSystem = autoWallpaperRef.current;
            if (!isBrowserTauri() || (!shouldApplyToSystem && !isEngineActive)) return;
            try {
                const mod = await getTauri();
                if (token !== undefined && token !== metadataRequestRef.current) return;
                if (meta.cover_b64) {
                    await mod.invoke("set_wallpaper", {
                        coverB64: meta.cover_b64,
                        applyToSystem: shouldApplyToSystem,
                    });
                } else {
                    await mod.invoke("clear_wallpaper", {
                        applyToSystem: shouldApplyToSystem,
                    });
                }
            } catch (e) {
                showError(t(lang, 'log.wallpaperError', {msg: String(e)}));
            }
        },
        [showError, lang],
    );

    const loadMetadata = useCallback(
        async (filePath: string, skipWallpaper = false) => {
            const token = ++metadataRequestRef.current;
            try {
                const mod = await getTauri();
                const result = await mod.invoke<SongMetadata>("get_metadata", {
                    filePath,
                });
                if (token !== metadataRequestRef.current || !isMountedRef.current) return;
                setMetadata(result);
                if (result.duration) onDurationChange?.(result.duration);
                if (!skipWallpaper) applyWallpaper(result, token).catch(() => {});
            } catch {
                if (token !== metadataRequestRef.current || !isMountedRef.current) return;
                setMetadata(null);
            }
        },
        [applyWallpaper, onDurationChange, isMountedRef],
    );

    useEffect(() => {
        const prev = prevAutoWallpaperRef.current;
        prevAutoWallpaperRef.current = autoWallpaper;
        autoWallpaperRef.current = autoWallpaper;

        if (prev !== autoWallpaper) {
            if (!isBrowserTauri()) return;
            if (autoWallpaper) {
                if (metadataRef.current) {
                    applyWallpaper(metadataRef.current).catch(() => {});
                } else if (selectedSongRef.current) {
                    loadMetadata(selectedSongRef.current.path, false).catch(() => {});
                }
            }
        }
    }, [autoWallpaper, applyWallpaper, loadMetadata, selectedSongRef]);

    return {
        metadata,
        setMetadata,
        metadataRef,
        metadataRequestRef,
        coverDataUrl,
        applyWallpaper,
        loadMetadata,
    };
}
