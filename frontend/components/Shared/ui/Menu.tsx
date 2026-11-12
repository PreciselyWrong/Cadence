import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    onSelect?: () => void;
    /** Keyboard shortcut shown on the right, for discovery only. */
    hint?: string;
    danger?: boolean;
    disabled?: boolean;
    /** A choice or toggle: renders as a checkbox item. */
    checked?: boolean;
    testId?: string;
}

export type MenuEntry = MenuItem | 'separator' | { heading: string };

export interface MenuTriggerProps {
    ref: React.Ref<HTMLButtonElement>;
    onClick: (event: React.MouseEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls'?: string;
}

interface MenuProps {
    entries: MenuEntry[];
    /** Renders the button that opens the menu; spread the props on it. */
    trigger: (props: MenuTriggerProps) => React.ReactNode;
    align?: 'start' | 'end';
    testId?: string;
    onOpenChange?: (open: boolean) => void;
}

const isItem = (entry: MenuEntry): entry is MenuItem =>
    typeof entry === 'object' && 'key' in entry;

const MENU_WIDTH = 224;
const GAP = 4;

/**
 * Popup menu of the design system: arrow keys, Home/End, Escape (focus goes
 * back to the trigger), click outside, 44 px items on touch screens. Drawn in
 * a portal so a scrolling list never clips it.
 */
const Menu: React.FC<MenuProps> = ({
    entries,
    trigger,
    align = 'end',
    testId,
    onOpenChange,
}) => {
    const [open, setOpenState] = useState(false);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    const setOpen = useCallback(
        (value: boolean) => {
            setOpenState(value);
            onOpenChange?.(value);
        },
        [onOpenChange]
    );

    const items = () =>
        Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
                '[role^="menuitem"]:not([disabled])'
            ) ?? []
        );

    const close = useCallback(
        (refocus: boolean) => {
            setOpen(false);
            if (refocus) triggerRef.current?.focus();
        },
        [setOpen]
    );

    const place = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const height = menuRef.current?.offsetHeight ?? 0;
        const below = rect.bottom + GAP;
        const top =
            below + height > window.innerHeight && rect.top - GAP - height > 0
                ? rect.top - GAP - height
                : below;
        const rawLeft = align === 'end' ? rect.right - MENU_WIDTH : rect.left;
        const left = Math.min(
            Math.max(8, rawLeft),
            window.innerWidth - MENU_WIDTH - 8
        );
        setPosition({ top, left });
    }, [align]);

    useEffect(() => {
        if (!open) return;
        place();
        const frame = requestAnimationFrame(() => {
            place();
            items()[0]?.focus();
        });
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                !menuRef.current?.contains(target) &&
                !triggerRef.current?.contains(target)
            ) {
                close(false);
            }
        };
        const onScroll = () => place();
        document.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('resize', onScroll);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('resize', onScroll);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open, place, close]);

    const onMenuKeyDown = (event: React.KeyboardEvent) => {
        const list = items();
        const index = list.indexOf(document.activeElement as HTMLElement);
        const focusAt = (i: number) =>
            list[(i + list.length) % list.length]?.focus();
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                focusAt(index + 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                focusAt(index - 1);
                break;
            case 'Home':
                event.preventDefault();
                focusAt(0);
                break;
            case 'End':
                event.preventDefault();
                focusAt(list.length - 1);
                break;
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                close(true);
                break;
            case 'Tab':
                close(false);
                break;
        }
    };

    const triggerProps: MenuTriggerProps = {
        ref: triggerRef,
        onClick: (event) => {
            event.stopPropagation();
            setOpen(!open);
        },
        onKeyDown: (event) => {
            if (event.key === 'ArrowDown' && !open) {
                event.preventDefault();
                setOpen(true);
            }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
    };

    return (
        <>
            {trigger(triggerProps)}
            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        data-testid={testId}
                        onKeyDown={onMenuKeyDown}
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            top: position?.top ?? -9999,
                            left: position?.left ?? -9999,
                            width: MENU_WIDTH,
                        }}
                        className="fixed z-[70] rounded-chip bg-surface p-1 shadow-lg ring-1 ring-outline-variant/70 dark:bg-surface-card"
                    >
                        {entries.map((entry, index) => {
                            if (entry === 'separator') {
                                return (
                                    <div
                                        key={`sep-${index}`}
                                        role="separator"
                                        className="my-1 h-px bg-outline-variant/60"
                                    />
                                );
                            }
                            if (!isItem(entry)) {
                                return (
                                    <div
                                        key={`h-${index}`}
                                        className="px-2.5 pb-1 pt-2 text-xs font-medium text-surface-on-variant"
                                    >
                                        {entry.heading}
                                    </div>
                                );
                            }
                            return (
                                <button
                                    key={entry.key}
                                    type="button"
                                    role={
                                        entry.checked === undefined
                                            ? 'menuitem'
                                            : 'menuitemcheckbox'
                                    }
                                    aria-checked={entry.checked}
                                    disabled={entry.disabled}
                                    data-testid={entry.testId}
                                    onClick={() => {
                                        close(true);
                                        entry.onSelect?.();
                                    }}
                                    className={`flex min-h-[32px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-body-m outline-none transition-colors duration-100 focus-visible:bg-surface-high hover:bg-surface-high disabled:opacity-40 max-sm:min-h-[44px] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 ${
                                        entry.danger
                                            ? 'text-danger'
                                            : 'text-surface-on'
                                    }`}
                                >
                                    {entry.icon}
                                    <span className="flex-1 truncate">
                                        {entry.label}
                                    </span>
                                    {entry.checked && (
                                        <span
                                            aria-hidden
                                            className="text-primary"
                                        >
                                            ✓
                                        </span>
                                    )}
                                    {entry.hint && (
                                        <kbd className="font-sans text-xs text-surface-on-variant">
                                            {entry.hint}
                                        </kbd>
                                    )}
                                </button>
                            );
                        })}
                    </div>,
                    document.body
                )}
        </>
    );
};

export default Menu;
