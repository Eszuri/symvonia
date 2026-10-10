import {useCallback, useEffect, useRef} from "react";
import {getTauri, isBrowserTauri} from "../../lib/homeState";

const MIN_RESUME_VOLUME = 0.01;

export interface UseAudioVolumeOptions {
    volumeMode: "app" | "system";
    appVolume: number;
    systemVolume: number;
    setAppVolume: (v: number) => void;
    setSystemVolume: (v: number) => void;
    volumeLimit: number;
    systemMuted: boolean;
    setSystemMuted: React.Dispatch<React.SetStateAction<boolean>>;
    lastLocalVolumeSetRef: React.RefObject<number>;
    pauseIfMuted: boolean;
    isPlaying: boolean;
    setIsPlaying: (v: boolean) => void;
    audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useAudioVolume({
    volumeMode,
    appVolume,
    systemVolume,
    setAppVolume,
    setSystemVolume,
    volumeLimit,
    systemMuted,
    setSystemMuted,
    lastLocalVolumeSetRef,
    pauseIfMuted,
    isPlaying,
    setIsPlaying,
    audioRef,
}: UseAudioVolumeOptions) {
    const volumeModeRef = useRef<"app" | "system">(volumeMode);
    const volumeLimitRef = useRef<number>(volumeLimit);
    const autoPausedBySilenceRef = useRef(false);

    useEffect(() => {
        volumeModeRef.current = volumeMode;
        volumeLimitRef.current = volumeLimit;
    }, [volumeMode, volumeLimit]);

    const activeVolume = volumeMode === "system" ? systemVolume : appVolume;

    const isVolumeSilent = useCallback(() => {
        return volumeMode === "app"
            ? appVolume <= 0
            : systemMuted || systemVolume <= 0;
    }, [appVolume, systemMuted, systemVolume, volumeMode]);

    const setMinimumResumeVolume = useCallback(async () => {
        if (volumeMode === "app") {
            setAppVolume(MIN_RESUME_VOLUME);
            if (audioRef.current) audioRef.current.volume = MIN_RESUME_VOLUME;
            return MIN_RESUME_VOLUME;
        }

        const targetPct = 1;
        const targetVolume = targetPct / 100;
        setSystemVolume(targetVolume);
        setSystemMuted(false);
        lastLocalVolumeSetRef.current = Date.now();

        if (!isBrowserTauri()) return targetVolume;

        try {
            const mod = await getTauri();
            await mod.invoke("set_system_volume", {value: targetPct});
            await mod.invoke("set_system_mute", {mute: false});
        } catch {
            // Keep local playback responsive even if the OS volume call fails.
        }
        return targetVolume;
    }, [
        audioRef,
        lastLocalVolumeSetRef,
        setAppVolume,
        setSystemMuted,
        setSystemVolume,
        volumeMode,
    ]);

    const handleVolumeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isFinite(parsed)) return;
            const v = Math.max(0, Math.min(1, parsed));
            if (volumeModeRef.current === "app") {
                setAppVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
            } else {
                const targetPct = Math.round(v * 100);
                if (volumeLimit > 0 && targetPct > volumeLimit) return;
                setSystemVolume(v);
                setSystemMuted(targetPct === 0);
                lastLocalVolumeSetRef.current = Date.now();
                if (isBrowserTauri()) {
                    getTauri()
                        .then(async (m) => {
                            await m.invoke("set_system_volume", {value: targetPct});
                            if (targetPct > 0) {
                                await m.invoke("set_system_mute", {mute: false});
                                setSystemMuted(false);
                            }
                        })
                        .catch(() => {});
                }
            }
        },
        [
            audioRef,
            volumeLimit,
            setAppVolume,
            setSystemVolume,
            setSystemMuted,
            lastLocalVolumeSetRef,
        ],
    );

    const toggleSystemMute = useCallback(() => {
        if (!isBrowserTauri()) return;
        const shouldMute = !systemMuted;
        setSystemMuted(shouldMute);
        lastLocalVolumeSetRef.current = Date.now();
        getTauri()
            .then((m) => m.invoke("set_system_mute", {mute: shouldMute}))
            .catch(() => {});
    }, [systemMuted, setSystemMuted, lastLocalVolumeSetRef]);

    useEffect(() => {
        if (!audioRef.current) return;
        if (volumeMode === "app") {
            audioRef.current.volume = Math.max(0, Math.min(1, appVolume));
        } else {
            audioRef.current.volume = 1;
        }
    }, [audioRef, volumeMode, appVolume]);

    useEffect(() => {
        if (!pauseIfMuted || !isPlaying) return;
        const isZero =
            volumeMode === "app" ? appVolume <= 0 : systemMuted || systemVolume <= 0;
        if (isZero && audioRef.current) {
            autoPausedBySilenceRef.current = true;
            audioRef.current.pause();
            setIsPlaying(false);
        }
    }, [
        audioRef,
        pauseIfMuted,
        volumeMode,
        appVolume,
        systemVolume,
        systemMuted,
        isPlaying,
        setIsPlaying,
    ]);

    useEffect(() => {
        if (!pauseIfMuted || !autoPausedBySilenceRef.current) return;
        const audio = audioRef.current;
        if (!audio || !audio.src || !audio.paused) return;
        const stillSilent =
            volumeMode === "app" ? appVolume <= 0 : systemMuted || systemVolume <= 0;
        if (stillSilent) return;
        autoPausedBySilenceRef.current = false;
        audio.play().catch(() => {
            autoPausedBySilenceRef.current = true;
        });
    }, [audioRef, pauseIfMuted, volumeMode, appVolume, systemVolume, systemMuted]);

    useEffect(() => {
        if (!pauseIfMuted) autoPausedBySilenceRef.current = false;
    }, [pauseIfMuted]);

    return {
        activeVolume,
        volumeModeRef,
        autoPausedBySilenceRef,
        isVolumeSilent,
        setMinimumResumeVolume,
        handleVolumeChange,
        toggleSystemMute,
    };
}
