import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface OutlineMenuAction {
    key: string;
    label: string;
    hint?: string;
    onSelect: () => void;
}

interface OutlineBulletMenuProps {
    x: number;
    y: number;
    actions: OutlineMenuAction[];
    onClose: () => void;
    label: string;
}

// The menu of an outline bullet (right-click): opens at the pointer, arrow
// keys move, Enter picks, Escape or a click outside closes.
const OutlineBulletMenu: React.FC<OutlineBulletMenuProps> = ({
    x,
    y,
    actions,
    onClose,
    label,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ref.current
            ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
            ?.focus();
        const away = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', away, true);
        return () => document.removeEventListener('mousedown', away, true);
    }, [onClose]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const items = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]'
            ) ?? []
        );
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            items[(at + step + items.length) % items.length]?.focus();
        }
    };

    const left = Math.min(x, window.innerWidth - 240);
    const top = Math.min(y, window.innerHeight - 40 * actions.length - 16);

    return createPortal(
        <div
            ref={ref}
            role="menu"
            aria-label={label}
            data-testid="outline-bullet-menu"
            onKeyDown={onKeyDown}
            className="fixed z-[300] w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
            style={{ left: Math.max(8, left), top: Math.max(8, top) }}
        >
            {actions.map((action) => (
                <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        onClose();
                        action.onSelect();
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                >
                    <span>{action.label}</span>
                    {action.hint && (
                        <kbd className="ml-3 font-sans text-xs text-gray-500 dark:text-gray-400">
                            {action.hint}
                        </kbd>
                    )}
                </button>
            ))}
        </div>,
        document.body
    );
};

export default OutlineBulletMenu;
