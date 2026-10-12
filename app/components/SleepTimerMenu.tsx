'use client';

import {useEffect, useId, useRef, useState} from 'react';
import type {SleepTimerControls} from '../hooks/useSleepTimer';
import {t, type Lang} from '../lib/translations';
import {getAccent} from '../lib/colors';

interface Props {
    lang: Lang;
    accentColor: string;
    hasTrack: boolean;
    timer: SleepTimerControls;
    onOpenChange?: (open: boolean) => void;
}

export default function SleepTimerMenu({lang, accentColor, hasTrack, timer, onOpenChange}: Props) {
    const [open, setOpen] = useState(false);
    const [minutes, setMinutes] = useState('1');
    const [afterTrack, setAfterTrack] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const id = useId();
    const accent = getAccent(accentColor);
    const active = timer.mode !== 'off';
    const inputMinutes = Number(minutes);
    const exceedsMaximum = inputMinutes > 1440;
    const showPreview = Number.isFinite(inputMinutes) && inputMinutes >= 0 && inputMinutes <= 1440;
    const hours = Math.floor(timer.remainingSeconds / 3600);
    const minutesLeft = Math.floor(timer.remainingSeconds / 60) % 60;
    const secondsLeft = timer.remainingSeconds % 60;
    const countdown = `${hours ? `${hours}:` : ''}${String(minutesLeft).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;
    const label = timer.mode === 'duration' ? countdown
        : timer.mode === 'track' ? t(lang, 'sleepTimer.trackBadge') : t(lang, 'sleepTimer.title');

    useEffect(() => {
        onOpenChange?.(open);
        return () => {
            if (open) onOpenChange?.(false);
        };
    }, [open, onOpenChange]);

    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    return (
        <div ref={containerRef} className="relative shrink-0" onKeyDown={event => {
            // Keep playback shortcuts from intercepting keyboard use of this control.
            event.stopPropagation();
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        }}>
            <button ref={triggerRef} type="button" onClick={() => {
                if (!open) setAfterTrack(timer.mode === 'track');
                setOpen(!open);
            }}
                aria-expanded={open} aria-controls={id}
                aria-label={`${t(lang, 'sleepTimer.title')}: ${active ? label : t(lang, 'sleepTimer.off')}`}
                title={t(lang, 'sleepTimer.title')}
                className={`flex w-max items-center justify-center gap-1.5 h-9 min-w-9 whitespace-nowrap rounded-lg text-xs font-medium cursor-pointer transition-colors ${active ? `px-3 ${accent.bg15} ${accent.text400}` : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 2h4M12 14l3-3M18 6l1.5-1.5" />
                    <circle cx="12" cy="14" r="8" />
                </svg>
                <span className={active ? 'tabular-nums' : 'sr-only'}>{label}</span>
            </button>
            {open && (
                <div id={id} role="region" aria-label={t(lang, 'sleepTimer.title')}
                    className={`absolute right-0 bottom-full mb-2 ${active ? 'w-64' : 'w-80'} max-w-[calc(100vw-2rem)] z-50 rounded-xl border border-zinc-700/60 bg-zinc-900 p-4 shadow-2xl text-left`}>
                    <div className={`space-y-1 ${active ? 'text-center' : ''}`}>
                        <p className="text-sm font-semibold text-zinc-100">{t(lang, 'sleepTimer.title')}</p>
                        {!active && <p className="text-xs leading-relaxed text-zinc-400">{t(lang, 'sleepTimer.description')}</p>}
                    </div>
                    {active && <div className="mt-4 text-center">
                        <div className={`rounded-xl border px-3 py-4 ${accent.bg15} ${accent.border500_20}`}>
                            {timer.mode === 'duration' ? <>
                                <span className="sr-only">{t(lang, 'sleepTimer.remaining', {time: countdown})}</span>
                                <p aria-hidden="true" className={`text-3xl font-semibold tracking-wide tabular-nums ${accent.text400}`}>{countdown}</p>
                            </> : <p className={`text-base font-semibold ${accent.text400}`}>{t(lang, 'sleepTimer.afterTrack')}</p>}
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                            {t(lang, timer.mode === 'track' ? 'sleepTimer.afterTrackDescription' : 'sleepTimer.description')}
                        </p>
                    </div>}
                    {!active && <form className="mt-4" noValidate={afterTrack} onSubmit={event => {
                        event.preventDefault();
                        if (afterTrack) {
                            if (!hasTrack) return;
                            timer.finishTrack();
                            setOpen(false);
                        } else if (timer.start(Number(minutes))) {
                            setOpen(false);
                        }
                    }}>
                        <label htmlFor={`${id}-minutes`} className="block text-xs font-medium text-zinc-300">{t(lang, 'sleepTimer.custom')}</label>
                        <div className="mt-2 flex items-center gap-2">
                            <input id={`${id}-minutes`} type="number" min="1" max="1440" step="1" required
                                onFocus={() => setAfterTrack(false)}
                                value={minutes} onChange={event => setMinutes(event.target.value)}
                                aria-invalid={!afterTrack && exceedsMaximum || undefined}
                                aria-describedby={!afterTrack && (exceedsMaximum || showPreview) ? `${id}-preview` : undefined}
                                className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm tabular-nums outline-none focus:border-zinc-400" />
                            <button type="button" disabled={!hasTrack && !afterTrack} aria-pressed={afterTrack}
                                aria-label={t(lang, 'sleepTimer.afterTrack')} title={t(lang, 'sleepTimer.afterTrack')}
                                aria-describedby={afterTrack ? `${id}-preview` : undefined}
                                onClick={() => setAfterTrack(!afterTrack)}
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${afterTrack ? `${accent.bg15} ${accent.text400} ${accent.border500_20}` : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M9 18V5l9-2v6" />
                                    <circle cx="6" cy="18" r="3" />
                                    <rect x="14" y="13" width="7" height="7" rx="1" />
                                </svg>
                            </button>
                            <button type="submit" disabled={afterTrack && !hasTrack} className={`h-10 min-w-19 shrink-0 rounded-lg px-4 text-xs font-semibold text-white ${accent.bg500} hover:brightness-110 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}>{t(lang, 'sleepTimer.start')}</button>
                        </div>
                        {(afterTrack || exceedsMaximum || showPreview) && <p id={`${id}-preview`} className={`mt-1.5 text-xs ${!afterTrack && exceedsMaximum ? 'text-red-400' : 'text-zinc-400'}`} aria-live="polite">
                            {afterTrack ? t(lang, 'sleepTimer.afterTrackDescription')
                                : exceedsMaximum ? t(lang, 'sleepTimer.maximumExceeded')
                                : t(lang, 'sleepTimer.preview', {hours: Math.floor(inputMinutes / 60), minutes: inputMinutes % 60})}
                        </p>}
                    </form>}
                    {active && <div className="mt-4">
                        <button type="button" onClick={() => {timer.cancel(); setOpen(false);}}
                            className="h-9 w-full rounded-lg border border-red-500/20 bg-red-500/5 text-xs font-medium text-red-400 hover:border-red-500/40 hover:bg-red-500/10 cursor-pointer transition-colors">{t(lang, 'sleepTimer.cancel')}</button>
                    </div>}
                </div>
            )}
        </div>
    );
}
