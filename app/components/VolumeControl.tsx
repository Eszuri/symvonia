'use client';

import React, { memo, useEffect, useRef } from 'react';
import { getAccent } from '../lib/colors';
import { t, type Lang } from '../lib/translations';
import { useHoverDescription } from '../hooks/useHoverDescription';
import { VolumeMuteIcon, VolumeLowIcon, VolumeHighIcon, MinusIcon, PlusIcon, ResetIcon, LockIcon } from './icons';

interface VolumeControlProps {
    lang: Lang;
    volume: number;
    volumeMode: 'app' | 'system';
    systemVolumeSynced: boolean;
    systemMuted: boolean;
    volumeLimit: number;
    volumeStep: number;
    handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onToggleSystemMute: () => void;
    accentColor: string;
    disabled?: boolean;
    isExclusiveMode?: boolean;
}

function VolumeIcon({ muted, low }: { muted: boolean; low: boolean }) {
    if (muted) return <VolumeMuteIcon size={18} />;
    if (low) return <VolumeLowIcon size={18} />;
    return <VolumeHighIcon size={18} />;
}

function makeChangeEvent(value: number): React.ChangeEvent<HTMLInputElement> {
    return { target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>;
}

function VolumeControl({
    lang,
    volume,
    volumeMode,
    systemVolumeSynced,
    systemMuted,
    volumeLimit,
    volumeStep,
    handleVolumeChange,
    onToggleSystemMute,
    accentColor,
    disabled = false,
    isExclusiveMode = false,
}: VolumeControlProps) {
    const accent = getAccent(accentColor);
    const prevVolumeRef = useRef(volume);

    const isSystem = volumeMode === 'system';
    const limit = volumeLimit;
    const controlDisabled = disabled;
    const pct = Math.round(volume * 100);

    useEffect(() => {
        if (volume > 0 && !(isSystem && systemMuted)) {
            prevVolumeRef.current = volume;
        }
    }, [volume, isSystem, systemMuted]);

    let isDecreaseDisabled = false;
    let isIncreaseDisabled = false;
    let isSliderDisabled = false;

    if (isSystem && limit > 0) {
        if (pct > limit) {
            isDecreaseDisabled = true;
            isIncreaseDisabled = true;
            isSliderDisabled = true;
        }
        else if (pct === limit) {
            isDecreaseDisabled = false;
            isIncreaseDisabled = true;
            isSliderDisabled = false;
        }
        else {
            isDecreaseDisabled = false;
            isIncreaseDisabled = false;
            isSliderDisabled = false;
        }
    }

    const showResetButton = isSystem && limit > 0 && pct > limit;

    const sliderMax = isSystem
        ? (limit > 0 ? limit : 100)
        : 1;

    const showSlider = !isSystem || systemVolumeSynced;
    const muted = isSystem ? (systemMuted || pct <= 0) : volume <= 0;
    const low = pct < 50;
    const label = isSystem
        ? systemVolumeSynced ? (muted ? t(lang, 'volume.muted') : `${pct}%`) : t(lang, 'volume.notSynced')
        : `${pct}%`;

    const toggleMute = () => {
        if (controlDisabled) return;
        if (isSystem) {
            onToggleSystemMute();
        } else if (!muted) {
            prevVolumeRef.current = volume;
            handleVolumeChange(makeChangeEvent(0));
        } else {
            const restored = prevVolumeRef.current || 0.5;
            handleVolumeChange(makeChangeEvent(restored));
        }
    };

    const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (controlDisabled || isSliderDisabled) return;
        if (isSystem) {
            let sysVal = parseFloat(e.target.value);
            if (limit > 0 && sysVal > limit) {
                sysVal = limit;
            }
            handleVolumeChange(makeChangeEvent(sysVal / 100));
        } else {
            handleVolumeChange(e);
        }
    };

    const onStepButton = (direction: 'up' | 'down') => {
        if (direction === 'up' && isIncreaseDisabled) return;
        if (direction === 'down' && isDecreaseDisabled) return;

        const step = volumeStep / 100;
        const delta = direction === 'up' ? step : -step;
        let newVol = Math.max(0, Math.min(1, Math.round((volume + delta) / step) * step));

        if (isSystem && limit > 0) {
            const targetPct = Math.round(newVol * 100);
            if (pct > limit) return;
            if (pct === limit && direction === 'up') return;
            if (targetPct > limit) {
                newVol = limit / 100;
            }
        }
        handleVolumeChange(makeChangeEvent(newVol));
    };

    const onResetToLimit = () => {
        if (isSystem && limit > 0) {
            handleVolumeChange(makeChangeEvent(limit / 100));
        }
    };

    const decreaseBtnClass = `w-5 h-5 flex items-center justify-center rounded transition-colors ${isDecreaseDisabled
        ? "text-white/30 bg-transparent cursor-not-allowed pointer-events-none"
        : "text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
        }`;

    const increaseBtnClass = `w-5 h-5 flex items-center justify-center rounded transition-colors ${isIncreaseDisabled
        ? "text-white/30 bg-transparent cursor-not-allowed pointer-events-none"
        : "text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
        }`;

    const visualPct = isSystem ? Math.min(pct, sliderMax) : volume * 100;

    const muteHover = useHoverDescription(t(lang, muted ? 'status.unmute' : 'status.mute'));
    const volumeHover = useHoverDescription(t(lang, 'status.volume'));

    return (
        <div className="flex flex-col items-center w-full justify-center">
            <div className="flex items-center gap-2 w-full justify-center">
                <button
                    {...muteHover}
                    onClick={toggleMute}
                    disabled={controlDisabled}
                    className="text-white/80 hover:text-white cursor-pointer flex items-center justify-center w-7 h-7 shrink-0"
                >
                    <VolumeIcon muted={muted} low={low} />
                </button>

                <button
                    {...volumeHover}
                    onClick={() => onStepButton('down')}
                    disabled={controlDisabled || isDecreaseDisabled}
                    className={decreaseBtnClass}
                    title={isDecreaseDisabled ? t(lang, 'volume.decreaseDisabled') : t(lang, 'volume.decrease')}
                >
                    <MinusIcon size={12} />
                </button>

                <div
                    {...volumeHover}
                    className="relative flex-1 min-w-14 max-w-40 h-5 flex items-center">
                    <div className="absolute inset-x-0 h-1 rounded-full bg-zinc-800/80" />
                    {showSlider && (
                        <>
                            <div
                                className="absolute h-1 rounded-full transition-all duration-75"
                                style={{
                                    width: isSystem && sliderMax > 0 ? `${(visualPct / sliderMax) * 100}%` : `${visualPct}%`,
                                    background: isSliderDisabled
                                        ? '#52525b'
                                        : `linear-gradient(90deg, ${accent.hex500}, ${accent.hex400})`,
                                }}
                            />
                            <div
                                className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
                                style={{
                                    left: isSystem && sliderMax > 0
                                        ? `calc(${(visualPct / sliderMax) * 100}% - 5px)`
                                        : `calc(${visualPct}% - 5px)`,
                                    backgroundColor: isSliderDisabled ? '#71717a' : accent.hex400,
                                    boxShadow: isSliderDisabled ? 'none' : `0 0 0 2px ${accent.hex500}20`,
                                }}
                            />
                        </>
                    )}
                    <input
                        type="range"
                        min="0"
                        max={isSystem ? String(sliderMax) : "1"}
                        step={isSystem ? "1" : "0.01"}
                        disabled={controlDisabled || isSliderDisabled}
                        value={showSlider ? (isSystem ? visualPct : volume) : 0}
                        onChange={onSliderChange}
                        className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isSliderDisabled ? "cursor-not-allowed" : "cursor-pointer"
                            }`}
                    />
                </div>

                {showResetButton ? (
                    <button
                        {...volumeHover}
                        onClick={onResetToLimit}
                        className="w-5 h-5 ml-3 -mr-3 flex items-center justify-center rounded text-amber-300 hover:text-amber-100 bg-amber-950/80 hover:bg-amber-900/90 border border-amber-600/60 cursor-pointer transition-colors shadow-xs"
                        title={t(lang, 'volume.resetToLimit', { limit })}
                    >
                        <ResetIcon size={12} />
                    </button>
                ) : (
                    <button
                        {...volumeHover}
                        onClick={() => onStepButton('up')}
                        disabled={isIncreaseDisabled}
                        className={increaseBtnClass}
                        title={isIncreaseDisabled ? t(lang, 'volume.increaseDisabled') : t(lang, 'volume.increase')}
                    >
                        <PlusIcon size={12} />
                    </button>
                )}

                <span className="text-[11px] tabular-nums text-right text-white/50 font-medium min-w-9">
                    {label}
                </span>
            </div>

            <span
                title={isExclusiveMode ? t(lang, 'general.volumeMode.nativeDisabled') : undefined}
                className="text-[10px] text-zinc-300 font-medium tracking-tight -mt-1.5 leading-none select-none text-center inline-flex items-center justify-center gap-1"
            >
                {isExclusiveMode && (
                    <span className="text-amber-400 inline-flex items-center" aria-label="WASAPI Exclusive Locked">
                        <LockIcon size={10} />
                    </span>
                )}
                <span>{t(lang, isSystem ? 'general.volumeMode.system' : 'general.volumeMode.app')}</span>
            </span>
        </div>
    );
}
export default memo(VolumeControl);
