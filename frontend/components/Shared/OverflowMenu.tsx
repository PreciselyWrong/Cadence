import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

export interface OverflowMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    /** Internal route; renders a link. */
    to?: string;
    onClick?: () => void;
    testId?: string;
    /** Tooltip explaining the action. */
    title?: string;
}

interface OverflowMenuProps {
    items: OverflowMenuItem[];
    label: string;
    align?: 'left' | 'right';
    testId?: string;
}

const ITEM_CLASS =
    'flex w-full items-center gap-2 rounded-chip px-3 min-h-[44px] sm:min-h-[36px] text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700';

// A "more" menu for secondary toolbar actions.
const OverflowMenu: React.FC<OverflowMenuProps> = ({
    items,
    label,
    align = 'right',
    testId,
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (items.length === 0) return null;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                title={label}
                data-testid={testId}
                className="flex items-center justify-center rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:p-2 max-sm:min-h-[44px] max-sm:min-w-[44px]"
            >
                <EllipsisHorizontalIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            {open && (
                <div
                    role="menu"
                    className={`absolute top-full z-50 mt-1 min-w-48 rounded-card bg-white p-1 shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10 ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {items.map((item) =>
                        item.to ? (
                            <Link
                                key={item.key}
                                to={item.to}
                                role="menuitem"
                                onClick={() => setOpen(false)}
                                className={ITEM_CLASS}
                                data-testid={item.testId}
                                title={item.title}
                            >
                                {item.icon}
                                {item.label}
                            </Link>
                        ) : (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick?.();
                                }}
                                className={ITEM_CLASS}
                                data-testid={item.testId}
                                title={item.title}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export default OverflowMenu;
