'use client';

import {useEffect, useRef, useState, useCallback, useSyncExternalStore, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useHoverDescription} from '../../hooks/useHoverDescription';
import {getAccent} from '../../lib/colors';

export function SettingGroup({
    title,
    children,
}: {
    title: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="space-y-0">
            <div className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase mb-3 px-0.5">{title}</div>
            <div className="rounded-xl bg-zinc-900/60 border border-zinc-800">
                {children}
            </div>
        </div>
    );
}

export function SettingRow({
    title,
    description,
    children,
    className = ''
}: {
    title: string | ReactNode;
    description: string;
    children: ReactNode;
    className?: string
}) {
    const hoverProps = useHoverDescription(description);
    return (
        <div
            {...hoverProps}
            className={`relative flex items-start justify-between gap-4 px-4 py-3.5 border-b border-zinc-800/40 last:border-0 ${className}`}
        >
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-100">{title}</div>
                <p className="text-xs text-zinc-500 mt-0.5 break-words leading-relaxed">{description}</p>
            </div>
            <div className="shrink-0 pt-0.5">{children}</div>
        </div>
    );
}

export function ToggleStub({checked = false, onChange, accent, disabled, ariaLabel}: {checked?: boolean; onChange?: (v: boolean) => void; accent: Record<string, string>; disabled?: boolean; ariaLabel?: string}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => onChange?.(!checked)}
            className={`w-9 h-5 rounded-full relative transition-colors ${checked ? accent.bg500 : 'bg-zinc-700'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
            />
        </button>
    );
}

export function SelectStub({
    options,
    value,
    onChange,
    disabled = false,
    ariaLabel,
    accent,
    accentColor = 'sky',
    fullWidth = false,
    className = '',
}: {
    options: [string, string, boolean?][];
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
    accent?: Record<string, string>;
    accentColor?: string;
    fullWidth?: boolean;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );
    const [hoveredValue, setHoveredValue] = useState<string | null>(null);
    const [coords, setCoords] = useState<{
        left: number;
        top?: number;
        bottom?: number;
        width: number;
        openUpward: boolean;
    }>({
        left: 0,
        width: 160,
        openUpward: false,
    });

    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const activeAccent = accent || getAccent(accentColor);
    const accentBg = activeAccent.hex500 || 'var(--accent-500)';

    const selectedOption = options.find(([v]) => v === value);
    const displayLabel = selectedOption ? selectedOption[1] : (value || '');

    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();

        const targetWidth = fullWidth ? rect.width : Math.max(rect.width, 160);
        let targetLeft = rect.left;
        if (targetLeft + targetWidth > window.innerWidth - 12) {
            targetLeft = Math.max(12, rect.right - targetWidth);
        }

        const totalHeight = options.length * 36 + 12;
        const spaceBelow = window.innerHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;

        const openUpward = spaceBelow < totalHeight && spaceAbove > spaceBelow;

        if (openUpward) {
            setCoords({
                left: targetLeft,
                bottom: window.innerHeight - rect.top + 6,
                top: undefined,
                width: targetWidth,
                openUpward: true,
            });
        } else {
            setCoords({
                left: targetLeft,
                top: rect.bottom + 6,
                bottom: undefined,
                width: targetWidth,
                openUpward: false,
            });
        }
    }, [fullWidth, options.length]);

    const handleToggle = () => {
        if (disabled) return;
        if (!isOpen) {
            updatePosition();
        }
        setIsOpen((prev) => !prev);
    };

    useEffect(() => {
        if (!isOpen) return;

        updatePosition();

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            if (
                buttonRef.current && !buttonRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        const handleScrollOrResize = () => {
            updatePosition();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen, updatePosition]);

    return (
        <div className={`relative inline-block ${fullWidth ? 'w-full' : ''}`}>
            <button
                ref={buttonRef}
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={disabled}
                onClick={handleToggle}
                className={`min-h-9 px-3.5 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/80 text-xs text-zinc-200 flex items-center justify-between gap-2.5 outline-none transition-all hover:bg-zinc-700/70 hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 shadow-xs cursor-pointer ${
                    fullWidth ? 'w-full' : 'min-w-36'
                } ${className}`}
            >
                <span className="truncate font-medium text-left">{displayLabel}</span>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-zinc-400 transition-transform duration-150 ${
                        isOpen ? (coords.openUpward ? 'text-zinc-200' : 'rotate-180 text-zinc-200') : (coords.openUpward ? 'rotate-180' : '')
                    }`}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && mounted && typeof document !== 'undefined' && createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    style={{
                        position: 'fixed',
                        left: `${coords.left}px`,
                        top: coords.top !== undefined ? `${coords.top}px` : undefined,
                        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                        width: `${coords.width}px`,
                        zIndex: 99999,
                    }}
                    className="py-1 rounded-xl border border-zinc-700/80 bg-zinc-900/98 backdrop-blur-md shadow-2xl shadow-black/90 select-none overflow-hidden"
                >
                    {options.map(([optVal, optLabel, optDisabled]) => {
                        const isSelected = optVal === value;
                        const isHovered = hoveredValue === optVal;

                        return (
                            <button
                                key={optVal}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                disabled={optDisabled}
                                onMouseEnter={() => setHoveredValue(optVal)}
                                onMouseLeave={() => setHoveredValue(null)}
                                onClick={() => {
                                    if (!optDisabled) {
                                        onChange(optVal);
                                        setIsOpen(false);
                                    }
                                }}
                                style={
                                    isHovered && !optDisabled
                                        ? {
                                              backgroundColor: accentBg,
                                              color: '#ffffff',
                                          }
                                        : undefined
                                }
                                className={`w-full px-3.5 py-2 text-xs text-left flex items-center justify-between gap-3 transition-colors ${
                                    optDisabled
                                        ? 'opacity-40 cursor-not-allowed text-zinc-500'
                                        : isHovered
                                            ? 'text-white cursor-pointer'
                                            : isSelected
                                                ? 'bg-zinc-800/80 text-zinc-100'
                                                : 'text-zinc-300 hover:text-white cursor-pointer'
                                }`}
                            >
                                <span className="truncate">{optLabel}</span>
                                {isSelected && (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={`shrink-0 ${isHovered ? 'text-white' : activeAccent.text400 || 'text-sky-400'}`}
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
