'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {SelectStub, SettingGroup, SettingRow, ToggleStub} from './controls';
import {t, type Lang} from '../../lib/translations';
import {getAccent} from '../../lib/colors';
import {useBitPerfectEngine, type EngineDevice, type WasapiSupportResult} from '../../hooks/useBitPerfectEngine';
import type {PlaybackRuntimeInfo} from '../../hooks/audio/playbackTypes';
import type {OutputMode} from '../../lib/storage';
import ConfirmDialog from '../ConfirmDialog';

function isNativeMode(mode: OutputMode): boolean {
    const nativeModes: OutputMode[] = ['wasapi_shared', 'wasapi_exclusive'];
    return nativeModes.includes(mode);
}

export default function AudioSection({
    lang,
    outputDevice,
    setOutputDevice,
    outputMode,
    setOutputMode,
    audioRuntime,
    onResetPlayer,
    accentColor,
    autoFallbackHtmlAudio = false,
    setAutoFallbackHtmlAudio,
}: {
    lang: Lang;
    outputDevice: string | null;
    setOutputDevice: (v: string | null) => void;
    outputMode: OutputMode;
    setOutputMode: (v: OutputMode) => void;
    audioRuntime: PlaybackRuntimeInfo;
    onResetPlayer: () => void;
    onRetryNativeAudio?: () => void;
    accentColor: string;
    autoFallbackHtmlAudio?: boolean;
    setAutoFallbackHtmlAudio?: (v: boolean) => void;
}) {
    const accent = getAccent(accentColor);
    const {status, getDevices, testDevice} = useBitPerfectEngine();
    const [devices, setDevices] = useState<EngineDevice[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [devicesError, setDevicesError] = useState<string | null>(null);
    const [pendingMode, setPendingMode] = useState<OutputMode | null>(null);
    const [confirmModeOpen, setConfirmModeOpen] = useState(false);
    const [prevPropDevice, setPrevPropDevice] = useState(outputDevice);
    const [selectedDevice, setSelectedDevice] = useState<string | null>(outputDevice);
    const [appliedFeedback, setAppliedFeedback] = useState(false);
    const [testingDevice, setTestingDevice] = useState(false);
    const [testResult, setTestResult] = useState<WasapiSupportResult | null>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const testTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (testTimerRef.current !== null) {
                window.clearTimeout(testTimerRef.current);
            }
        };
    }, []);

    if (prevPropDevice !== outputDevice) {
        setPrevPropDevice(outputDevice);
        setSelectedDevice(outputDevice);
    }

    const installed = status?.installed === true;
    const nativeMode = isNativeMode(outputMode);
    const activeDeviceKnown = Boolean(audioRuntime.deviceName);

    const refreshDevices = useCallback(async () => {
        if (!installed) return;
        setDevicesLoading(true);
        setDevicesError(null);
        try {
            const list = await getDevices();
            setDevices(list);
            if (list.length === 0) setDevicesError(t(lang, 'audio.device.empty'));
        } catch (error) {
            setDevices([]);
            setDevicesError((error as Error).message || t(lang, 'audio.device.error'));
        } finally {
            setDevicesLoading(false);
        }
    }, [getDevices, installed, lang]);

    useEffect(() => {
        if (!installed) return;
        const timer = window.setTimeout(() => {
            void refreshDevices();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [installed, refreshDevices]);

    const selectMode = (value: string) => {
        if (value !== 'html_audio' && value !== 'wasapi_shared' && value !== 'wasapi_exclusive') return;
        const nextMode = value as OutputMode;
        if (nextMode === outputMode) return;
        setPendingMode(nextMode);
        setConfirmModeOpen(true);
    };

    const pendingModeLabel = pendingMode
        ? t(lang, pendingMode === 'html_audio'
            ? 'audio.outputMode.htmlAudio'
            : pendingMode === 'wasapi_shared'
                ? 'audio.outputMode.wasapiShared'
                : 'audio.outputMode.wasapiExclusive')
        : '';

    const handleApplyDevice = () => {
        setOutputDevice(selectedDevice);
        setAppliedFeedback(true);
        window.setTimeout(() => setAppliedFeedback(false), 1800);
    };

    const handleTestDevice = async () => {
        if (testTimerRef.current !== null) {
            window.clearTimeout(testTimerRef.current);
            testTimerRef.current = null;
        }
        setTestingDevice(true);
        setTestError(null);
        try {
            const res = await testDevice(selectedDevice);
            setTestResult(res);
            testTimerRef.current = window.setTimeout(() => {
                setTestResult(null);
                testTimerRef.current = null;
            }, 5000);
        } catch (err) {
            setTestResult(null);
            setTestError((err as Error).message || t(lang, 'audio.device.error'));
            testTimerRef.current = window.setTimeout(() => {
                setTestError(null);
                testTimerRef.current = null;
            }, 5000);
        } finally {
            setTestingDevice(false);
        }
    };

    const deviceOptions: [string, string, boolean?][] = [
        ['', t(lang, 'audio.device.default')],
        ...(devicesLoading
            ? [['__loading__', t(lang, 'audio.device.refreshing'), true] as [string, string, boolean]]
            : []),
        ...(activeDeviceKnown && selectedDevice && !devices.some((device) => device.id === selectedDevice)
            ? [[selectedDevice, `${audioRuntime.deviceName} (${t(lang, 'audio.device.active')})`]] as [string, string][]
            : []),
        ...devices.map((device) => [
            device.id,
            `${device.name}${device.isDefault ? ` (${t(lang, 'audio.device.default')})` : ''}`,
        ] as [string, string]),
    ];

    return (
        <div className="space-y-5">
            <ConfirmDialog
                lang={lang}
                open={confirmModeOpen}
                title={t(lang, 'audio.outputMode.changeTitle', {mode: pendingModeLabel})}
                message={t(lang, 'audio.outputMode.changeMessage', {mode: pendingModeLabel})}
                confirmLabel={t(lang, 'audio.outputMode.changeConfirm')}
                cancelLabel={t(lang, 'confirm.defaultCancel')}
                accentColor={accentColor}
                onConfirm={() => {
                    if (pendingMode) {
                        // Clear the current player before switching engines so
                        // no HTML/native stream survives the mode change.
                        onResetPlayer();
                        setOutputMode(pendingMode);
                    }
                    setPendingMode(null);
                    setConfirmModeOpen(false);
                }}
                onCancel={() => {
                    setPendingMode(null);
                    setConfirmModeOpen(false);
                }}
            />

            <SettingGroup title={t(lang, 'audio.group.mode')}>
                <SettingRow title={t(lang, 'audio.outputMode.title')} description={t(lang, 'audio.outputMode.desc')}>
                    <SelectStub
                        ariaLabel={t(lang, 'audio.outputMode.title')}
                        options={[
                            ['html_audio', t(lang, 'audio.outputMode.htmlAudio')],
                            ['wasapi_shared', t(lang, 'audio.outputMode.wasapiShared'), !installed],
                            ['wasapi_exclusive', t(lang, 'audio.outputMode.wasapiExclusive'), !installed],
                        ]}
                        value={outputMode}
                        onChange={selectMode}
                        accent={accent}
                        accentColor={accentColor}
                    />
                </SettingRow>
                <div className="px-4 py-3.5 border-b border-zinc-800/40 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="text-sm font-medium text-zinc-100">{t(lang, 'audio.outputDevice.title')}</div>
                        {testingDevice && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 animate-pulse">
                                <svg className="animate-spin h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>{t(lang, 'audio.device.testing')}</span>
                            </div>
                        )}
                        {!testingDevice && testResult && (
                            <div
                                title={testResult.message + (testResult.supportedSampleRates?.length ? ` [${testResult.supportedSampleRates.join(', ')} Hz]` : '')}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                                    testResult.supportedExclusive
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : testResult.supportedShared
                                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                    testResult.supportedExclusive
                                        ? 'bg-emerald-400'
                                        : testResult.supportedShared
                                            ? 'bg-amber-400'
                                            : 'bg-rose-400'
                                }`} />
                                <span>
                                    {testResult.exclusiveNotAllowed
                                        ? `${testResult.deviceName ? `${testResult.deviceName}: ` : ''}${t(lang, 'audio.device.testedExclusiveDisabled')}`
                                        : testResult.supportedExclusive
                                            ? `${testResult.deviceName ? `${testResult.deviceName}: ` : ''}${t(lang, 'audio.device.testedExclusiveAndShared')}${testResult.supportedSampleRates && testResult.supportedSampleRates.length > 0 ? ` (${testResult.supportedSampleRates[0] / 1000} - ${testResult.supportedSampleRates[testResult.supportedSampleRates.length - 1] / 1000} kHz)` : ''}`
                                            : testResult.supportedShared
                                                ? `${testResult.deviceName ? `${testResult.deviceName}: ` : ''}${t(lang, 'audio.device.testedSharedOnly')}`
                                                : `${testResult.deviceName ? `${testResult.deviceName}: ` : ''}${t(lang, 'audio.device.testedUnsupported')}`}
                                </span>
                            </div>
                        )}
                        {!testingDevice && !testResult && testError && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                <span>{testError}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{nativeMode ? t(lang, 'audio.outputDevice.desc') : t(lang, 'audio.outputMode.deviceIgnored')}</p>

                    <div className="mt-3 space-y-3">
                        <SelectStub
                            ariaLabel={t(lang, 'audio.outputDevice.title')}
                            options={deviceOptions}
                            value={selectedDevice || ''}
                            onChange={(val) => {
                                setSelectedDevice(val || null);
                                if (testTimerRef.current !== null) {
                                    window.clearTimeout(testTimerRef.current);
                                    testTimerRef.current = null;
                                }
                                setTestResult(null);
                                setTestError(null);
                            }}
                            disabled={!installed}
                            accent={accent}
                            accentColor={accentColor}
                            fullWidth
                        />
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={handleApplyDevice}
                                disabled={!installed || !nativeMode || devicesLoading}
                                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150 shadow-sm cursor-pointer active:scale-[0.98] ${
                                    appliedFeedback
                                        ? 'bg-emerald-600 hover:bg-emerald-500'
                                        : `${accent.bg500} hover:brightness-110`
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                                {appliedFeedback ? t(lang, 'audio.device.applied') : t(lang, 'audio.device.apply')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void refreshDevices()}
                                disabled={!installed || devicesLoading}
                                className="px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/80 text-xs font-medium text-zinc-300 transition-all duration-150 hover:bg-zinc-700/70 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer active:scale-[0.98]"
                            >
                                {devicesLoading ? t(lang, 'audio.device.refreshing') : t(lang, 'audio.device.refresh')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleTestDevice()}
                                disabled={testingDevice}
                                className="px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/80 text-xs font-medium text-zinc-300 transition-all duration-150 hover:bg-zinc-700/70 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer active:scale-[0.98] flex items-center gap-1.5"
                            >
                                {testingDevice ? (
                                    <>
                                        <svg className="animate-spin h-3.5 w-3.5 text-zinc-300" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>{t(lang, 'audio.device.testing')}</span>
                                    </>
                                ) : (
                                    t(lang, 'audio.device.testWasapi')
                                )}
                            </button>
                        </div>
                    </div>
                </div>
                <SettingRow
                    title={t(lang, 'audio.autoFallback.title')}
                    description={t(lang, 'audio.autoFallback.desc')}
                >
                    <ToggleStub
                        checked={autoFallbackHtmlAudio}
                        onChange={(val) => setAutoFallbackHtmlAudio?.(val)}
                        disabled={!installed}
                        accent={accent}
                    />
                </SettingRow>
                {devicesError && nativeMode && !activeDeviceKnown && <div className="border-b border-zinc-800/40 px-4 py-3 text-xs text-amber-300" role="status">{devicesError}</div>}
            </SettingGroup>
        </div>
    );
}
