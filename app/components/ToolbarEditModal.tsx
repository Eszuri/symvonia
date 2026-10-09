'use client';

import React, {memo, useEffect, useCallback} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {modalContentMotion, backdropMotion} from '../lib/animations';

export interface ColumnDefinition {
    key: string;
    labelKey: string;
    descKey: string;
    required?: boolean;
    defaultWidth: number;
}

export const ALL_TOOLBAR_COLUMNS: ColumnDefinition[] = [
    {key: 'name', labelKey: 'toolbarEdit.col.name', descKey: 'toolbarEdit.col.name.desc', required: true, defaultWidth: 140},
    {key: 'artist', labelKey: 'toolbarEdit.col.artist', descKey: 'toolbarEdit.col.artist.desc', defaultWidth: 112},
    {key: 'album', labelKey: 'toolbarEdit.col.album', descKey: 'toolbarEdit.col.album.desc', defaultWidth: 112},
    {key: 'track', labelKey: 'toolbarEdit.col.track', descKey: 'toolbarEdit.col.track.desc', defaultWidth: 56},
    {key: 'year', labelKey: 'toolbarEdit.col.year', descKey: 'toolbarEdit.col.year.desc', defaultWidth: 48},
    {key: 'genre', labelKey: 'toolbarEdit.col.genre', descKey: 'toolbarEdit.col.genre.desc', defaultWidth: 80},
    {key: 'duration', labelKey: 'toolbarEdit.col.duration', descKey: 'toolbarEdit.col.duration.desc', defaultWidth: 64},
    {key: 'ext', labelKey: 'toolbarEdit.col.ext', descKey: 'toolbarEdit.col.ext.desc', defaultWidth: 48},
    {key: 'size', labelKey: 'toolbarEdit.col.size', descKey: 'toolbarEdit.col.size.desc', defaultWidth: 64},
    {key: 'mtime', labelKey: 'toolbarEdit.col.mtime', descKey: 'toolbarEdit.col.mtime.desc', defaultWidth: 120},
    {key: 'ctime', labelKey: 'toolbarEdit.col.ctime', descKey: 'toolbarEdit.col.ctime.desc', defaultWidth: 120},
];

export const DEFAULT_TOOLBAR_COLUMNS = ['name', 'artist', 'album', 'year', 'duration', 'ext', 'size', 'mtime'];

interface ToolbarEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    toolbarColumns: string[];
    setToolbarColumns: (cols: string[]) => void;
    accentColor: string;
    lang: Lang;
}

function ToolbarEditModal({
    isOpen,
    onClose,
    toolbarColumns,
    setToolbarColumns,
    accentColor,
    lang,
}: ToolbarEditModalProps) {
    const accent = getAccent(accentColor);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Ensure 'name' is always pinned as the first column
    const orderedColumns = React.useMemo(() => {
        const withoutName = toolbarColumns.filter((c) => c !== 'name');
        return ['name', ...withoutName];
    }, [toolbarColumns]);

    const toggleColumn = useCallback((key: string) => {
        if (key === 'name') return; // name is required and pinned at #1
        const exists = orderedColumns.includes(key);
        if (exists) {
            setToolbarColumns(orderedColumns.filter((c) => c !== key));
        } else {
            // Append newly enabled column to the end of the list
            setToolbarColumns([...orderedColumns, key]);
        }
    }, [orderedColumns, setToolbarColumns]);

    const moveColumnUp = useCallback((index: number) => {
        if (index <= 1) return; // index 0 is 'name' and cannot be moved; index 1 cannot go above index 0
        const next = [...orderedColumns];
        const temp = next[index];
        next[index] = next[index - 1];
        next[index - 1] = temp;
        setToolbarColumns(next);
    }, [orderedColumns, setToolbarColumns]);

    const moveColumnDown = useCallback((index: number) => {
        if (index === 0 || index >= orderedColumns.length - 1) return; // cannot move index 0 or last item down
        const next = [...orderedColumns];
        const temp = next[index];
        next[index] = next[index + 1];
        next[index + 1] = temp;
        setToolbarColumns(next);
    }, [orderedColumns, setToolbarColumns]);

    const resetToDefault = useCallback(() => {
        setToolbarColumns(DEFAULT_TOOLBAR_COLUMNS);
    }, [setToolbarColumns]);

    const activeCount = orderedColumns.length;
    const totalCount = ALL_TOOLBAR_COLUMNS.length;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        {...backdropMotion}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-pointer"
                    />

                    {/* Dialog Container */}
                    <motion.div
                        {...modalContentMotion}
                        className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl shadow-black/80 overflow-hidden"
                    >
                        {/* 1. Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/40 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl ${accent.bg10} border ${accent.border500} flex items-center justify-center ${accent.text400} shadow-xs`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <path d="M9 3v18" />
                                        <path d="M15 3v18" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-semibold text-zinc-100">
                                            {t(lang, 'toolbarEdit.title')}
                                        </h2>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${accent.bg10} ${accent.text400} border ${accent.border500} font-medium`}>
                                            {t(lang, 'toolbarEdit.visibleCount', {count: activeCount, total: totalCount})}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {t(lang, 'toolbarEdit.subtitle')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Main Content: Dual Panels (Selection on Left, Reorder on Right) */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                {/* Left Panel: Column Selection (7 columns) */}
                                <div className="lg:col-span-7 space-y-3">
                                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                                            {t(lang, 'toolbarEdit.selectSection')}
                                        </span>
                                        <span className="text-[11px] text-zinc-500 font-mono">
                                            {activeCount} / {totalCount}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {ALL_TOOLBAR_COLUMNS.map((col) => {
                                            const isChecked = col.required || orderedColumns.includes(col.key);
                                            const isLocked = col.required;

                                            return (
                                                <div
                                                    key={col.key}
                                                    onClick={() => !isLocked && toggleColumn(col.key)}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all select-none ${
                                                        isLocked
                                                            ? 'bg-zinc-850/40 border-zinc-800/80 cursor-default opacity-85'
                                                            : isChecked
                                                            ? `${accent.bg10} border-zinc-700 hover:border-zinc-500 cursor-pointer shadow-xs`
                                                            : 'bg-zinc-900/60 border-zinc-800/60 hover:bg-zinc-850/60 hover:border-zinc-700 cursor-pointer'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                        {/* Custom Checkbox */}
                                                        <div
                                                            className={`w-4.5 h-4.5 rounded-md flex items-center justify-center shrink-0 transition-colors border ${
                                                                isChecked
                                                                    ? `${accent.bg600} ${accent.border500} text-white`
                                                                    : 'bg-zinc-800/80 border-zinc-700 text-transparent'
                                                            }`}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`text-xs font-semibold truncate ${isChecked ? 'text-zinc-100' : 'text-zinc-400'}`}>
                                                                    {t(lang, col.labelKey)}
                                                                </span>
                                                                {isLocked && (
                                                                    <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-medium tracking-wide">
                                                                        {t(lang, 'toolbarEdit.required')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                                                                {t(lang, col.descKey)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Column Key Badge */}
                                                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-950/60 text-zinc-500 shrink-0 border border-zinc-800/50">
                                                        {col.key}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Right Panel: Column Reordering (5 columns) */}
                                <div className="lg:col-span-5 flex flex-col space-y-3 bg-zinc-950/50 rounded-xl border border-zinc-800/80 p-3.5">
                                    <div className="flex flex-col pb-1.5 border-b border-zinc-800/80">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                                                {t(lang, 'toolbarEdit.orderSection')}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                                                {orderedColumns.length}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-zinc-500 mt-0.5">
                                            {t(lang, 'toolbarEdit.orderDesc')}
                                        </span>
                                    </div>

                                    <div className="space-y-1.5 overflow-y-auto max-h-[380px] custom-scrollbar pr-1 relative">
                                        <AnimatePresence initial={false} mode="popLayout">
                                            {orderedColumns.map((colKey, index) => {
                                                const colDef = ALL_TOOLBAR_COLUMNS.find((c) => c.key === colKey);
                                                const isFirst = index === 0; // 'name' - pinned
                                                const canMoveUp = index > 1;
                                                const canMoveDown = index > 0 && index < orderedColumns.length - 1;

                                                return (
                                                    <motion.div
                                                        key={colKey}
                                                        layout
                                                        layoutId={`col-order-${colKey}`}
                                                        initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: 6 }}
                                                        transition={{
                                                            type: 'spring',
                                                            stiffness: 450,
                                                            damping: 32,
                                                            mass: 0.8,
                                                        }}
                                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs select-none shadow-xs ${
                                                            isFirst
                                                                ? `${accent.bg10} ${accent.border500} text-zinc-100 font-medium`
                                                                : 'bg-zinc-900/90 border-zinc-800/80 hover:border-zinc-700 text-zinc-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                            <span className={`text-[11px] font-mono font-bold w-4 text-center shrink-0 ${isFirst ? accent.text400 : 'text-zinc-500'}`}>
                                                                {index + 1}
                                                            </span>
                                                            <div className="min-w-0 truncate">
                                                                <span className="truncate font-medium">
                                                                    {colDef ? t(lang, colDef.labelKey) : colKey}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {isFirst ? (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-400 font-medium flex items-center gap-1">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                                    </svg>
                                                                    <span>{t(lang, 'toolbarEdit.pinned')}</span>
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    <motion.button
                                                                        whileTap={canMoveUp ? { scale: 0.88 } : undefined}
                                                                        type="button"
                                                                        onClick={() => moveColumnUp(index)}
                                                                        disabled={!canMoveUp}
                                                                        title={t(lang, 'toolbarEdit.moveUp')}
                                                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors cursor-pointer ${
                                                                            canMoveUp
                                                                                ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white'
                                                                                : 'bg-zinc-900/60 text-zinc-700 cursor-not-allowed opacity-40'
                                                                        }`}
                                                                    >
                                                                        ▲
                                                                    </motion.button>
                                                                    <motion.button
                                                                        whileTap={canMoveDown ? { scale: 0.88 } : undefined}
                                                                        type="button"
                                                                        onClick={() => moveColumnDown(index)}
                                                                        disabled={!canMoveDown}
                                                                        title={t(lang, 'toolbarEdit.moveDown')}
                                                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] transition-colors cursor-pointer ${
                                                                            canMoveDown
                                                                                ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white'
                                                                                : 'bg-zinc-900/60 text-zinc-700 cursor-not-allowed opacity-40'
                                                                        }`}
                                                                    >
                                                                        ▼
                                                                    </motion.button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Footer Actions */}
                        <div className="flex items-center justify-between px-6 py-3.5 bg-zinc-950/80 border-t border-zinc-800/80 shrink-0">
                            <button
                                onClick={resetToDefault}
                                className="px-3.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 transition-colors text-xs font-medium cursor-pointer border border-zinc-800"
                            >
                                {t(lang, 'toolbarEdit.reset')}
                            </button>

                            <button
                                onClick={onClose}
                                className={`px-5 py-1.5 rounded-lg ${accent.bg600} hover:brightness-110 text-white transition-all text-xs font-semibold cursor-pointer shadow-sm active:scale-95`}
                            >
                                {t(lang, 'toolbarEdit.save')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default memo(ToolbarEditModal);
