import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

export interface DecisionOption {
    key: string;
    label: string;
    run: () => void;
    // Asks for a date before running.
    date?: (day: string) => void;
    danger?: boolean;
}

interface DecisionMenuProps {
    options: DecisionOption[];
    disabled?: boolean;
}

// One button per row that opens the choices for it. Click or tap only, so
// it works the same on touch screens; Escape or a click outside closes it.
const DecisionMenu: React.FC<DecisionMenuProps> = ({ options, disabled }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [askingDate, setAskingDate] = useState<DecisionOption | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) {
                setOpen(false);
                setAskingDate(null);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                setAskingDate(null);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const choose = (option: DecisionOption) => {
        if (option.date) {
            setAskingDate(option);
            return;
        }
        setOpen(false);
        option.run();
    };

    return (
        <div ref={ref} className="relative flex-shrink-0">
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
                <span className="max-sm:sr-only">
                    {t('review.decide', 'Decide')}
                </span>
                <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden />
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-30 mt-1 w-56 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                >
                    {askingDate ? (
                        <div className="px-3 py-2">
                            <label className="block text-xs text-gray-500 dark:text-gray-400">
                                {askingDate.label}
                                <input
                                    type="date"
                                    autoFocus
                                    className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                    onChange={(e) => {
                                        if (!e.target.value) return;
                                        setOpen(false);
                                        setAskingDate(null);
                                        askingDate.date?.(e.target.value);
                                    }}
                                />
                            </label>
                        </div>
                    ) : (
                        options.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                role="menuitem"
                                onClick={() => choose(option)}
                                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                    option.danger
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-gray-700 dark:text-gray-200'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default DecisionMenu;
