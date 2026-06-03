'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getAccent } from '../lib/colors';

interface VolumeControlProps {
    volume: number;
    handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accentColor: string;
}

function VolumeIcon({ volume }: { volume: number }) {
    if (volume === 0) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
        );
    }
    if (volume < 0.5) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
    );
}

export default function VolumeControl({ volume, handleVolumeChange, accentColor }: VolumeControlProps) {
    const accent = getAccent(accentColor);
    const [hovering, setHovering] = useState(false);
    const [prevVolume, setPrevVolume] = useState(volume);

    const toggleMute = () => {
        if (volume > 0) {
            setPrevVolume(volume);
            const fakeEvent = { target: { value: '0' } } as React.ChangeEvent<HTMLInputElement>;
            handleVolumeChange(fakeEvent);
        } else {
            const fakeEvent = { target: { value: String(prevVolume || 0.5) } } as React.ChangeEvent<HTMLInputElement>;
            handleVolumeChange(fakeEvent);
        }
    };

    return (
        <div className="flex items-center gap-3">
            <motion.button
                onClick={toggleMute}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center justify-center w-7 h-7"
            >
                <VolumeIcon volume={volume} />
            </motion.button>

            <div
                className="relative w-48 h-5 flex items-center"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
            >
                <div className="absolute inset-x-0 h-1 rounded-full bg-zinc-800/80" />
                <div
                    className="absolute h-1 rounded-full transition-all duration-75"
                    style={{
                        width: `${volume * 100}%`,
                        background: `linear-gradient(90deg, ${accent.hex500}, ${accent.hex400})`,
                    }}
                />
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <motion.div
                    className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
                    style={{
                        left: `calc(${volume * 100}% - 5px)`,
                        backgroundColor: accent.hex400,
                        boxShadow: `0 0 0 2px ${accent.hex500}20`,
                    }}
                    animate={{ scale: hovering ? 1.3 : 1 }}
                    transition={{ duration: 0.15 }}
                />
            </div>

            <span className="text-[11px] tabular-nums w-8 text-right text-zinc-500 font-medium">
                {Math.round(volume * 100)}%
            </span>
        </div>
    );
}
