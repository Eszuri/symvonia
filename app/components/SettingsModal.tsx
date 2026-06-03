'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
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
                        return (
                            <motion.button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                whileHover={{ x: 2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer ${isActive
                                        ? 'bg-green-500/15 text-green-400 border border-green-500/20'
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
                        {activeSection === 'general' && <GeneralSection />}
                        {activeSection === 'sort' && <SortSection />}
                        {activeSection === 'style' && <StyleSection />}
                        {activeSection === 'about' && <AboutSection />}
                    </div>
                </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function GeneralSection() {
    return (
        <div className="space-y-6">
            <SettingRow
                title="Folder Musik"
                description="Folder tempat koleksi musik kamu disimpan"
            >
                <div className="text-xs text-zinc-500 font-mono">—</div>
            </SettingRow>
            <SettingRow
                title="Auto Wallpaper"
                description="Gunakan cover art sebagai wallpaper desktop saat lagu diputar"
            >
                <ToggleStub />
            </SettingRow>
            <SettingRow
                title="Reset Wallpaper on Close"
                description="Kembalikan wallpaper ke default saat aplikasi ditutup"
            >
                <ToggleStub checked />
            </SettingRow>
        </div>
    );
}

function SortSection() {
    return (
        <div className="space-y-6">
            <SettingRow
                title="Urutkan Folder"
                description="Susunan folder di file explorer"
            >
                <SelectStub options={['Modified Time', 'Name']} />
            </SettingRow>
            <SettingRow
                title="Urutkan File"
                description="Susunan file audio di file explorer"
            >
                <SelectStub options={['Modified Time', 'Name']} />
            </SettingRow>
            <SettingRow
                title="Arah Urutan"
                description="Naik atau turun"
            >
                <SelectStub options={['Ascending', 'Descending']} />
            </SettingRow>
        </div>
    );
}

function StyleSection() {
    return (
        <div className="space-y-6">
            <SettingRow
                title="Tema"
                description="Tampilan warna antarmuka"
            >
                <SelectStub options={['Dark (Default)', 'Light']} />
            </SettingRow>
            <SettingRow
                title="Accent Color"
                description="Warna aksen (saat ini hijau)"
            >
                <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-zinc-100 cursor-pointer" />
                    <div className="w-6 h-6 rounded-full bg-blue-500 opacity-50 cursor-pointer" />
                    <div className="w-6 h-6 rounded-full bg-purple-500 opacity-50 cursor-pointer" />
                    <div className="w-6 h-6 rounded-full bg-pink-500 opacity-50 cursor-pointer" />
                </div>
            </SettingRow>
            <SettingRow
                title="Lebar Sidebar"
                description="Drag handle di samping kanan sidebar untuk menyesuaikan"
            >
                <div className="text-xs text-zinc-500">288px (default)</div>
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

function ToggleStub({ checked = false }: { checked?: boolean }) {
    return (
        <div
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${checked ? 'bg-green-500' : 'bg-zinc-700'
                }`}
        >
            <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
            />
        </div>
    );
}

function SelectStub({ options }: { options: string[] }) {
    return (
        <div className="px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300 cursor-pointer min-w-[140px]">
            {options[0]}
        </div>
    );
}
