'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {isBrowserTauri} from '../lib/homeState';
import {t, type Lang} from '../lib/translations';

interface UseAppUpdaterOptions {
    addLog: (level: string, message: string) => void;
    lang: Lang;
}

interface AutoUpdateInfo {
    version: string;
    update: unknown;
}

import { getStoredValue, setStoredValue } from '../lib/storage';

function getSkippedVersion(): string | null {
    return getStoredValue('skipped_update_version', null);
}

function setSkippedVersion(version: string) {
    setStoredValue('skipped_update_version', version);
}

export function useAppUpdater(options: UseAppUpdaterOptions) {
    const {addLog, lang} = options;
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateStatus, setUpdateStatus] = useState('');
    const [updateDownloaded, setUpdateDownloaded] = useState(0);
    const [updateTotal, setUpdateTotal] = useState(0);
    const updateTotalRef = useRef(0);

    const [autoUpdateInfo, setAutoUpdateInfo] = useState<AutoUpdateInfo | null>(null);
    const [autoUpdateDownloading, setAutoUpdateDownloading] = useState(false);
    const [autoUpdateProgress, setAutoUpdateProgress] = useState(0);
    const [autoUpdateTotal, setAutoUpdateTotal] = useState(0);
    const autoUpdateTotalRef = useRef(0);
    const autoCheckDone = useRef(false);

    const handleCheckUpdate = useCallback(async () => {
        if (!isBrowserTauri()) {
            setUpdateStatus(t(lang, 'general.update.desktopOnly'));
            return;
        }
        setUpdateChecking(true);
        setUpdateStatus('');
        setUpdateDownloaded(0);
        setUpdateTotal(0);
        updateTotalRef.current = 0;
        try {
            const {check} = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update) {
                setUpdateStatus(t(lang, 'general.update.available', {version: update.version}));
                await update.download((ev: {event: string; data?: {contentLength?: number; chunkLength?: number}}) => {
                    if (ev.event === 'Started') {
                        const total = ev.data?.contentLength ?? 0;
                        updateTotalRef.current = total;
                        setUpdateTotal(total);
                        setUpdateDownloaded(0);
                    } else if (ev.event === 'Progress') {
                        setUpdateDownloaded((d: number) => d + (ev.data?.chunkLength ?? 0));
                    }
                });
                const total = updateTotalRef.current;
                if (total > 0) setUpdateDownloaded(total);
                setUpdateStatus(t(lang, 'general.update.installing', {version: update.version}));
                await update.install();
            } else {
                setUpdateStatus(t(lang, 'general.update.latest'));
            }
        } catch (e) {
            const msg = String(e);
            setUpdateStatus(t(lang, 'general.update.error', {msg: msg.slice(0, 80)}));
            addLog('error', t(lang, 'log.updateCheckFailed', {msg: msg.slice(0, 80)}));
        } finally {
            setUpdateChecking(false);
            setUpdateDownloaded(0);
            setUpdateTotal(0);
            updateTotalRef.current = 0;
        }
    }, [addLog, lang]);

    const autoCheckUpdate = useCallback(async () => {
        if (!isBrowserTauri()) return;
        if (autoCheckDone.current) return;
        autoCheckDone.current = true;
        try {
            const {check} = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update) {
                const skipped = getSkippedVersion();
                if (skipped === update.version) return;
                setAutoUpdateInfo({version: update.version, update});
            }
        } catch {
            // silently ignore — user may be offline
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => autoCheckUpdate(), 1000);
        return () => clearTimeout(timer);
    }, [autoCheckUpdate]);

    const dismissAutoUpdate = useCallback(() => {
        setAutoUpdateInfo(null);
        setAutoUpdateDownloading(false);
        setAutoUpdateProgress(0);
        setAutoUpdateTotal(0);
    }, []);

    const skipAutoUpdateVersion = useCallback(() => {
        if (autoUpdateInfo) {
            setSkippedVersion(autoUpdateInfo.version);
        }
        dismissAutoUpdate();
    }, [autoUpdateInfo, dismissAutoUpdate]);

    const startAutoUpdateDownload = useCallback(async () => {
        if (!autoUpdateInfo) return;
        setAutoUpdateDownloading(true);
        setAutoUpdateProgress(0);
        setAutoUpdateTotal(0);
        autoUpdateTotalRef.current = 0;
        try {
            const {check} = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update && update.version === autoUpdateInfo.version) {
                await update.download((ev: {event: string; data?: {contentLength?: number; chunkLength?: number}}) => {
                    if (ev.event === 'Started') {
                        const total = ev.data?.contentLength ?? 0;
                        autoUpdateTotalRef.current = total;
                        setAutoUpdateTotal(total);
                        setAutoUpdateProgress(0);
                    } else if (ev.event === 'Progress') {
                        setAutoUpdateProgress((d: number) => d + (ev.data?.chunkLength ?? 0));
                    }
                });
                const total = autoUpdateTotalRef.current;
                if (total > 0) setAutoUpdateProgress(total);
                await update.install();
            } else {
                setAutoUpdateInfo(update ? {version: update.version, update} : null);
                setAutoUpdateProgress(0);
                setAutoUpdateTotal(0);
                autoUpdateTotalRef.current = 0;
            }
        } catch (e) {
            const msg = String(e);
            addLog('error', t(lang, 'log.autoUpdateFailed', {msg: msg.slice(0, 80)}));
            setAutoUpdateInfo(null);
        } finally {
            setAutoUpdateDownloading(false);
        }
    }, [autoUpdateInfo, addLog, lang]);

    return {
        updateChecking,
        updateStatus,
        updateDownloaded,
        updateTotal,
        handleCheckUpdate,
        autoUpdateInfo,
        autoUpdateShown: autoUpdateInfo !== null,
        autoUpdateDownloading,
        autoUpdateProgress,
        autoUpdateTotal,
        dismissAutoUpdate,
        skipAutoUpdateVersion,
        startAutoUpdateDownload,
    };
}
