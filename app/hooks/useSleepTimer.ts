'use client';

import {useCallback, useEffect, useRef, useState} from 'react';

type Timer = {mode: 'duration'; endsAt: number} | {mode: 'track'} | null;

export function useSleepTimer(onExpire: () => void) {
    const [timer, setTimer] = useState<Timer>(null);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const timerRef = useRef<Timer>(null);
    const trackEndRef = useRef(false);
    const onExpireRef = useRef(onExpire);

    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    const cancel = useCallback(() => {
        timerRef.current = null;
        trackEndRef.current = false;
        setTimer(null);
        setRemainingSeconds(0);
    }, []);

    const start = useCallback((minutes: number) => {
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return false;
        const next: Timer = {mode: 'duration', endsAt: Date.now() + minutes * 60_000};
        timerRef.current = next;
        trackEndRef.current = false;
        setTimer(next);
        setRemainingSeconds(minutes * 60);
        return true;
    }, []);

    const finishTrack = useCallback(() => {
        const next: Timer = {mode: 'track'};
        timerRef.current = next;
        trackEndRef.current = true;
        setTimer(next);
        setRemainingSeconds(0);
    }, []);

    // Called synchronously by both playback engines before repeat or next-track logic.
    const consumeTrackEnd = useCallback(() => {
        const current = timerRef.current;
        if (!current || (current.mode === 'duration' && Date.now() < current.endsAt)) return false;
        cancel();
        return true;
    }, [cancel]);

    useEffect(() => {
        if (timer?.mode !== 'duration') return;
        let timeout: ReturnType<typeof setTimeout>;
        const tick = () => {
            if (timerRef.current !== timer) return;
            const remaining = Math.max(0, timer.endsAt - Date.now());
            if (remaining === 0) {
                cancel();
                onExpireRef.current();
                return;
            }
            setRemainingSeconds(Math.ceil(remaining / 1000));
            timeout = setTimeout(tick, Math.min(1000, remaining));
        };
        timeout = setTimeout(tick, Math.min(1000, Math.max(0, timer.endsAt - Date.now())));
        return () => clearTimeout(timeout);
    }, [timer, cancel]);

    return {mode: timer?.mode ?? 'off', remainingSeconds, start, finishTrack, cancel, consumeTrackEnd, trackEndRef};
}

export type SleepTimerControls = ReturnType<typeof useSleepTimer>;
