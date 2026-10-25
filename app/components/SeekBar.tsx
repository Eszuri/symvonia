'use client';

import React, { memo, useState } from 'react';
import { getAccent } from '../lib/colors';
import { t, type Lang } from '../lib/translations';
import { useHoverDescription } from '../hooks/useHoverDescription';

interface SeekBarProps {
    lang: Lang;
    currentTime: number;
    duration: number;
    handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accentColor: string;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function SeekBar({ lang, currentTime, duration, handleSeek, accentColor }: SeekBarProps) {
    const accent = getAccent(accentColor);
    const [isDragging, setIsDragging] = useState(false);
    const [dragTime, setDragTime] = useState(0);
    const [hovering, setHovering] = useState(false);
    const hoverProps = useHoverDescription(t(lang, 'status.seekBar'));

    const displayTime = isDragging ? dragTime : currentTime;
    const safeDisplayTime = duration > 0 ? Math.min(duration, Math.max(0, displayTime)) : 0;
    const progressPct = duration > 0 ? Math.min(100, Math.max(0, (safeDisplayTime / duration) * 100)) : 0;

    const handlePointerDown = () => {
        setIsDragging(true);
        setDragTime(safeDisplayTime);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (isDragging) {
            setDragTime(val);
        } else {
            handleSeek(e);
        }
    };

    const handleCommit = (e: React.PointerEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) => {
        if (isDragging) {
            setIsDragging(false);
            const val = parseFloat((e.currentTarget as HTMLInputElement).value);
            handleSeek({ target: { value: String(val) } } as React.ChangeEvent<HTMLInputElement>);
        }
    };

    return (
        <div className="w-full group" {...hoverProps}>
            <div
                className="relative w-full h-5 flex items-center cursor-pointer"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
            >
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-zinc-800/80" />
                <div
                    className="absolute h-1.5 rounded-full transition-all duration-75"
                    style={{
                        width: `${progressPct}%`,
                        background: `linear-gradient(90deg, ${accent.hex500}, ${accent.hex400})`,
                        boxShadow: hovering ? `0 0 8px ${accent.hex500}40` : 'none',
                    }}
                />
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={safeDisplayTime}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handleCommit}
                    onPointerCancel={handleCommit}
                    onChange={handleChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                    className="absolute w-3.5 h-3.5 rounded-full shadow-lg pointer-events-none"
                    style={{
                        left: `calc(${progressPct}% - 7px)`,
                        backgroundColor: accent.hex400,
                        boxShadow: `0 0 0 3px ${accent.hex500}20, 0 2px 8px ${accent.hex500}40`,
                    }}
                />
            </div>
            <div className="flex justify-between text-[11px] text-white/80 mt-1.5 tabular-nums font-medium">
                <span>{formatTime(safeDisplayTime)}</span>
                <span className="text-white/60">{duration > 0 ? formatTime(duration) : t(lang, 'seekBar.fallback')}</span>
            </div>
        </div>
    );
}

export default memo(SeekBar);
