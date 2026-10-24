'use client';

import {useEffect, useState, useRef} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t} from '../lib/translations';
import {modalContentMotion, backdropMotion} from '../lib/animations';
import {useHoverDescription} from '../hooks/useHoverDescription';
import AboutSection from './settings/AboutSection';
import AudioSection from './settings/AudioSection';
import LyricsSection from './settings/LyricsSection';
import PluginSection from './settings/PluginSection';
import WallpaperSection from './settings/WallpaperSection';
import ChangelogSection from './settings/ChangelogSection';
import DebugSection from './settings/DebugSection';
import GeneralSection from './settings/GeneralSection';
import StorageSection from './settings/StorageSection';
import ShortcutSection from './settings/ShortcutSection';
import SortSection from './settings/SortSection';
import StyleSection from './settings/StyleSection';
import {getSections} from './settings/sectionsConfig';
import {useAiLyricsPlugin} from '../hooks/useAiLyricsPlugin';
import {useWallpaperPlugin} from '../hooks/useWallpaperPlugin';
import type {SectionId, SettingsModalProps} from './settings/types';

export default function SettingsModal({
    lang,
    setLang,
    open,
    onClose,
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
    onResetSidebarWidth,
    onResetAllSettings,
    logs,
    onCheckUpdate,
    updateStatus,
    updateChecking,
    updateDownloaded,
    updateTotal,
}: SettingsModalProps) {
    const [activeSection, setActiveSection] = useState<SectionId>('general');
    const mouseDownOnBackdropRef = useRef(false);
    const settingItemHover = useHoverDescription(t(lang, 'status.settingItem'));

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const frame = requestAnimationFrame(() => {
            document.getElementById('settings-dialog-title')?.focus();
        });
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);

    const {pluginStatus: aiPluginStatus} = useAiLyricsPlugin();
    const {pluginStatus: wallpaperPluginStatus} = useWallpaperPlugin();
    const isAiPluginInstalled = aiPluginStatus?.installed === true;
    const isWallpaperPluginInstalled = wallpaperPluginStatus?.installed === true;

    const effectiveActiveSection =
        (activeSection === 'lyrics' && !isAiPluginInstalled)
            ? 'plugin'
            : (activeSection === 'wallpaper' && !isWallpaperPluginInstalled)
                ? 'plugin'
                : activeSection;

    const sections = getSections(lang).filter(s =>
        (s.id !== 'lyrics' || isAiPluginInstalled) &&
        (s.id !== 'wallpaper' || isWallpaperPluginInstalled)
    );

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="settings-backdrop"
                    {...backdropMotion}
                    onMouseDown={(e) => {
                        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
                    }}
                    onClick={(e) => {
                        if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
                            onClose();
                        }
                        mouseDownOnBackdropRef.current = false;
                    }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm cursor-pointer"
                >
                    <motion.div
                        key="settings-modal"
                        {...modalContentMotion}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="settings-dialog-title"
                        style={{width: '1024px', height: '640px', maxWidth: '90vw', maxHeight: '85vh'}}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 flex overflow-hidden cursor-default shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Sidebar nav */}
                        <nav className="w-52 shrink-0 min-h-0 border-r border-zinc-800 bg-zinc-950/60 p-2.5 md:p-3 flex flex-col gap-1 overflow-y-auto">
                            <h3 className="px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                                {t(lang, 'settings.title')}
                            </h3>
                            {sections.map((s) => {
                                const isActive = s.id === effectiveActiveSection;
                                const a = getAccent(accentColor);
                                return (
                                    <div key={s.id}>
                                        {s.isDivider && <div className="my-1.5 mx-3 border-t border-zinc-800/80" />}
                                        <button
                                            {...settingItemHover}
                                            onClick={() => setActiveSection(s.id)}
                                            aria-current={isActive ? 'page' : undefined}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer ${isActive
                                                ? `${a.bg15} ${a.text400} border ${a.border500_20}`
                                                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 border border-transparent'
                                                }`}
                                        >
                                            {s.icon}
                                            <span>{s.label}</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </nav>

                        {/* Content */}
                        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                            <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-zinc-800 shrink-0">
                                <h2 id="settings-dialog-title" tabIndex={-1} className="text-lg font-semibold text-zinc-100">
                                    {sections.find((s) => s.id === effectiveActiveSection)?.label}
                                </h2>
                                <button type="button" onClick={onClose} aria-label={t(lang, 'settings.close')} className="min-h-10 min-w-10 rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2">
                                    ×
                                </button>
                            </header>
                            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-24 min-w-0">
                                {effectiveActiveSection === 'general' && (
                                    <GeneralSection
                                        lang={lang}
                                        setLang={setLang}
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
                                        accentColor={accentColor}
                                        onCheckUpdate={onCheckUpdate}
                                        updateStatus={updateStatus}
                                        updateChecking={updateChecking}
                                        updateDownloaded={updateDownloaded}
                                        updateTotal={updateTotal}
                                        outputMode={outputMode}
                                        nativeOutputActive={outputMode === 'wasapi_exclusive' || audioRuntime.effectiveMode === 'wasapi_exclusive'}
                                        audioBusy={Boolean(audioRuntime.busy || audioRuntime.status === 'stopping' || audioRuntime.status === 'starting' || audioRuntime.status === 'loading')}
                                        hideWallpaperGroup={isWallpaperPluginInstalled}
                                    />
                                )}
                                {effectiveActiveSection === 'storage' && (
                                    <StorageSection
                                        lang={lang}
                                        accentColor={accentColor}
                                        onResetAllSettings={onResetAllSettings}
                                    />
                                )}
                                {effectiveActiveSection === 'sort' && (
                                    <SortSection
                                        lang={lang}
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
                                        accentColor={accentColor}
                                    />
                                )}
                                {effectiveActiveSection === 'shortcut' && (
                                    <ShortcutSection
                                        lang={lang}
                                        shortcuts={shortcuts}
                                        updateShortcut={updateShortcut}
                                        resetShortcuts={resetShortcuts}
                                        accentColor={accentColor}
                                    />
                                )}
                                {effectiveActiveSection === 'style' && (
                                    <StyleSection
                                        lang={lang}
                                        accentColor={accentColor}
                                        setAccentColor={setAccentColor}
                                        customAccentHex={customAccentHex}
                                        setCustomAccentHex={setCustomAccentHex}
                                        layoutMode={layoutMode}
                                        setLayoutMode={setLayoutMode}
                                        onResetSidebarWidth={onResetSidebarWidth}
                                    />
                                )}
                                {effectiveActiveSection === 'plugin' && (
                                    <PluginSection
                                        lang={lang}
                                        accentColor={accentColor}
                                        isPlaying={isPlaying}
                                        setOutputMode={setOutputMode}
                                        setOutputDevice={setOutputDevice}
                                    />
                                )}
                                {effectiveActiveSection === 'audio' && (
                                    <AudioSection
                                        lang={lang}
                                        outputDevice={outputDevice}
                                        setOutputDevice={setOutputDevice}
                                        outputMode={outputMode}
                                        setOutputMode={setOutputMode}
                                        autoFallbackHtmlAudio={autoFallbackHtmlAudio}
                                        setAutoFallbackHtmlAudio={setAutoFallbackHtmlAudio}
                                        audioRuntime={audioRuntime}
                                        onResetPlayer={onResetPlayer}
                                        onRetryNativeAudio={onRetryNativeAudio}
                                        accentColor={accentColor}
                                    />
                                )}
                                {effectiveActiveSection === 'lyrics' && isAiPluginInstalled && (
                                    <LyricsSection
                                        lang={lang}
                                        accentColor={accentColor}
                                    />
                                )}
                                {effectiveActiveSection === 'wallpaper' && isWallpaperPluginInstalled && (
                                    <WallpaperSection
                                        lang={lang}
                                        accentColor={accentColor}
                                        autoWallpaper={autoWallpaper}
                                        setAutoWallpaper={setAutoWallpaper}
                                        resetOnClose={resetOnClose}
                                        setResetOnClose={setResetOnClose}
                                        defaultWallpaper={defaultWallpaper}
                                        onPickWallpaper={onPickWallpaper}
                                        onClearWallpaper={onClearWallpaper}
                                        wallpaperFitMode={wallpaperFitMode}
                                        setWallpaperFitMode={setWallpaperFitMode}
                                        wallpaperEffect={wallpaperEffect}
                                        setWallpaperEffect={setWallpaperEffect}
                                        wallpaperTransition={wallpaperTransition}
                                        setWallpaperTransition={setWallpaperTransition}
                                    />
                                )}
                                {effectiveActiveSection === 'changelog' && <ChangelogSection lang={lang} />}
                                {effectiveActiveSection === 'about' && <AboutSection lang={lang} />}
                                {effectiveActiveSection === 'debug' && <DebugSection lang={lang} logs={logs} />}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
