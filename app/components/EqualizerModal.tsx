'use client';

import {memo, useEffect, useRef} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {modalContentMotion, backdropMotion} from '../lib/animations';
import {EQIcon, PowerIcon, ResetIcon, ZoomInIcon, ZoomOutIcon} from './icons';
import {SelectStub} from './settings/controls';
import {
    type EQBandMode,
    type EQPresetKey,
    type useEqualizer,
} from '../hooks/useEqualizer';

interface EqualizerModalProps {
    isOpen: boolean;
    onClose: () => void;
    equalizer: ReturnType<typeof useEqualizer>;
    accentColor: string;
    lang: Lang;
    disabled?: boolean;
}

const BAND_MODE_OPTIONS: EQBandMode[] = [5, 10, 15, 31];

const PRESET_OPTIONS: EQPresetKey[] = [
    'flat',
    'bassBoost',
    'trebleBoost',
    'rock',
    'pop',
    'jazz',
    'classical',
    'electronic',
    'vocal',
    'custom',
];

function formatFreqLabel(freqHz: number): string {
    if (freqHz >= 1000) {
        const k = freqHz / 1000;
        return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return Number.isInteger(freqHz) ? `${freqHz}` : `${freqHz.toFixed(1)}`;
}

function EqualizerModal({
    isOpen,
    onClose,
    equalizer,
    accentColor,
    lang,
    disabled = false,
}: EqualizerModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const mouseDownOnBackdropRef = useRef<boolean>(false);

    const accent = getAccent(accentColor);
    const {
        enabled,
        bandMode,
        preampDb,
        preset,
        gains,
        zoomLevel,
        frequencies,
        autoPreamp,
        toggleEnabled,
        toggleAutoPreamp,
        setBandMode,
        setPreampDb,
        setPreset,
        setBandGain,
        setZoomLevel,
        resetFlat,
    } = equalizer;

    const isCompactMode = bandMode > 15;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="eq-backdrop"
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
                >
                    {/* Modal Box */}
                    <motion.div
                        key="eq-modal"
                        {...modalContentMotion}
                        onClick={(e) => e.stopPropagation()}
                        className={`relative w-full ${bandMode >= 15 ? 'max-w-4xl' : 'max-w-2xl'} bg-zinc-950/95 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all cursor-default`}
                    >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl bg-zinc-800/80 ${enabled && !disabled ? accent.text400 : 'text-zinc-500'}`}>
                            <EQIcon />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                                {t(lang, 'equalizer.title')}
                                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/60 text-zinc-400 font-normal">
                                    {bandMode} Bands
                                </span>
                                {disabled && (
                                    <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                        {t(lang, 'equalizer.disabledTag')}
                                    </span>
                                )}
                            </h2>
                            <p className="text-[11px] text-zinc-400">
                                {disabled ? t(lang, 'equalizer.bitperfectDisabled') : t(lang, 'equalizer.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Power Switch */}
                        <button
                            onClick={disabled ? undefined : toggleEnabled}
                            disabled={disabled}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                                disabled
                                    ? 'bg-zinc-800/40 text-zinc-500 border border-zinc-800/50 cursor-not-allowed opacity-50'
                                    : enabled
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs shadow-emerald-950'
                                        : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 hover:text-zinc-200'
                            }`}
                        >
                            <PowerIcon />
                            <span>{enabled && !disabled ? t(lang, 'equalizer.on') : t(lang, 'equalizer.off')}</span>
                        </button>
                    </div>
                </div>



                {/* Control Bar: Band Mode, Presets, Auto Headroom Guard, Zoom & Reset */}
                <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-zinc-800/60 bg-zinc-900/30 text-xs ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
                    {/* Left Group: Band Mode & Preset Selectors */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Band Mode Dropdown */}
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium text-[11px] uppercase tracking-wider">{t(lang, 'equalizer.bandMode')}:</span>
                            <SelectStub
                                options={BAND_MODE_OPTIONS.map((bm) => [String(bm), t(lang, `equalizer.bandMode.${bm}`)])}
                                value={String(bandMode)}
                                onChange={(val) => setBandMode(parseInt(val, 10) as EQBandMode)}
                                disabled={disabled || !enabled}
                                accent={accent}
                                accentColor={accentColor}
                            />
                        </div>

                        {/* Preset Dropdown */}
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium text-[11px] uppercase tracking-wider">{t(lang, 'equalizer.preset')}:</span>
                            <SelectStub
                                options={PRESET_OPTIONS.map((key) => [key, t(lang, `equalizer.preset.${key}`)])}
                                value={preset}
                                onChange={(val) => setPreset(val as EQPresetKey)}
                                disabled={disabled || !enabled}
                                accent={accent}
                                accentColor={accentColor}
                            />
                        </div>

                        {/* Auto Headroom Guard Toggle */}
                        <button
                            onClick={toggleAutoPreamp}
                            disabled={disabled || !enabled}
                            title={t(lang, 'equalizer.autoPreampTip')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer disabled:opacity-50 ${
                                autoPreamp
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-xs shadow-emerald-950/40'
                                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/60'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full transition-colors ${autoPreamp ? 'bg-emerald-400 shadow-xs shadow-emerald-400' : 'bg-zinc-600'}`} />
                            <span>{t(lang, 'equalizer.autoPreamp')}</span>
                        </button>
                    </div>

                    {/* Right Group: Zoom Controls & Reset Button */}
                    <div className="flex items-center gap-3">
                        {/* Zoom Level Controls */}
                        <div className="flex items-center gap-1 bg-zinc-900/80 border border-zinc-800 rounded-xl px-1.5 py-1">
                            <button
                                onClick={() => setZoomLevel(Math.max(1, +(zoomLevel - 0.25).toFixed(2)))}
                                disabled={disabled || !enabled || zoomLevel <= 1}
                                title={t(lang, 'equalizer.zoomOut')}
                                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors"
                            >
                                <ZoomOutIcon size={14} />
                            </button>
                            <span className="text-[11px] font-bold text-zinc-300 px-1.5 tabular-nums">
                                {Math.round(zoomLevel * 100)}%
                            </span>
                            <button
                                onClick={() => setZoomLevel(Math.min(2, +(zoomLevel + 0.25).toFixed(2)))}
                                disabled={disabled || !enabled || zoomLevel >= 2}
                                title={t(lang, 'equalizer.zoomIn')}
                                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer transition-colors"
                            >
                                <ZoomInIcon size={14} />
                            </button>
                        </div>

                        {/* Reset Button */}
                        <button
                            onClick={resetFlat}
                            disabled={disabled || !enabled}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors disabled:opacity-50 cursor-pointer font-medium"
                        >
                            <ResetIcon size={14} />
                            <span>{t(lang, 'equalizer.reset')}</span>
                        </button>
                    </div>
                </div>

                {/* Main Sliders View: Preamp + N-Band Grid */}
                <div className={`p-6 flex gap-6 transition-opacity duration-200 ${enabled && !disabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    {/* Preamp Column */}
                    <div
                        className="flex flex-col items-center shrink-0 pr-4 border-r border-zinc-800/80 transition-all duration-200"
                        style={{height: `${Math.round(224 * zoomLevel)}px`}}
                    >
                        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-2">
                            {t(lang, 'equalizer.preamp')}
                        </span>
                        <span
                            className={`text-[10px] tabular-nums font-semibold mb-2 ${
                                preampDb > 0
                                    ? 'text-amber-400'
                                    : preampDb < 0
                                    ? 'text-rose-400'
                                    : 'text-zinc-500'
                            }`}
                        >
                            {preampDb > 0 ? `+${preampDb}` : `${preampDb}`} dB
                        </span>

                        <div
                            className={`relative flex-1 ${zoomLevel >= 1.5 ? 'w-7' : 'w-5.5'} bg-zinc-900 rounded-md border border-zinc-800/90 flex items-end overflow-hidden ${disabled || !enabled ? 'cursor-not-allowed' : 'cursor-pointer'} transition-all duration-200`}
                            onDoubleClick={disabled || !enabled ? undefined : () => setPreampDb(0)}
                            title={`Preamp: ${preampDb > 0 ? '+' : ''}${preampDb} dB (Double-click to reset)`}
                        >
                            <div
                                className="w-full rounded-sm transition-all duration-75"
                                style={{
                                    height: `${((preampDb + 12) / 24) * 100}%`,
                                    background:
                                        preampDb > 0
                                            ? 'linear-gradient(0deg, #f59e0b, #d97706)'
                                            : preampDb < 0
                                            ? 'linear-gradient(0deg, #f43f5e, #e11d48)'
                                            : accent.hex500,
                                }}
                            />
                            <input
                                type="range"
                                min="-12"
                                max="12"
                                step="1"
                                value={preampDb}
                                disabled={disabled || !enabled}
                                onChange={(e) => setPreampDb(parseFloat(e.target.value))}
                                style={{
                                    writingMode: 'vertical-lr',
                                    direction: 'rtl',
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                            />
                        </div>

                        <span className="text-[10px] font-bold text-zinc-500 mt-2.5">
                            PRE
                        </span>
                    </div>

                    {/* Band Sliders Container (Scrollable for 31 bands) */}
                    <div className="relative flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-zinc-800">
                        <div
                            className="relative flex items-center justify-between min-w-full px-2 transition-all duration-200"
                            style={{
                                height: `${Math.round(224 * zoomLevel)}px`,
                                gap: `${Math.round(8 * zoomLevel)}px`,
                                minWidth: bandMode === 31 ? `${Math.round(1100 * zoomLevel)}px` : 'auto',
                            }}
                        >
                            {/* Reference lines: +12dB, 0dB, -12dB */}
                            <div className="absolute inset-x-2 top-0 h-px bg-zinc-800/60 pointer-events-none" />
                            <div className="absolute inset-x-2 top-1/2 h-px bg-zinc-700/50 border-t border-dashed border-zinc-600/40 pointer-events-none" />
                            <div className="absolute inset-x-2 bottom-0 h-px bg-zinc-800/60 pointer-events-none" />

                            {frequencies.map((freqHz, index) => {
                                const db = gains[index] ?? 0;
                                const fillPct = Math.max(0, Math.min(100, ((db + 12) / 24) * 100));

                                return (
                                    <div key={`${bandMode}-${freqHz}`} className="relative flex-1 flex flex-col items-center h-full z-10 min-w-5">
                                        {/* dB Badge */}
                                        <span
                                            className={`tabular-nums font-semibold mb-2 ${isCompactMode && zoomLevel <= 1.25 ? 'text-[9px]' : 'text-[10px]'} ${
                                                db > 0
                                                    ? 'text-emerald-400'
                                                    : db < 0
                                                    ? 'text-rose-400'
                                                    : 'text-zinc-500'
                                            }`}
                                        >
                                            {db > 0 ? `+${db}` : `${db}`}
                                        </span>

                                        {/* Vertical Slider Track (Wider squarish track) */}
                                        <div
                                            className={`relative flex-1 ${
                                                isCompactMode
                                                    ? (zoomLevel >= 1.5 ? 'w-5.5' : 'w-4')
                                                    : (zoomLevel >= 1.5 ? 'w-8' : 'w-6')
                                            } bg-zinc-900 rounded-md border border-zinc-800/90 flex items-end overflow-hidden ${disabled || !enabled ? 'cursor-not-allowed' : 'cursor-pointer'} group transition-all duration-200`}
                                            onDoubleClick={disabled || !enabled ? undefined : () => setBandGain(index, 0)}
                                            title={`${formatFreqLabel(freqHz)} Hz: ${db > 0 ? '+' : ''}${db} dB (Double-click to reset)`}
                                        >
                                            <div
                                                className="w-full rounded-sm transition-all duration-75"
                                                style={{
                                                    height: `${fillPct}%`,
                                                    background:
                                                        db > 0
                                                            ? 'linear-gradient(0deg, #22c55e, #10b981)'
                                                            : db < 0
                                                            ? 'linear-gradient(0deg, #f43f5e, #e11d48)'
                                                            : accent.hex500,
                                                }}
                                            />
                                            <input
                                                type="range"
                                                min="-12"
                                                max="12"
                                                step="1"
                                                value={db}
                                                disabled={disabled || !enabled}
                                                onChange={(e) => setBandGain(index, parseFloat(e.target.value))}
                                                style={{
                                                    writingMode: 'vertical-lr',
                                                    direction: 'rtl',
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                            />
                                        </div>

                                        {/* Frequency Label */}
                                        <span className={`font-medium text-zinc-400 mt-2.5 truncate max-w-full ${isCompactMode && zoomLevel <= 1.25 ? 'text-[9px]' : 'text-[11px]'}`}>
                                            {formatFreqLabel(freqHz)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="px-6 py-3 border-t border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{t(lang, 'equalizer.tip')}</span>
                </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default memo(EqualizerModal);
