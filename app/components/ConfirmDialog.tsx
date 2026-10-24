'use client';

import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence, motion} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {modalContentMotion, backdropMotion} from '../lib/animations';

interface ConfirmDialogProps {
    lang?: Lang;
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    accentColor: string;
    loading?: boolean;
}

export default function ConfirmDialog({
    lang = 'en',
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    accentColor,
    loading = false,
}: ConfirmDialogProps) {
    const resolvedConfirm = confirmLabel ?? t(lang, 'confirm.defaultConfirm');
    const resolvedCancel = cancelLabel ?? t(lang, 'confirm.defaultCancel');
    const accent = getAccent(accentColor);
    const mouseDownOnBackdropRef = useRef<boolean>(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel, loading]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    key="confirm-backdrop"
                    {...backdropMotion}
                    onMouseDown={(e) => {
                        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
                    }}
                    onClick={(e) => {
                        if (!loading && mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
                            onCancel();
                        }
                        mouseDownOnBackdropRef.current = false;
                    }}
                    className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                >
                    <motion.div
                        key="confirm-modal"
                        {...modalContentMotion}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 p-6 max-w-md w-[90%] flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
                        <p className="text-sm text-zinc-400 leading-relaxed">{message}</p>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={onCancel}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/70 border border-zinc-700/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {resolvedCancel}
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={onConfirm}
                                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${accent.bg600} ${accent.hoverBg400} border ${accent.border500_30} cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                {resolvedConfirm}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
