'use client';

import {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {SettingGroup, SettingRow, ToggleStub, SelectStub} from './controls';
import {t, type Lang} from '../../lib/translations';
import {getAccent} from '../../lib/colors';
import {useWallpaperPlugin, isWallpaperEngineActive} from '../../hooks/useWallpaperPlugin';
import type {WallpaperFitMode, WallpaperEffect, WallpaperTransition} from '../../lib/storage';

interface WallpaperSectionProps {
    lang: Lang;
    accentColor: string;
    autoWallpaper?: boolean;
    setAutoWallpaper?: (v: boolean) => void;
    resetOnClose?: boolean;
    setResetOnClose?: (v: boolean) => void;
    defaultWallpaper?: string | null;
    onPickWallpaper?: () => void;
    onClearWallpaper?: () => void;
    wallpaperFitMode?: WallpaperFitMode;
    setWallpaperFitMode?: (v: WallpaperFitMode) => void;
    wallpaperEffect?: WallpaperEffect;
    setWallpaperEffect?: (v: WallpaperEffect) => void;
    wallpaperTransition?: WallpaperTransition;
    setWallpaperTransition?: (v: WallpaperTransition) => void;
}

export default function WallpaperSection({
    lang,
    accentColor,
    autoWallpaper = true,
    setAutoWallpaper,
    resetOnClose = true,
    setResetOnClose,
    defaultWallpaper,
    onPickWallpaper,
    onClearWallpaper,
    wallpaperFitMode = 'fill',
    setWallpaperFitMode,
    wallpaperEffect = 'none',
    setWallpaperEffect,
    wallpaperTransition = 'fade',
    setWallpaperTransition,
}: WallpaperSectionProps) {
    const accent = getAccent(accentColor);
    const {
        engineState,
        isEngineRunning,
        startEngine,
        stopEngine,
        setFitMode,
        setEffect,
        setTransition,
        setIntensity,
    } = useWallpaperPlugin();

    const hasUserSelectedModeRef = useRef(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [wallpaperMode, setWallpaperMode] = useState<'system' | 'direct3d'>(() => {
        return (isEngineRunning || isWallpaperEngineActive()) ? 'direct3d' : 'system';
    });
    const [wallpaperSrc, setWallpaperSrc] = useState<string | null>(null);
    const activeWallpaperSrc = defaultWallpaper ? wallpaperSrc : null;

    useEffect(() => {
        if (!hasUserSelectedModeRef.current && isEngineRunning) {
            setWallpaperMode('direct3d');
        }
    }, [isEngineRunning]);

    useEffect(() => {
        if (!defaultWallpaper) return;
        let isMounted = true;
        import('@tauri-apps/api/core')
            .then(({convertFileSrc}) => {
                if (isMounted) {
                    setWallpaperSrc(convertFileSrc(defaultWallpaper));
                }
            })
            .catch(() => {
                if (isMounted) {
                    setWallpaperSrc(null);
                }
            });
        return () => {
            isMounted = false;
        };
    }, [defaultWallpaper]);

    const handleToggleEngine = async (enabled: boolean) => {
        setErrorMsg(null);
        try {
            if (enabled) {
                await startEngine({
                    fps: engineState.fps || 30,
                    intensity: engineState.intensity ?? 1.0,
                    texturePath: undefined,
                    fitMode: wallpaperFitMode,
                    effect: wallpaperEffect,
                    transition: wallpaperTransition,
                });
            } else {
                await stopEngine();
            }
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        }
    };

    const handleFitModeChange = async (mode: string) => {
        const fit = mode as WallpaperFitMode;
        setWallpaperFitMode?.(fit);
        await setFitMode(mode);
    };

    const handleEffectChange = async (effectStr: string) => {
        const eff = effectStr as WallpaperEffect;
        setWallpaperEffect?.(eff);
        await setEffect(effectStr);
    };

    const handleTransitionChange = async (trStr: string) => {
        const tr = trStr as WallpaperTransition;
        setWallpaperTransition?.(tr);
        await setTransition(trStr);
    };

    const handleIntensityChange = async (val: number) => {
        await setIntensity(val);
    };

    const modeCards: Array<{
        id: 'system' | 'direct3d';
        title: string;
        desc: string;
        icon: (isSelected: boolean) => React.ReactNode;
    }> = [
        {
            id: 'system',
            title: t(lang, 'wallpaper.mode.system'),
            desc: t(lang, 'wallpaper.mode.systemSummary'),
            icon: (isSelected: boolean) => (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-colors ${isSelected ? (accent.text400 || 'text-sky-400') : 'text-zinc-400'}`}
                >
                    <rect width="20" height="14" x="2" y="3" rx="2" />
                    <line x1="8" x2="16" y1="21" y2="21" />
                    <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
            ),
        },
        {
            id: 'direct3d',
            title: t(lang, 'wallpaper.mode.direct3d'),
            desc: t(lang, 'wallpaper.mode.direct3dSummary'),
            icon: (isSelected: boolean) => (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-colors ${isSelected ? (accent.text400 || 'text-sky-400') : 'text-zinc-400'}`}
                >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header & Visual Mode Selector Cards */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div>
                        <div className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                            {t(lang, 'wallpaper.mode.groupTitle')}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {t(lang, 'wallpaper.mode.desc')}
                        </p>
                    </div>
                </div>

                {/* 2-Column Interactive Visual Mode Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t(lang, 'wallpaper.mode.title')}>
                    {modeCards.map((card) => {
                        const isSelected = wallpaperMode === card.id;

                        return (
                            <button
                                key={card.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => {
                                    hasUserSelectedModeRef.current = true;
                                    setWallpaperMode(card.id);
                                }}
                                style={{
                                    borderColor: isSelected
                                        ? (accent.hex500 || '#38bdf8')
                                        : 'rgba(63, 63, 70, 0.4)',
                                    background: isSelected
                                        ? (accent.hex500
                                            ? `radial-gradient(ellipse at top left, ${accent.hex500}1a, transparent 70%), rgba(24, 24, 27, 0.85)`
                                            : 'rgba(24, 24, 27, 0.9)')
                                        : 'rgba(24, 24, 27, 0.5)',
                                    boxShadow: isSelected && accent.hex500
                                        ? `0 8px 24px -6px ${accent.hex500}30`
                                        : undefined,
                                }}
                                className={`relative p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-200 cursor-pointer select-none hover:border-zinc-500/80 hover:bg-zinc-900/80 group active:scale-[0.99] min-h-[135px]`}
                            >
                                {/* Top row: Icon */}
                                <div className="flex items-start justify-between gap-2 w-full">
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                                            isSelected
                                                ? 'bg-zinc-900/90 border-zinc-700/80 shadow-xs'
                                                : 'bg-zinc-800/60 border-zinc-700/40 group-hover:bg-zinc-800'
                                        }`}
                                    >
                                        {card.icon(isSelected)}
                                    </div>
                                </div>

                                {/* Bottom info */}
                                <div className="mt-3.5 space-y-1">
                                    <div className={`text-sm font-semibold transition-colors ${isSelected ? 'text-white' : 'text-zinc-200 group-hover:text-white'}`}>
                                        {card.title}
                                    </div>
                                    <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                                        {card.desc}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Dynamic Content Views */}
            <AnimatePresence mode="wait">
                {/* 1. Mode: Wallpaper Sistem */}
                {wallpaperMode === 'system' && (
                    <motion.div
                        key="mode-system"
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -8}}
                        transition={{duration: 0.2}}
                        className="space-y-4"
                    >
                        {/* 1. Card: Sinkronisasi & Tampilan Wallpaper */}
                        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 divide-y divide-zinc-800/50 overflow-hidden">
                            {/* Auto Wallpaper */}
                            {setAutoWallpaper && (
                                <div className="p-4 sm:p-5 flex items-center justify-between gap-4 bg-transparent">
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M9 18V5l12-2v13" />
                                                    <circle cx="6" cy="18" r="3" />
                                                    <circle cx="18" cy="16" r="3" />
                                                </svg>
                                            </div>
                                            <div className="text-sm font-semibold text-zinc-100">
                                                {t(lang, 'general.autoWallpaper.title')}
                                            </div>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed pl-10.5">
                                            {t(lang, 'general.autoWallpaper.desc')}
                                        </p>
                                    </div>
                                    <div className="shrink-0">
                                        <ToggleStub checked={autoWallpaper} onChange={setAutoWallpaper} accent={accent} />
                                    </div>
                                </div>
                            )}

                            {/* Ukuran & Penyesuaian Wallpaper */}
                            {setWallpaperFitMode && (
                                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent">
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-zinc-200">
                                            {t(lang, 'general.wallpaperFit.title')}
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            {t(lang, 'general.wallpaperFit.desc')}
                                        </p>
                                    </div>

                                    <div className="shrink-0">
                                        <SelectStub
                                            options={[
                                                ['fill', t(lang, 'general.wallpaperFit.fill')],
                                                ['fit', t(lang, 'general.wallpaperFit.fit')],
                                                ['stretch', t(lang, 'general.wallpaperFit.stretch')],
                                                ['center', t(lang, 'general.wallpaperFit.center')],
                                                ['tile', t(lang, 'general.wallpaperFit.tile')],
                                                ['span', t(lang, 'general.wallpaperFit.span')],
                                            ]}
                                            value={wallpaperFitMode}
                                            onChange={handleFitModeChange}
                                            accent={accent}
                                            accentColor={accentColor}
                                            className="w-full sm:w-56"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Card: Pengembalian Wallpaper & Berkas Default */}
                        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 divide-y divide-zinc-800/50 overflow-hidden">
                            {/* Reset Wallpaper saat Keluar */}
                            {setResetOnClose && (
                                <div className="p-4 sm:p-5 flex items-center justify-between gap-4 bg-transparent">
                                    <div className={`space-y-1 flex-1 min-w-0 transition-all duration-200 ${resetOnClose ? 'opacity-100' : 'opacity-40'}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className={`text-sm font-semibold transition-colors ${resetOnClose ? 'text-zinc-200' : 'text-zinc-400'}`}>
                                                {t(lang, 'general.resetWallpaper.title')}
                                            </div>
                                            {defaultWallpaper ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                                    resetOnClose
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                                        : 'bg-zinc-800/80 text-zinc-500 border border-zinc-700/40'
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${resetOnClose ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                                                    {t(lang, 'general.resetWallpaper.hint')}
                                                </span>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                                    resetOnClose
                                                        ? 'bg-zinc-800 text-zinc-300 border border-zinc-700/60'
                                                        : 'bg-zinc-800/80 text-zinc-500 border border-zinc-700/40'
                                                }`}>
                                                    <span className="w-2 h-2 rounded-full bg-black border border-zinc-600" />
                                                    {t(lang, 'general.resetWallpaper.hintBlack')}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-xs transition-colors leading-relaxed ${resetOnClose ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                            {t(lang, 'general.resetWallpaper.desc')}
                                        </p>
                                    </div>

                                    <div className="shrink-0">
                                        <ToggleStub
                                            checked={resetOnClose}
                                            onChange={setResetOnClose}
                                            accent={accent}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Wallpaper Default Header & Dropzone/Preview */}
                            <div className="p-4 sm:p-5 space-y-3.5">
                                <div>
                                    <div className="text-xs font-semibold tracking-wider uppercase text-zinc-400">
                                        {t(lang, 'general.wallpaperDefault.title')}
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {t(lang, 'general.wallpaperDefault.desc')}
                                    </p>
                                </div>

                                {/* Preview Card / Dropzone */}
                                {defaultWallpaper ? (
                                    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                                        {/* Left: Thumbnail & Path Info */}
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-14 h-10 rounded-lg bg-zinc-800 border border-zinc-700/80 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                                                {activeWallpaperSrc ? (
                                                    <img
                                                        src={activeWallpaperSrc}
                                                        alt={t(lang, 'general.wallpaperDefault.title')}
                                                        className="w-full h-full object-cover"
                                                        onError={() => setWallpaperSrc(null)}
                                                    />
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                                        <circle cx="9" cy="9" r="2"/>
                                                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                                                    </svg>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <div className="text-xs font-semibold text-zinc-100 truncate" title={defaultWallpaper}>
                                                    {defaultWallpaper.split('\\').pop()?.split('/').pop()}
                                                </div>
                                                <div className="text-[11px] font-mono text-zinc-500 truncate" title={defaultWallpaper}>
                                                    {defaultWallpaper}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                            {onPickWallpaper && (
                                                <button
                                                    type="button"
                                                    onClick={onPickWallpaper}
                                                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 shadow-xs transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1.5"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                    <span>{t(lang, 'general.wallpaperDefault.changeBtn')}</span>
                                                </button>
                                            )}
                                            {defaultWallpaper && onClearWallpaper && (
                                                <button
                                                    type="button"
                                                    onClick={onClearWallpaper}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 shadow-xs transition-all cursor-pointer active:scale-[0.98] flex items-center gap-1.5"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                    <span>{t(lang, 'general.wallpaperDefault.deleteBtn')}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={onPickWallpaper}
                                        className="p-4 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-500 transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 group-hover:border-zinc-600 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                                    <circle cx="9" cy="9" r="2"/>
                                                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">
                                                    {t(lang, 'general.wallpaperDefault.selectFile')}
                                                </div>
                                                <div className="text-[11px] text-zinc-500">
                                                    {t(lang, 'general.wallpaperDefault.supportedFormats')}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPickWallpaper?.();
                                            }}
                                            className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600/70 shadow-xs transition-all cursor-pointer shrink-0 active:scale-[0.98] flex items-center gap-1.5"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19"/>
                                                <line x1="5" y1="12" x2="19" y2="12"/>
                                            </svg>
                                            <span>{t(lang, 'general.wallpaperDefault.setBtn')}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* 2. Mode: Direct3D 11 Shader Engine */}
                {wallpaperMode === 'direct3d' && (
                    <motion.div
                        key="mode-direct3d"
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -8}}
                        transition={{duration: 0.2}}
                        className="space-y-4"
                    >
                        {/* Hero Live Engine Status Banner */}
                        <div
                            className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900/95 via-zinc-900/80 to-zinc-950/90 border border-zinc-800 shadow-xl transition-all"
                            style={{
                                borderColor: isEngineRunning
                                    ? (accent.hex500 ? `${accent.hex500}44` : '#3f3f46')
                                    : 'rgba(63, 63, 70, 0.35)',
                                boxShadow: isEngineRunning && accent.hex500
                                    ? `0 12px 32px -12px ${accent.hex500}25`
                                    : undefined,
                            }}
                        >
                            {/* Glowing top line */}
                            <div
                                className="h-[2px] w-full transition-opacity duration-300"
                                style={{
                                    opacity: isEngineRunning ? 1 : 0.2,
                                    background: isEngineRunning
                                        ? `linear-gradient(90deg, transparent 0%, ${accent.hex500 || '#6366f1'} 50%, transparent 100%)`
                                        : 'linear-gradient(90deg, transparent 0%, rgba(113, 113, 122, 0.3) 50%, transparent 100%)',
                                }}
                            />

                            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                            isEngineRunning
                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                : 'bg-zinc-800/80 text-zinc-500 border-zinc-700/40'
                                        }`}>
                                            <span className={`w-2 h-2 rounded-full ${
                                                isEngineRunning
                                                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                                                    : 'bg-zinc-600'
                                            }`} />
                                            {isEngineRunning
                                                ? t(lang, 'wallpaper.engine.statusRunning')
                                                : t(lang, 'wallpaper.engine.statusStopped')
                                            }
                                        </div>

                                        <span className="text-[11px] text-zinc-500 font-mono tracking-tight">
                                            {t(lang, 'wallpaper.engine.statusSpecs')}
                                        </span>
                                    </div>

                                    <div className="text-base font-semibold text-zinc-100">
                                        {t(lang, 'wallpaper.liveWallpaper.title')}
                                    </div>
                                    <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                                        {t(lang, 'wallpaper.liveWallpaper.desc')}
                                    </p>
                                </div>

                                <div className="shrink-0 flex items-center gap-3">
                                    <ToggleStub
                                        checked={isEngineRunning}
                                        onChange={handleToggleEngine}
                                        accent={accent}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Detailed Engine Configurations (Disabled & Dimmed when nonaktif) */}
                        <div
                            className={`transition-all duration-300 ${
                                !isEngineRunning
                                    ? 'opacity-35 pointer-events-none select-none grayscale-[30%]'
                                    : 'opacity-100'
                            }`}
                        >
                            <SettingGroup title={t(lang, 'wallpaper.group.enhancement')}>
                                {/* Transisi Pergantian Gambar */}
                                <SettingRow
                                    title={t(lang, 'wallpaper.transition.title')}
                                    description={t(lang, 'wallpaper.transition.desc')}
                                >
                                    <SelectStub
                                        disabled={!isEngineRunning}
                                        options={[
                                            ['fade', t(lang, 'wallpaper.transition.fade')],
                                            ['zoom_in', t(lang, 'wallpaper.transition.zoom_in')],
                                            ['zoom_out', t(lang, 'wallpaper.transition.zoom_out')],
                                            ['slide', t(lang, 'wallpaper.transition.slide')],
                                            ['none', t(lang, 'wallpaper.transition.none')],
                                        ]}
                                        value={wallpaperTransition}
                                        onChange={handleTransitionChange}
                                        accent={accent}
                                        accentColor={accentColor}
                                        className="w-52"
                                    />
                                </SettingRow>

                                {/* Efek Visual Wallpaper */}
                                <SettingRow
                                    title={t(lang, 'wallpaper.effect.title')}
                                    description={t(lang, 'wallpaper.effect.desc')}
                                >
                                    <SelectStub
                                        disabled={!isEngineRunning}
                                        options={[
                                            ['none', t(lang, 'wallpaper.effect.none')],
                                            ['reactive_glow', t(lang, 'wallpaper.effect.reactive_glow')],
                                            ['subtle_pulse', t(lang, 'wallpaper.effect.subtle_pulse')],
                                            ['cinematic_vignette', t(lang, 'wallpaper.effect.cinematic_vignette')],
                                            ['grayscale', t(lang, 'wallpaper.effect.grayscale')],
                                            ['dimmed', t(lang, 'wallpaper.effect.dimmed')],
                                        ]}
                                        value={wallpaperEffect}
                                        onChange={handleEffectChange}
                                        accent={accent}
                                        accentColor={accentColor}
                                        className="w-52"
                                    />
                                </SettingRow>

                                {/* Ukuran & Penyesuaian Wallpaper */}
                                <SettingRow
                                    title={t(lang, 'wallpaper.fit.title')}
                                    description={t(lang, 'wallpaper.fit.desc')}
                                >
                                    <SelectStub
                                        disabled={!isEngineRunning}
                                        options={[
                                            ['fill', t(lang, 'wallpaper.fit.fill')],
                                            ['fit', t(lang, 'wallpaper.fit.fit')],
                                            ['stretch', t(lang, 'wallpaper.fit.stretch')],
                                            ['center', t(lang, 'wallpaper.fit.center')],
                                            ['tile', t(lang, 'wallpaper.fit.tile')],
                                        ]}
                                        value={wallpaperFitMode === 'span' ? 'fill' : wallpaperFitMode}
                                        onChange={handleFitModeChange}
                                        accent={accent}
                                        accentColor={accentColor}
                                        className="w-52"
                                    />
                                </SettingRow>

                                {/* Intensitas Visual Shader */}
                                {wallpaperEffect !== 'none' && (
                                    <SettingRow
                                        title={t(lang, 'wallpaper.intensity.title')}
                                        description={t(lang, 'wallpaper.intensity.desc')}
                                    >
                                        <div className="flex items-center gap-3 min-w-56">
                                            <input
                                                type="range"
                                                min="0"
                                                max="2"
                                                step="0.1"
                                                disabled={!isEngineRunning}
                                                value={engineState.intensity ?? 1.0}
                                                onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
                                                style={{
                                                    accentColor: accent.hex500 || 'var(--accent-500)',
                                                }}
                                                className="w-36 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                                            />
                                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60 text-xs font-mono text-zinc-200 w-12 text-center">
                                                {((engineState.intensity ?? 1.0) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </SettingRow>
                                )}
                            </SettingGroup>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error message banner */}
            {(errorMsg || engineState.last_error) && (
                <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                    <p className="text-xs text-rose-400 flex items-start gap-2 leading-relaxed">
                        <span className="mt-0.5 text-sm">⚠️</span>
                        <span className="flex-1 break-all">{errorMsg || engineState.last_error}</span>
                    </p>
                </div>
            )}
        </div>
    );
}

