'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getAccent } from '../lib/colors';

interface SeekBarProps {
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

export default function SeekBar({ currentTime, duration, handleSeek, accentColor }: SeekBarProps) {
    const accent = getAccent(accentColor);
    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const [hovering, setHovering] = useState(false);

    return (
        <div className="w-full group">
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
                    value={currentTime}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <motion.div
                    className="absolute w-3.5 h-3.5 rounded-full shadow-lg pointer-events-none"
                    style={{
                        left: `calc(${progressPct}% - 7px)`,
                        backgroundColor: accent.hex400,
                        boxShadow: `0 0 0 3px ${accent.hex500}20, 0 2px 8px ${accent.hex500}40`,
                    }}
                    animate={{ scale: hovering ? 1.3 : 1 }}
                    transition={{ duration: 0.15 }}
                />
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500 mt-1.5 tabular-nums font-medium">
                <span>{formatTime(currentTime)}</span>
                <span className="text-zinc-600">{duration > 0 ? formatTime(duration) : '--:--'}</span>
            </div>
        </div>
    );
}
