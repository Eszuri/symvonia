'use client';

import React from 'react';

import { getAccent } from '../lib/colors';

interface SeekBarProps {
    currentTime: number;
    duration: number;
    handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accentColor: string;
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function SeekBar({ currentTime, duration, handleSeek, accentColor }: SeekBarProps) {
    const accent = getAccent(accentColor);
    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="w-full">
            <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className={`w-full h-1 appearance-none bg-zinc-800 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full ${accent.bg500}
                  [&::-webkit-slider-thumb]:shadow-lg ${accent.shadow30}`}
                style={{
                    background: `linear-gradient(to right, ${accent.hex500} ${progressPct}%, #27272a ${progressPct}%)`,
                }}
            />
            <div className="flex justify-between text-[11px] text-zinc-600 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{duration > 0 ? formatTime(duration) : '--:--:--'}</span>
            </div>
        </div>
    );
}
