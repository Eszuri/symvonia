'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccent } from '../lib/colors';

type SectionId = 'general' | 'sort' | 'style' | 'about';

interface SectionDef {
    id: SectionId;
    label: string;
    icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
    {
        id: 'general',
        label: 'General',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        ),
    },
    {
        id: 'sort',
        label: 'Sort',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M7 12h10M11 18h2" />
            </svg>
        ),
    },
    {
        id: 'style',
        label: 'Style',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="10.5" r="2.5" />
                <circle cx="8.5" cy="7.5" r="2.5" />
                <circle cx="6.5" cy="12.5" r="2.5" />
                <path d="M12 22a10 10 0 1 1 10-10" />
            </svg>
        ),
    },
    {
        id: 'about',
        label: 'About',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
            </svg>
        ),
    },
];

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    musicFolder: string | null;
    onChangeFolder: () => void;
    autoWallpaper: boolean;
    setAutoWallpaper: (v: boolean) => void;
    resetOnClose: boolean;
    setResetOnClose: (v: boolean) => void;
    folderSort: string;
    setFolderSort: (v: string) => void;
    fileSort: string;
    setFileSort: (v: string) => void;
    sortDir: string;
    setSortDir: (v: string) => void;
    theme: string;
    setTheme: (v: string) => void;
    accentColor: string;
    setAccentColor: (v: string) => void;
    customAccentHex: string;
    setCustomAccentHex: (v: string) => void;
    onResetSidebarWidth: () => void;
}

export default function SettingsModal({
    open,
    onClose,
    musicFolder,
    onChangeFolder,
    autoWallpaper,
    setAutoWallpaper,
    resetOnClose,
    setResetOnClose,
    folderSort,
    setFolderSort,
    fileSort,
    setFileSort,
    sortDir,
    setSortDir,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    customAccentHex,
    setCustomAccentHex,
    onResetSidebarWidth,
}: SettingsModalProps) {
    const [activeSection, setActiveSection] = useState<SectionId>('general');

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    key="modal"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 w-[min(900px,90vw)] h-[min(560px,80vh)] flex overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                {/* Sidebar nav */}
                <nav className="w-44 border-r border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-1">
                    <h3 className="px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Settings
                    </h3>
                    {SECTIONS.map((s) => {
                        const isActive = s.id === activeSection;
                        const a = getAccent(accentColor);
                        return (
                            <motion.button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                whileHover={{ x: 2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer ${isActive
                                        ? `${a.bg15} ${a.text400} border ${a.border500_20}`
                                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 border border-transparent'
                                    }`}
                            >
                                {s.icon}
                                <span>{s.label}</span>
                            </motion.button>
                        );
                    })}
                </nav>

                {/* Content */}
                <div className="flex-1 flex flex-col">
                    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                        <h2 className="text-lg font-semibold text-zinc-100">
                            {SECTIONS.find((s) => s.id === activeSection)?.label}
                        </h2>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                            aria-label="Close"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </header>
                    <div className="flex-1 overflow-y-auto p-6">
                        {activeSection === 'general' && (
                            <GeneralSection
                                musicFolder={musicFolder}
                                onChangeFolder={onChangeFolder}
                                autoWallpaper={autoWallpaper}
                                setAutoWallpaper={setAutoWallpaper}
                                resetOnClose={resetOnClose}
                                setResetOnClose={setResetOnClose}
                                accentColor={accentColor}
                            />
                        )}
                        {activeSection === 'sort' && (
                            <SortSection
                                folderSort={folderSort}
                                setFolderSort={setFolderSort}
                                fileSort={fileSort}
                                setFileSort={setFileSort}
                                sortDir={sortDir}
                                setSortDir={setSortDir}
                            />
                        )}
                        {activeSection === 'style' && (
                            <StyleSection
                                theme={theme}
                                setTheme={setTheme}
                                accentColor={accentColor}
                                setAccentColor={setAccentColor}
                                customAccentHex={customAccentHex}
                                setCustomAccentHex={setCustomAccentHex}
                                onResetSidebarWidth={onResetSidebarWidth}
                            />
                        )}
                        {activeSection === 'about' && <AboutSection />}
                    </div>
                </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function GeneralSection({
    musicFolder,
    onChangeFolder,
    autoWallpaper,
    setAutoWallpaper,
    resetOnClose,
    setResetOnClose,
    accentColor,
}: {
    musicFolder: string | null;
    onChangeFolder: () => void;
    autoWallpaper: boolean;
    setAutoWallpaper: (v: boolean) => void;
    resetOnClose: boolean;
    setResetOnClose: (v: boolean) => void;
    accentColor: string;
}) {
    const accent = getAccent(accentColor);
    return (
        <div className="space-y-6">
            <SettingRow
                title="Folder Musik"
                description="Folder tempat koleksi musik kamu disimpan"
            >
                <div className="flex items-center gap-2 max-w-[260px]">
                    <div
                        className="text-xs text-zinc-400 font-mono truncate flex-1"
                        title={musicFolder ?? ''}
                    >
                        {musicFolder ?? '—'}
                    </div>
                    <button
                        onClick={onChangeFolder}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/70 border border-zinc-700/50 transition-colors cursor-pointer shrink-0"
                    >
                        Ganti
                    </button>
                </div>
            </SettingRow>
            <SettingRow
                title="Auto Wallpaper"
                description="Gunakan cover art sebagai wallpaper desktop saat lagu diputar"
            >
                <ToggleStub checked={autoWallpaper} onChange={setAutoWallpaper} accent={accent} />
            </SettingRow>
            <SettingRow
                title="Reset Wallpaper on Close"
                description="Kembalikan wallpaper ke default saat aplikasi ditutup"
            >
                <ToggleStub checked={resetOnClose} onChange={setResetOnClose} accent={accent} />
            </SettingRow>
        </div>
    );
}

function SortSection({
    folderSort,
    setFolderSort,
    fileSort,
    setFileSort,
    sortDir,
    setSortDir,
}: {
    folderSort: string;
    setFolderSort: (v: string) => void;
    fileSort: string;
    setFileSort: (v: string) => void;
    sortDir: string;
    setSortDir: (v: string) => void;
}) {
    return (
        <div className="space-y-6">
            <SettingRow
                title="Urutkan Folder"
                description="Susunan folder di file explorer"
            >
                <SelectStub
                    options={[['mtime', 'Modified Time'], ['name', 'Name']]}
                    value={folderSort}
                    onChange={setFolderSort}
                />
            </SettingRow>
            <SettingRow
                title="Urutkan File"
                description="Susunan file audio di file explorer"
            >
                <SelectStub
                    options={[['mtime', 'Modified Time'], ['name', 'Name']]}
                    value={fileSort}
                    onChange={setFileSort}
                />
            </SettingRow>
            <SettingRow
                title="Arah Urutan"
                description="Naik atau turun"
            >
                <SelectStub
                    options={[['asc', 'Ascending'], ['desc', 'Descending']]}
                    value={sortDir}
                    onChange={setSortDir}
                />
            </SettingRow>
        </div>
    );
}

function StyleSection({
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    customAccentHex,
    setCustomAccentHex,
    onResetSidebarWidth,
}: {
    theme: string;
    setTheme: (v: string) => void;
    accentColor: string;
    setAccentColor: (v: string) => void;
    customAccentHex: string;
    setCustomAccentHex: (v: string) => void;
    onResetSidebarWidth: () => void;
}) {
    const swatches: { id: string; bg: string }[] = [
        { id: 'green', bg: 'bg-green-500' },
        { id: 'emerald', bg: 'bg-emerald-500' },
        { id: 'teal', bg: 'bg-teal-500' },
        { id: 'cyan', bg: 'bg-cyan-500' },
        { id: 'blue', bg: 'bg-blue-500' },
        { id: 'indigo', bg: 'bg-indigo-500' },
        { id: 'purple', bg: 'bg-purple-500' },
        { id: 'pink', bg: 'bg-pink-500' },
        { id: 'rose', bg: 'bg-rose-500' },
        { id: 'red', bg: 'bg-red-500' },
        { id: 'orange', bg: 'bg-orange-500' },
        { id: 'amber', bg: 'bg-amber-500' },
        { id: 'yellow', bg: 'bg-yellow-500' },
        { id: 'lime', bg: 'bg-lime-500' },
    ];
    return (
        <div className="space-y-6">
            <SettingRow
                title="Tema"
                description="Tampilan warna antarmuka"
            >
                <SelectStub
                    options={[['dark', 'Dark (Default)'], ['light', 'Light']]}
                    value={theme}
                    onChange={setTheme}
                />
            </SettingRow>
            <SettingRow
                title="Accent Color"
                description="Warna aksen aplikasi"
            >
                <div className="flex flex-wrap gap-2 max-w-[320px]">
                    {swatches.map((s) => {
                        const active = accentColor === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setAccentColor(s.id)}
                                className={`w-6 h-6 rounded-full ${s.bg} cursor-pointer transition-all ${active
                                        ? 'border-2 border-zinc-100 scale-110'
                                        : 'border-2 border-zinc-700 opacity-50 hover:opacity-80'
                                    }`}
                                aria-label={s.id}
                            />
                        );
                    })}
                    <button
                        onClick={() => setAccentColor('custom')}
                        className={`w-6 h-6 rounded-full cursor-pointer transition-all flex items-center justify-center ${accentColor === 'custom'
                                ? 'border-2 border-zinc-100 scale-110'
                                : 'border-2 border-zinc-700 opacity-50 hover:opacity-80'
                            }`}
                        style={{ background: customAccentHex }}
                        aria-label="custom"
                        title="Custom"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </button>
                </div>
                {accentColor === 'custom' && (
                    <div className="flex items-center gap-2 mt-2">
                        <input
                            type="color"
                            value={customAccentHex}
                            onChange={(e) => {
                                setCustomAccentHex(e.target.value);
                            }}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <span className="text-xs text-zinc-500 font-mono">{customAccentHex}</span>
                    </div>
                )}
            </SettingRow>
            <SettingRow
                title="Lebar Sidebar"
                description="Drag handle di samping kanan sidebar untuk menyesuaikan"
            >
                <button
                    onClick={onResetSidebarWidth}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/70 border border-zinc-700/50 transition-colors cursor-pointer"
                >
                    Reset ke default
                </button>
            </SettingRow>
        </div>
    );
}

function AboutSection() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col items-center text-center py-6">
                <div className="w-20 h-20 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mb-4">
                    <span className="text-4xl">🎵</span>
                </div>
                <h3 className="text-xl font-semibold text-zinc-100">My Music</h3>
                <p className="text-xs text-zinc-500 mt-1">Version 0.1.0</p>
            </div>
            <div className="space-y-3 text-sm text-zinc-400">
                <p>Aplikasi desktop music player yang dibangun dengan Next.js + Tauri + Rust.</p>
                <p className="text-xs text-zinc-500">
                    Audio metadata: Lofty · Image: image · File dialog: rfd
                </p>
            </div>
        </div>
    );
}

function SettingRow({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800/60 last:border-0">
            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-zinc-100">{title}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
            </div>
            <div className="shrink-0 pt-0.5">{children}</div>
        </div>
    );
}

function ToggleStub({ checked = false, onChange, accent }: { checked?: boolean; onChange?: (v: boolean) => void; accent: Record<string, string> }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange?.(!checked)}
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${checked ? accent.bg500 : 'bg-zinc-700'
                }`}
        >
            <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
            />
        </button>
    );
}

function SelectStub({
    options,
    value,
    onChange,
}: {
    options: [string, string][];
    value: string;
    onChange: (v: string) => void;
}) {
    const current = options.find(([v]) => v === value) ?? options[0];
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300 cursor-pointer min-w-[140px] outline-none hover:bg-zinc-700/70 focus:bg-zinc-700/70 transition-colors"
        >
            {options.map(([v, label]) => (
                <option key={v} value={v} className="bg-zinc-900 text-zinc-200">
                    {label}
                </option>
            ))}
        </select>
    );
}
