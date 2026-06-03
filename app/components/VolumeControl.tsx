'use client';

import React from 'react';
import { getAccent } from '../lib/colors';

interface VolumeControlProps {
    volume: number;
    handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accentColor: string;
}

export default function VolumeControl({ volume, handleVolumeChange, accentColor }: VolumeControlProps) {
    const accent = getAccent(accentColor);
    return (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="text-xs">🔉</span>
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className={`w-32 h-1 appearance-none bg-zinc-800 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                  [&::-webkit-slider-thumb]:rounded-full ${accent.bg400}`}
                style={{
                    background: `linear-gradient(to right, ${accent.hex400} ${volume * 100}%, #27272a ${volume * 100}%)`,
                }}
            />
            <span className="text-xs tabular-nums w-8 text-right text-zinc-500">
                {Math.round(volume * 100)}%
            </span>
        </div>
    );
}
