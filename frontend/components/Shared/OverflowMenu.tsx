import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

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
    /** Shows a check and marks the item as a checkbox (a choice or a toggle). */
    checked?: boolean;
}

interface OverflowMenuProps {
    items: OverflowMenuItem[];
    label: string;
    align?: 'left' | 'right';
    testId?: string;
}

const ITEM_CLASS =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 min-h-[44px] sm:min-h-[32px] text-left text-body-m text-surface-on hover:bg-surface-high focus-visible:bg-surface-high outline-none';

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
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant transition-colors duration-150 hover:bg-surface-high hover:text-surface-on max-sm:h-11 max-sm:w-11"
            >
                <EllipsisHorizontalIcon className="h-4 w-4" />
            </button>
            {open && (
                <div
                    role="menu"
                    className={`absolute top-full z-50 mt-1 min-w-48 rounded-chip bg-surface p-1 shadow-lg ring-1 ring-outline-variant/70 dark:bg-surface-card ${
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
                                role={
                                    item.checked === undefined
                                        ? 'menuitem'
                                        : 'menuitemcheckbox'
                                }
                                aria-checked={item.checked}
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick?.();
                                }}
                                className={ITEM_CLASS}
                                data-testid={item.testId}
                                title={item.title}
                            >
                                {item.icon}
                                <span className="flex-1">{item.label}</span>
                                {item.checked && (
                                    <CheckIcon className="h-4 w-4 text-primary" />
                                )}
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export default OverflowMenu;
