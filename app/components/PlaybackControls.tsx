'use client';

import {memo} from 'react';
import {FileEntry} from './FolderExplorer';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {useHoverDescription} from '../hooks/useHoverDescription';
import {ShuffleIcon, RepeatIcon, PrevIcon, NextIcon, PlayIcon, PauseIcon} from './icons';
import SleepTimerMenu from './SleepTimerMenu';
import type {SleepTimerControls} from '../hooks/useSleepTimer';

interface PlaybackControlsProps {
    sleepTimer: SleepTimerControls;
    onSleepTimerOpenChange?: (open: boolean) => void;
    lang: Lang;
    selectedSong: FileEntry | null;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: 'off' | 'all' | 'one';
    playPrev: () => void;
    togglePlayPause: () => void;
    playNext: () => void;
    setShuffle: (v: boolean) => void;
    setRepeat: (v: 'off' | 'all' | 'one') => void;
    accentColor: string;
}

function PlaybackControls({
    sleepTimer,
    onSleepTimerOpenChange,
    lang,
    selectedSong,
    isPlaying,
    shuffle,
    repeat,
    playPrev,
    togglePlayPause,
    playNext,
    setShuffle,
    setRepeat,
    accentColor,
}: PlaybackControlsProps) {
    const accent = getAccent(accentColor);
    const hasSong = !!selectedSong;

    const cycleRepeat = () => {
        if (repeat === 'off') setRepeat('all');
        else if (repeat === 'all') setRepeat('one');
        else setRepeat('off');
    };

    const shuffleClass = shuffle
        ? `${accent.text400} ${accent.bg15} border ${accent.border500_20}`
        : 'text-white/70 hover:text-white border border-transparent hover:border-white/20 hover:bg-white/10';

    const repeatClass =
        repeat === 'off'
            ? 'text-white/70 hover:text-white border border-transparent hover:border-white/20 hover:bg-white/10'
            : repeat === 'all'
                ? `${accent.text400} ${accent.bg15} border ${accent.border500_20}`
                : `${accent.text400} ${accent.bg30} border ${accent.border500_20}`;

    const repeatTitle =
        repeat === 'off'
            ? t(lang, 'playback.repeatOff')
            : repeat === 'all'
                ? t(lang, 'playback.repeatAll')
                : t(lang, 'playback.repeatOne');

    const shuffleHover = useHoverDescription(hasSong ? t(lang, shuffle ? 'status.shuffleOff' : 'status.shuffleOn') : null);
    const prevHover = useHoverDescription(hasSong ? t(lang, 'status.prev') : null);
    const playPauseHover = useHoverDescription(hasSong ? t(lang, isPlaying ? 'status.pause' : 'status.play') : null);
    const nextHover = useHoverDescription(hasSong ? t(lang, 'status.next') : null);
    const repeatHover = useHoverDescription(hasSong ? t(lang, repeat === 'off' ? 'status.repeatAll' : repeat === 'all' ? 'status.repeatOne' : 'status.repeatOff') : null);

    return (
        <div className="flex w-full justify-center px-11 sm:px-12 md:px-13">
            <div className="relative flex items-center gap-2 sm:gap-3 md:gap-4">

            {/* ── Shuffle ─────────────────────────────────────────── */}
            <button
                {...shuffleHover}
                onClick={() => setShuffle(!shuffle)}
                disabled={!hasSong}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150
                    ${shuffleClass}
                    disabled:opacity-30 disabled:cursor-default`}
                title={shuffle ? t(lang, 'playback.shuffleOn') : t(lang, 'playback.shuffleOff')}
            >
                <ShuffleIcon />
                {shuffle && (
                    <span
                        className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${accent.bg400}`}
                    />
                )}
            </button>

            {/* ── Previous ────────────────────────────────────────── */}
            <button
                {...prevHover}
                onClick={playPrev}
                disabled={!hasSong}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30 cursor-pointer transition-colors"
            >
                <PrevIcon size={22} />
            </button>

            {/* ── Play / Pause ─────────────────────────────────────── */}
            <button
                {...playPauseHover}
                onClick={togglePlayPause}
                disabled={!hasSong}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center cursor-pointer
                    ${hasSong ? `${accent.bg500} shadow-lg text-white ${accent.shadow25}` : 'bg-white/10 text-white/50'}`}
                style={hasSong ? {boxShadow: `0 4px 20px ${accent.hex500}30`} : {}}
            >
                {hasSong && isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </button>

            {/* ── Next ────────────────────────────────────────────── */}
            <button
                {...nextHover}
                onClick={playNext}
                disabled={!hasSong}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white disabled:opacity-30 cursor-pointer transition-colors"
            >
                <NextIcon size={22} />
            </button>

            {/* ── Repeat ──────────────────────────────────────────── */}
            <button
                {...repeatHover}
                onClick={cycleRepeat}
                disabled={!hasSong}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150
                    ${repeatClass}
                    disabled:opacity-30 disabled:cursor-default`}
                title={repeatTitle}
            >
                <RepeatIcon mode={repeat} />
                {repeat !== 'off' && (
                    <span
                        className={`absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full ${accent.bg400}
                            ${repeat === 'one' ? 'w-1.5 h-1.5' : 'w-1 h-1'}`}
                    />
                )}
            </button>

                <div className="absolute left-full ml-2 sm:ml-3 md:ml-4">
                    <SleepTimerMenu lang={lang} accentColor={accentColor} hasTrack={hasSong} timer={sleepTimer} onOpenChange={onSleepTimerOpenChange} />
                </div>
            </div>
        </div>
    );
}

export default memo(PlaybackControls);
