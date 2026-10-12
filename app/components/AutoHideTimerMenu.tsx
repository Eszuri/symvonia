import {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {getAccent} from '../lib/colors';
import {t, type Lang} from '../lib/translations';
import {contentMotion} from '../lib/animations';
import {useHoverDescription} from '../hooks/useHoverDescription';
import {useHoverInfo} from '../contexts/HoverInfoContext';

interface AutoHideTimerMenuProps {
    lang: Lang;
    hideDelayMs: number;
    setHideDelayMs: (val: number) => void;
    accentColor: string;
    disabled?: boolean;
}

export default function AutoHideTimerMenu({
    lang,
    hideDelayMs,
    setHideDelayMs,
    accentColor,
    disabled = false,
}: AutoHideTimerMenuProps) {
    const accent = getAccent(accentColor);
    const {setHoverInfo} = useHoverInfo();
    const [open, setOpen] = useState(false);
    const [customValue, setCustomValue] = useState(hideDelayMs.toString());
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (disabled && open) {
            setOpen(false);
        }
    }, [disabled, open]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const options = [0, 1000, 2000, 3000, 5000, 10000];

    const applyDelay = (value: number) => {
        setCustomValue(value.toString());
        setHideDelayMs(value);
    };

    const applyCustomValue = () => {
        const val = parseInt(customValue);
        if (!isNaN(val) && (val >= 500 || val === 0)) {
            applyDelay(val);
        } else {
            setCustomValue(hideDelayMs.toString());
        }
    };

    const timerHover = useHoverDescription(disabled ? null : t(lang, 'status.timer'));

    return (
        <div className="absolute top-12 right-9 max-lg:top-4 max-lg:right-0 z-50 flex flex-col items-end gap-1.5" ref={menuRef}>
            <button
                {...timerHover}
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setOpen(!open);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/10 flex items-center gap-1.5 backdrop-blur-xl shadow-lg disabled:opacity-30 disabled:cursor-default ${disabled ? 'pointer-events-none' : ''}`}
                title={t(lang, 'contextMenu.fullScreenAlbum')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                {hideDelayMs === 0 ? t(lang, 'player.autoHideNever') : `${hideDelayMs}ms`}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        {...contentMotion}
                        className="absolute bottom-full right-0 mb-2 w-40 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1.5 flex flex-col"
                    >
                        <div className="px-2 pb-1.5 pt-0.5 border-b border-white/5 mb-1.5">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                                {t(lang, 'player.autoHideTimer')}
                            </span>
                        </div>
                        {options.map(opt => (
                            <button
                                key={opt}
                                onMouseEnter={() => setHoverInfo(
                                    t(lang, 'status.autoHideOption', {value: opt === 0 ? t(lang, 'player.autoHideNever') : `${opt}ms`})
                                )}
                                onMouseLeave={() => setHoverInfo(null)}
                                onClick={() => {
                                    applyDelay(opt);
                                    setOpen(false);
                                }}
                                className={`text-xs text-left px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-2 ${opt === hideDelayMs ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${opt === hideDelayMs ? 'opacity-100' : 'opacity-0'}`} style={{backgroundColor: accent.hex500}} />
                                {opt === 0 ? t(lang, 'player.autoHideNever') : `${opt}ms`}
                            </button>
                        ))}
                        <div className="px-2 py-2 mt-1 border-t border-white/10 flex flex-col gap-1.5">
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{t(lang, 'player.autoHideCustom')}</span>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    value={customValue}
                                    onChange={e => setCustomValue(e.target.value)}
                                    onBlur={applyCustomValue}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            applyCustomValue();
                                            setOpen(false);
                                        }
                                    }}
                                    className="w-full bg-black/50 text-xs px-2 py-1.5 rounded-md outline-none border border-transparent focus:border-(--accent) text-zinc-200 transition-colors"
                                    style={{'--accent': accent.hex500} as React.CSSProperties}
                                    min="500"
                                    step="500"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
