'use client';

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Ya',
    cancelLabel = 'Batal',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="confirm-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        key="confirm-modal"
                        initial={{ opacity: 0, scale: 0.92, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 10 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 p-6 max-w-md w-[90%] flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
                        <p className="text-sm text-zinc-400 leading-relaxed">{message}</p>
                        <div className="flex justify-end gap-2 pt-2">
                            <motion.button
                                onClick={onCancel}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/70 border border-zinc-700/50 cursor-pointer"
                            >
                                {cancelLabel}
                            </motion.button>
                            <motion.button
                                onClick={onConfirm}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-500 border border-green-500/30 cursor-pointer"
                            >
                                {confirmLabel}
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
