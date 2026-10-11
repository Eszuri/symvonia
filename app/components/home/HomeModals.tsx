'use client';

import ConfirmDialog from '../ConfirmDialog';
import SettingsModal from '../SettingsModal';
import StreamingModal from '../StreamingModal';
import type {LogEntry} from '../../types/log';
import {t, type Lang} from '../../lib/translations';
import type {OutputMode, WallpaperFitMode, WallpaperEffect, WallpaperTransition, OverlayPosition, OverlayBgColor, OverlaySize, CloseAppAction} from '../../lib/storage';
import type {PlaybackRuntimeInfo} from '../../hooks/audio/playbackTypes';

interface HomeModalsProps {
    lang: Lang;
    setLang: (v: Lang) => void;
    pendingFolderChange: boolean;
    onConfirmFolderChange: () => void;
    onCancelFolderChange: () => void;
    settingsOpen: boolean;
    onCloseSettings: () => void;
    isPlaying: boolean;
    musicFolder: string | null;
    onChangeFolder: () => void;
    autoWallpaper: boolean;
    setAutoWallpaper: (v: boolean) => void;
    resetOnClose: boolean;
    setResetOnClose: (v: boolean) => void;
    closeAppAction?: CloseAppAction;
    setCloseAppAction?: (v: CloseAppAction) => void;
    volumeStep: number;
    setVolumeStep: (v: number) => void;
    volumeMode: string;
    setVolumeMode: (v: string) => void;
    volumeLimit: number;
    setVolumeLimit: (v: number) => void;
    pauseIfMuted: boolean;
    setPauseIfMuted: (v: boolean) => void;
    fadeAudio: boolean;
    setFadeAudio: (v: boolean) => void;
    fadeDuration: number;
    setFadeDuration: (v: number) => void;
    overlayPosition: OverlayPosition;
    setOverlayPosition: (v: OverlayPosition) => void;
    overlayBgColor: OverlayBgColor;
    setOverlayBgColor: (v: OverlayBgColor) => void;
    overlayCustomBgHex: string;
    setOverlayCustomBgHex: (v: string) => void;
    overlaySize: OverlaySize;
    setOverlaySize: (v: OverlaySize) => void;
    overlayTimeout: number;
    setOverlayTimeout: (v: number) => void;
    overlayEnabled: boolean;
    setOverlayEnabled: (v: boolean) => void;
    onPreviewOverlay?: () => void;
    volume: number;
    defaultWallpaper: string | null;
    onPickWallpaper: () => void;
    onClearWallpaper: () => void;
    wallpaperFitMode: WallpaperFitMode;
    setWallpaperFitMode: (v: WallpaperFitMode) => void;
    wallpaperEffect: WallpaperEffect;
    setWallpaperEffect: (v: WallpaperEffect) => void;
    wallpaperTransition: WallpaperTransition;
    setWallpaperTransition: (v: WallpaperTransition) => void;
    layoutMode?: 'default' | 'spotify';
    setLayoutMode?: (v: 'default' | 'spotify') => void;
    outputDevice: string | null;
    setOutputDevice: (v: string | null) => void;
    outputMode: OutputMode;
    setOutputMode: (v: OutputMode) => void;
    autoFallbackHtmlAudio?: boolean;
    setAutoFallbackHtmlAudio?: (v: boolean) => void;
    audioRuntime: PlaybackRuntimeInfo;
    onResetPlayer: () => void;
    onRetryNativeAudio: () => void;
    folderSort: string;
    setFolderSort: (v: string) => void;
    fileSort: string;
    setFileSort: (v: string) => void;
    sortDir: string;
    setSortDir: (v: string) => void;
    nameSource: string;
    setNameSource: (v: string) => void;
    formats: string[];
    setFormats: (v: string[]) => void;
    shortcuts: Record<string, string>;
    updateShortcut: (action: string, key: string) => void;
    resetShortcuts: () => void;
    accentColor: string;
    setAccentColor: (v: string) => void;
    customAccentHex: string;
    setCustomAccentHex: (v: string) => void;
    onResetSidebarWidth: () => void;
    onResetAllSettings: () => void;
    logs: LogEntry[];
    onCheckUpdate: () => void;
    updateStatus: string;
    updateChecking: boolean;
    updateDownloaded: number;
    updateTotal: number;
    streamingOpen: boolean;
    onCloseStreaming: () => void;
}

export default function HomeModals({
    lang,
    pendingFolderChange,
    onConfirmFolderChange,
    onCancelFolderChange,
    settingsOpen,
    onCloseSettings,
    isPlaying,
    musicFolder,
    onChangeFolder,
    autoWallpaper,
    setAutoWallpaper,
    resetOnClose,
    setResetOnClose,
    closeAppAction,
    setCloseAppAction,
    volumeStep,
    setVolumeStep,
    volumeMode,
    setVolumeMode,
    volumeLimit,
    setVolumeLimit,
    pauseIfMuted,
    setPauseIfMuted,
    fadeAudio,
    setFadeAudio,
    fadeDuration,
    setFadeDuration,
    overlayPosition,
    setOverlayPosition,
    overlayBgColor,
    setOverlayBgColor,
    overlayCustomBgHex,
    setOverlayCustomBgHex,
    overlaySize,
    setOverlaySize,
    overlayTimeout,
    setOverlayTimeout,
    overlayEnabled,
    setOverlayEnabled,
    onPreviewOverlay,
    volume,
    defaultWallpaper,
    onPickWallpaper,
    onClearWallpaper,
    wallpaperFitMode,
    setWallpaperFitMode,
    wallpaperEffect,
    setWallpaperEffect,
    wallpaperTransition,
    setWallpaperTransition,
    layoutMode = 'default',
    setLayoutMode,
    outputDevice,
    setOutputDevice,
    outputMode,
    setOutputMode,
    autoFallbackHtmlAudio,
    setAutoFallbackHtmlAudio,
    audioRuntime,
    onResetPlayer,
    onRetryNativeAudio,
    folderSort,
    setFolderSort,
    fileSort,
    setFileSort,
    sortDir,
    setSortDir,
    nameSource,
    setNameSource,
    formats,
    setFormats,
    shortcuts,
    updateShortcut,
    resetShortcuts,
    accentColor,
    setAccentColor,
    customAccentHex,
    setCustomAccentHex,
    onResetSidebarWidth,
    onResetAllSettings,
    logs,
    onCheckUpdate,
    updateStatus,
    updateChecking,
    updateDownloaded,
    setLang,
    updateTotal,
    streamingOpen,
    onCloseStreaming,
}: HomeModalsProps) {
    return (
        <>
            <ConfirmDialog
                lang={lang}
                open={pendingFolderChange}
                title={t(lang, 'homeModal.changeFolderTitle')}
                message={t(lang, 'homeModal.changeFolderMessage')}
                confirmLabel={t(lang, 'homeModal.changeFolderConfirm')}
                cancelLabel={t(lang, 'homeModal.cancel')}
                onConfirm={onConfirmFolderChange}
                onCancel={onCancelFolderChange}
                accentColor={accentColor}
            />
            <SettingsModal
                lang={lang}
                setLang={setLang}
                open={settingsOpen}
                onClose={onCloseSettings}
                isPlaying={isPlaying}
                musicFolder={musicFolder}
                onChangeFolder={onChangeFolder}
                autoWallpaper={autoWallpaper}
                setAutoWallpaper={setAutoWallpaper}
                resetOnClose={resetOnClose}
                setResetOnClose={setResetOnClose}
                closeAppAction={closeAppAction}
                setCloseAppAction={setCloseAppAction}
                volumeStep={volumeStep}
                setVolumeStep={setVolumeStep}
                volumeMode={volumeMode}
                setVolumeMode={setVolumeMode}
                volumeLimit={volumeLimit}
                setVolumeLimit={setVolumeLimit}
                pauseIfMuted={pauseIfMuted}
                setPauseIfMuted={setPauseIfMuted}
                fadeAudio={fadeAudio}
                setFadeAudio={setFadeAudio}
                fadeDuration={fadeDuration}
                setFadeDuration={setFadeDuration}
                overlayPosition={overlayPosition}
                setOverlayPosition={setOverlayPosition}
                overlayBgColor={overlayBgColor}
                setOverlayBgColor={setOverlayBgColor}
                overlayCustomBgHex={overlayCustomBgHex}
                setOverlayCustomBgHex={setOverlayCustomBgHex}
                overlaySize={overlaySize}
                setOverlaySize={setOverlaySize}
                overlayTimeout={overlayTimeout}
                setOverlayTimeout={setOverlayTimeout}
                overlayEnabled={overlayEnabled}
                setOverlayEnabled={setOverlayEnabled}
                onPreviewOverlay={onPreviewOverlay}
                volume={volume}
                defaultWallpaper={defaultWallpaper}
                onPickWallpaper={onPickWallpaper}
                onClearWallpaper={onClearWallpaper}
                wallpaperFitMode={wallpaperFitMode}
                setWallpaperFitMode={setWallpaperFitMode}
                wallpaperEffect={wallpaperEffect}
                setWallpaperEffect={setWallpaperEffect}
                wallpaperTransition={wallpaperTransition}
                setWallpaperTransition={setWallpaperTransition}
                layoutMode={layoutMode}
                setLayoutMode={setLayoutMode}
                outputDevice={outputDevice}
                setOutputDevice={setOutputDevice}
                outputMode={outputMode}
                setOutputMode={setOutputMode}
                autoFallbackHtmlAudio={autoFallbackHtmlAudio}
                setAutoFallbackHtmlAudio={setAutoFallbackHtmlAudio}
                audioRuntime={audioRuntime}
                onResetPlayer={onResetPlayer}
                onRetryNativeAudio={onRetryNativeAudio}
                folderSort={folderSort}
                setFolderSort={setFolderSort}
                fileSort={fileSort}
                setFileSort={setFileSort}
                sortDir={sortDir}
                setSortDir={setSortDir}
                nameSource={nameSource}
                setNameSource={setNameSource}
                formats={formats}
                setFormats={setFormats}
                shortcuts={shortcuts}
                updateShortcut={updateShortcut}
                resetShortcuts={resetShortcuts}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                customAccentHex={customAccentHex}
                setCustomAccentHex={setCustomAccentHex}
                onResetSidebarWidth={onResetSidebarWidth}
                onResetAllSettings={onResetAllSettings}
                logs={logs}
                onCheckUpdate={onCheckUpdate}
                updateStatus={updateStatus}
                updateChecking={updateChecking}
                updateDownloaded={updateDownloaded}
                updateTotal={updateTotal}
            />
            <StreamingModal
                lang={lang}
                open={streamingOpen}
                onClose={onCloseStreaming}
                accentColor={accentColor}
            />
        </>
    );
}
