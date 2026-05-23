'use client';

import React from 'react';

interface VolumeControlProps {
    volume: number;
    handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function VolumeControl({ volume, handleVolumeChange }: VolumeControlProps) {
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
                className="w-32 h-1 appearance-none bg-zinc-800 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-300"
                style={{
                    background: `linear-gradient(to right, #d4d4d8 ${volume * 100}%, #27272a ${volume * 100}%)`,
                }}
            />
            <span className="text-xs tabular-nums w-8 text-right text-zinc-500">
                {Math.round(volume * 100)}%
            </span>
        </div>
    );
}
