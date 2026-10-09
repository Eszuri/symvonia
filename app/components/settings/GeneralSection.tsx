'use client';

import {useEffect, useState} from 'react';
import {motion} from 'framer-motion';
import type {KeyboardEvent} from 'react';
import {getAccent} from '../../lib/colors';
import {t, type Lang} from '../../lib/translations';
import {SelectStub, SettingGroup, SettingRow, ToggleStub} from './controls';
import {useHoverDescription} from '../../hooks/useHoverDescription';
import type {OutputMode, WallpaperFitMode} from '../../lib/storage';

export default function GeneralSection({
    lang,
    musicFolder,
    onChangeFolder,
    autoWallpaper,
    setAutoWallpaper,
    resetOnClose,
    setResetOnClose,
    setLang,
    volumeStep,
    setVolumeStep,
    volumeMode,
    setVolumeMode,
    volumeLimit,
    setVolumeLimit,
    pauseIfMuted,
    setPauseIfMuted,
    fadeAudio,
    setFadeAudio,
    fadeDuration,
    setFadeDuration,
    volume,
    defaultWallpaper,
    onPickWallpaper,
    onClearWallpaper,
    wallpaperFitMode = 'fill',
    setWallpaperFitMode,
    accentColor,
    onCheckUpdate,
    updateStatus,
    updateChecking,
    updateDownloaded,
    updateTotal,
    outputMode,
    nativeOutputActive = false,
    hideWallpaperGroup = false,
}: {
    lang: Lang;
    setLang: (v: Lang) => void;
    musicFolder: string | null;
    onChangeFolder: () => void;
    autoWallpaper: boolean;
    setAutoWallpaper: (v: boolean) => void;
    resetOnClose: boolean;
    setResetOnClose: (v: boolean) => void;
    volumeStep: number;
    setVolumeStep: (v: number) => void;
    volumeMode: string;
    setVolumeMode: (v: string) => void;
    volumeLimit: number;
    setVolumeLimit: (v: number) => void;
    pauseIfMuted: boolean;
    setPauseIfMuted: (v: boolean) => void;
    fadeAudio: boolean;
    setFadeAudio: (v: boolean) => void;
    fadeDuration: number;
    setFadeDuration: (v: number) => void;
    volume: number;
    defaultWallpaper: string | null;
    onPickWallpaper: () => void;
    onClearWallpaper: () => void;
    wallpaperFitMode?: WallpaperFitMode;
    setWallpaperFitMode?: (v: WallpaperFitMode) => void;
    accentColor: string;
    onCheckUpdate: () => void;
    updateStatus: string;
    updateChecking: boolean;
    updateDownloaded: number;
    updateTotal: number;
    outputMode?: OutputMode;
    nativeOutputActive?: boolean;
    hideWallpaperGroup?: boolean;
}) {
    const accent = getAccent(accentColor);

    const folderBtnHover = useHoverDescription(t(lang, 'status.changeFolder'));
    const wallpaperChangeBtnHover = useHoverDescription(t(lang, 'status.settingItem'));
    const wallpaperDeleteBtnHover = useHoverDescription(t(lang, 'status.settingItem'));
    return (
        <div className="space-y-5">
            <SettingGroup title={t(lang, 'general.group.app')}>
                <SettingRow
                    title={t(lang, 'general.language.title')}
                    description={t(lang, 'general.language.desc')}
                >
                    <SelectStub
                        options={[
                            ['en', t(lang, 'lang.en')],
                            ['id', t(lang, 'lang.id')],
                        ]}
                        value={lang}
                        onChange={(v) => setLang(v as Lang)}
                        accent={accent}
                        accentColor={accentColor}
                    />
                </SettingRow>
                <SettingRow
                    title={t(lang, 'general.folderMusic.title')}
                    description={t(lang, 'general.folderMusic.desc')}
                >
                    <div className="flex items-center gap-2 max-w-65">
                        {musicFolder ? (
                            <div className="text-xs text-zinc-400 font-mono truncate flex-1" title={musicFolder}>
                                {musicFolder}
                            </div>
                        ) : (
                            <div className="text-xs text-zinc-600 flex-1" />
                        )}
                        <button
                            {...folderBtnHover}
                            onClick={onChangeFolder}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 shadow-xs transition-all cursor-pointer shrink-0 active:scale-[0.98]"
                        >
                            {musicFolder ? t(lang, 'general.folderMusic.changeBtn') : t(lang, 'general.folderMusic.setBtn')}
                        </button>
                    </div>
                </SettingRow>
            </SettingGroup>

            {!hideWallpaperGroup && (
                <SettingGroup title={t(lang, 'general.group.wallpaper')}>
                    <SettingRow
                        title={t(lang, 'general.autoWallpaper.title')}
                        description={t(lang, 'general.autoWallpaper.desc')}
                    >
                        <ToggleStub checked={autoWallpaper} onChange={setAutoWallpaper} accent={accent} />
                    </SettingRow>
                    <SettingRow
                        title={t(lang, 'general.wallpaperDefault.title')}
                        description={t(lang, 'general.wallpaperDefault.desc')}
                    >
                        <div className="flex items-center gap-2 max-w-65">
                            {defaultWallpaper ? (
                                <div className="text-xs text-zinc-400 font-mono truncate flex-1" title={defaultWallpaper}>
                                    {defaultWallpaper.split('\\').pop()?.split('/').pop()}
                                </div>
                            ) : (
                                <div className="text-xs text-zinc-600 flex-1" />
                            )}
                            <button
                                {...wallpaperChangeBtnHover}
                                onClick={onPickWallpaper}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 shadow-xs transition-all cursor-pointer shrink-0 active:scale-[0.98]"
                            >
                                {defaultWallpaper ? t(lang, 'general.wallpaperDefault.changeBtn') : t(lang, 'general.wallpaperDefault.setBtn')}
                            </button>
                            {defaultWallpaper && (
                                <button
                                    {...wallpaperDeleteBtnHover}
                                    onClick={onClearWallpaper}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 shadow-xs transition-all cursor-pointer shrink-0 active:scale-[0.98]"
                                >
                                    {t(lang, 'general.wallpaperDefault.deleteBtn')}
                                </button>
                            )}
                        </div>
                    </SettingRow>
                    <SettingRow
                        title={t(lang, 'general.wallpaperFit.title')}
                        description={t(lang, 'general.wallpaperFit.desc')}
                    >
                        <SelectStub
                            value={wallpaperFitMode}
                            onChange={(v) => setWallpaperFitMode?.(v as WallpaperFitMode)}
                            options={[
                                ['fill', t(lang, 'general.wallpaperFit.fill')],
                                ['fit', t(lang, 'general.wallpaperFit.fit')],
                                ['stretch', t(lang, 'general.wallpaperFit.stretch')],
                                ['center', t(lang, 'general.wallpaperFit.center')],
                                ['tile', t(lang, 'general.wallpaperFit.tile')],
                                ['span', t(lang, 'general.wallpaperFit.span')],
                            ]}
                            accent={accent}
                        />
                    </SettingRow>
                    <SettingRow
                        title={t(lang, 'general.resetWallpaper.title')}
                        description={t(lang, 'general.resetWallpaper.desc')}
                    >
                        <div className="flex flex-col items-end gap-1">
                            <ToggleStub checked={resetOnClose} onChange={setResetOnClose} accent={accent} />
                            <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                                {defaultWallpaper ? t(lang, 'general.resetWallpaper.targetCustom') : t(lang, 'general.resetWallpaper.targetBlack')}
                            </span>
                        </div>
                    </SettingRow>
                </SettingGroup>
            )}

            <SettingGroup title={t(lang, 'general.group.volume')}>
                <SettingRow
                    title={t(lang, 'general.volumeMode.title')}
                        description={nativeOutputActive
                            ? t(lang, 'general.volumeMode.nativeDisabled')
                            : t(lang, 'general.volumeMode.desc')}
                >
                    <SelectStub
                        ariaLabel={t(lang, 'general.volumeMode.title')}
                        disabled={nativeOutputActive}
                        options={[['app', t(lang, 'general.volumeMode.app')], ['system', t(lang, 'general.volumeMode.system')]]}
                        value={volumeMode}
                        onChange={setVolumeMode}
                        accent={accent}
                        accentColor={accentColor}
                    />
                </SettingRow>
                <SettingRow
                    title={t(lang, 'general.stepVolume.title')}
                    description={t(lang, 'general.stepVolume.desc')}
                >
                    <SelectStub
                        options={[
                            ['1', '1'],
                            ['2', '2'],
                            ['3', '3'],
                            ['4', '4'],
                            ['5', '5'],
                            ['6', '6'],
                            ['7', '7'],
                            ['8', '8'],
                            ['9', '9'],
                            ['10', '10'],
                        ]}
                        value={String(volumeStep)}
                        onChange={(v) => setVolumeStep(parseInt(v, 10))}
                        accent={accent}
                        accentColor={accentColor}
                    />
                </SettingRow>
                <SettingRow
                    title={t(lang, 'general.pauseIfMuted.title')}
                    description={t(lang, 'general.pauseIfMuted.desc')}
                >
                    <SelectStub
                        options={[
                            ['true', t(lang, 'general.pauseIfMuted.on')],
                            ['false', t(lang, 'general.pauseIfMuted.off')],
                        ]}
                        value={String(pauseIfMuted)}
                        onChange={(v) => setPauseIfMuted(v === 'true')}
                        accent={accent}
                        accentColor={accentColor}
                    />
                </SettingRow>
                <SettingRow
                    title={t(lang, 'general.fadeAudio.title')}
                    description={
                        outputMode !== 'html_audio'
                            ? t(lang, 'general.fadeAudio.disabledNative')
                            : t(lang, 'general.fadeAudio.desc')
                    }
                >
                    <div className="flex flex-col items-end gap-1.5">
                        <div>
                            <SelectStub
                                ariaLabel={t(lang, 'general.fadeAudio.title')}
                                disabled={outputMode !== 'html_audio'}
                                options={[
                                    ['true', t(lang, 'general.pauseIfMuted.on')],
                                    ['false', t(lang, 'general.pauseIfMuted.off')],
                                    ]}
                                value={String(fadeAudio)}
                                onChange={(v) => setFadeAudio(v === 'true')}
                                accent={accent}
                                accentColor={accentColor}
                            />
                        </div>
                        {outputMode !== 'html_audio' && (
                            <span className="text-[10px] font-semibold text-amber-400/90 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                                🔒 {t(lang, 'general.fadeAudio.disabledNative')}
                            </span>
                        )}
                    </div>
                </SettingRow>
                {fadeAudio && outputMode === 'html_audio' && (
                    <SettingRow
                        title={t(lang, 'general.fadeDuration.title')}
                        description={t(lang, 'general.fadeDuration.desc')}
                    >
                        <SelectStub
                            options={[
                                ['200', '200 ms (0.2s)'],
                                ['300', '300 ms (0.3s)'],
                                ['500', '500 ms (0.5s)'],
                                ['800', '800 ms (0.8s)'],
                                ['1000', '1000 ms (1.0s)'],
                                ['1500', '1500 ms (1.5s)'],
                            ]}
                            value={String(fadeDuration)}
                            onChange={(v) => setFadeDuration(parseInt(v, 10))}
                            accent={accent}
                            accentColor={accentColor}
                        />
                    </SettingRow>
                )}
                {volumeMode === 'system' && (
                    <SettingRow
                        title={t(lang, 'general.volumeLimit.title')}
                        description={t(lang, 'general.volumeLimit.desc')}
                    >
                        <VolumeLimitInput
                            volumeLimit={volumeLimit}
                            setVolumeLimit={setVolumeLimit}
                            currentVolume={volume}
                            lang={lang}
                        />
                    </SettingRow>
                )}
            </SettingGroup>

            <SettingGroup title={t(lang, 'general.group.update')}>
                <SettingRow
                    title={t(lang, 'general.update.title')}
                    description={t(lang, 'general.update.desc')}
                >
                    <UpdateControl
                        lang={lang}
                        accent={accent}
                        status={updateStatus}
                        checking={updateChecking}
                        downloaded={updateDownloaded}
                        total={updateTotal}
                        onCheck={onCheckUpdate}
                    />
                </SettingRow>
            </SettingGroup>
        </div>
    );
}

function UpdateControl({
    lang,
    accent,
    status,
    checking,
    downloaded,
    total,
    onCheck,
}: {
    lang: Lang;
    accent: Record<string, string>;
    status: string;
    checking: boolean;
    downloaded: number;
    total: number;
    onCheck: () => void;
}) {
    const isDownloading = total > 0;
    const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
    const fmtMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
    const updateBtnHover = useHoverDescription(t(lang, 'status.settingItem'));
    return (
        <div className="flex flex-col items-end gap-2 min-w-65">
            {isDownloading && (
                <div className="w-full">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1 font-mono">
                        <span>{fmtMB(downloaded)} / {fmtMB(total)}</span>
                        <span>{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <motion.div
                            className={`h-full ${accent.bg500} rounded-full`}
                            initial={{width: 0}}
                            animate={{width: `${pct}%`}}
                            transition={{duration: 0.15, ease: 'linear'}}
                        />
                    </div>
                </div>
            )}
            <div className="flex items-center gap-3">
                {status && (
                    <span className="text-xs text-zinc-400 max-w-40 truncate" title={status}>
                        {status}
                    </span>
                )}
                <button
                    {...updateBtnHover}
                    onClick={onCheck}
                    disabled={checking}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 border transition-all cursor-pointer shadow-xs active:scale-[0.98] ${checking
                        ? 'bg-zinc-800/40 border-zinc-700/30 text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-800 hover:bg-zinc-700 hover:text-white border-zinc-700/60'
                        }`}
                >
                    {checking ? t(lang, 'general.update.checking') : t(lang, 'general.update.checkBtn')}
                </button>
            </div>
        </div>
    );
}

function VolumeLimitInput({
    volumeLimit,
    setVolumeLimit,
    currentVolume,
    lang,
}: {
    volumeLimit: number;
    setVolumeLimit: (v: number) => void;
    currentVolume: number;
    lang: Lang;
}) {
    const [draft, setDraft] = useState(volumeLimit.toString());
    const [saved, setSaved] = useState(volumeLimit);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setDraft(volumeLimit.toString());
            setSaved(volumeLimit);
        });
        return () => cancelAnimationFrame(frame);
    }, [volumeLimit]);

    const handleSave = () => {
        let n = parseInt(draft, 10);
        if (isNaN(n) || n < 1) n = 0;
        if (n > 100) n = 100;
        setSaved(n);
        setVolumeLimit(n);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSave();
    };

    return (
        <div className="flex items-center gap-2">
            <input
                type="number"
                min={0}
                max={100}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-16 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs text-zinc-200 outline-none focus:border-zinc-500 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-xs"
                placeholder="0"
            />
            <button
                onClick={handleSave}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700/60 shadow-xs transition-all cursor-pointer active:scale-[0.98]"
            >
                {t(lang, 'general.volumeLimit.save')}
            </button>
            {saved > 0 && (
                <span className="text-[10px] text-zinc-500">
                    {Math.round(currentVolume * 100) > saved ? t(lang, 'general.volumeLimit.over') : t(lang, 'general.volumeLimit.limit', {value: String(saved)})}
                </span>
            )}
        </div>
    );
}
