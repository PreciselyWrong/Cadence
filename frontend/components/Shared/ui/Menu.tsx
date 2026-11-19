import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRightIcon } from '@heroicons/react/20/solid';

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
    /** Opens a second menu beside this item instead of running. */
    submenu?: MenuEntry[];
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

export const MENU_WIDTH = 224;
const GAP = 4;
const MARGIN = 8;
// Every panel of a menu carries this, so a click in a submenu is not taken
// for a click outside; data-portal-menu tells side panels a menu is open.
const PANEL_ATTRIBUTE = 'data-menu-panel';

type Anchor =
    | { kind: 'trigger'; el: HTMLElement | null; align: 'start' | 'end' }
    | { kind: 'point'; x: number; y: number }
    | { kind: 'item'; el: HTMLElement };

// Where a panel of `height` goes for its anchor, inside the window.
const placeFor = (anchor: Anchor, height: number) => {
    const roomY = window.innerHeight;
    const roomX = window.innerWidth;
    const clampLeft = (left: number) =>
        Math.min(Math.max(MARGIN, left), roomX - MENU_WIDTH - MARGIN);
    const clampTop = (top: number) =>
        Math.max(MARGIN, Math.min(top, roomY - height - MARGIN));
    if (anchor.kind === 'point') {
        return { top: clampTop(anchor.y), left: clampLeft(anchor.x) };
    }
    if (anchor.kind === 'item') {
        const rect = anchor.el.getBoundingClientRect();
        const right = rect.right - GAP;
        const left =
            right + MENU_WIDTH + MARGIN <= roomX
                ? right
                : rect.left - MENU_WIDTH + GAP;
        return { top: clampTop(rect.top - GAP), left: clampLeft(left) };
    }
    const rect = anchor.el?.getBoundingClientRect();
    if (!rect) return null;
    const below = rect.bottom + GAP;
    // Below, else above; a menu taller than both is pulled up so its end
    // stays on screen (it scrolls when taller than the window).
    const top =
        below + height <= roomY
            ? below
            : rect.top - GAP - height > 0
              ? rect.top - GAP - height
              : Math.max(MARGIN, roomY - height - MARGIN);
    const rawLeft =
        anchor.align === 'end' ? rect.right - MENU_WIDTH : rect.left;
    return { top, left: clampLeft(rawLeft) };
};

interface PanelProps {
    entries: MenuEntry[];
    anchor: Anchor;
    id?: string;
    testId?: string;
    /** Closes the whole menu; `refocus` gives focus back to its opener. */
    onDone: (refocus: boolean) => void;
    /** A submenu: closes only itself and gives focus back to its item. */
    onBack?: () => void;
    /** Focus the first item once placed (keyboard opening). */
    focusFirst: boolean;
}

const MenuPanel: React.FC<PanelProps> = ({
    entries,
    anchor,
    id,
    testId,
    onDone,
    onBack,
    focusFirst,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const [sub, setSub] = useState<{
        key: string;
        el: HTMLElement;
        focus: boolean;
    } | null>(null);

    const place = useCallback(() => {
        setPosition(placeFor(anchor, panelRef.current?.offsetHeight ?? 0));
        // The anchor is fixed for the panel's life.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
        place();
    }, [place]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            place();
            if (focusFirst) items()[0]?.focus();
        });
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [place]);

    const items = () =>
        Array.from(
            panelRef.current?.querySelectorAll<HTMLElement>(
                ':scope > [role^="menuitem"]:not([disabled])'
            ) ?? []
        );

    const openSub = (key: string, el: HTMLElement, focus: boolean) =>
        setSub({ key, el, focus });

    const onKeyDown = (event: React.KeyboardEvent) => {
        // A submenu handles its own keys.
        if (!panelRef.current?.contains(event.target as Node)) return;
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
            case 'ArrowRight': {
                const el = document.activeElement as HTMLElement | null;
                const key = el?.dataset.submenuKey;
                if (el && key) {
                    event.preventDefault();
                    openSub(key, el, true);
                }
                break;
            }
            case 'ArrowLeft':
                if (onBack) {
                    event.preventDefault();
                    onBack();
                }
                break;
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                if (onBack) onBack();
                else onDone(true);
                break;
            case 'Tab':
                onDone(false);
                break;
        }
    };

    const subEntries =
        sub &&
        entries.find(
            (entry): entry is MenuItem => isItem(entry) && entry.key === sub.key
        )?.submenu;

    return (
        <>
            {createPortal(
                <div
                    ref={panelRef}
                    id={id}
                    role="menu"
                    data-testid={testId}
                    {...{ [PANEL_ATTRIBUTE]: '' }}
                    data-portal-menu=""
                    onKeyDown={onKeyDown}
                    // React carries a portal's events up to the row that
                    // opened it: a press here must not start a drag there.
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                    style={{
                        top: position?.top ?? -9999,
                        left: position?.left ?? -9999,
                        width: MENU_WIDTH,
                        maxHeight: 'calc(100vh - 16px)',
                    }}
                    className="fixed z-[70] overflow-y-auto rounded-chip bg-surface p-1 shadow-lg ring-1 ring-outline-variant/70 dark:bg-surface-card"
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
                        const hasSub = !!entry.submenu;
                        const subOpen = hasSub && sub?.key === entry.key;
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
                                aria-haspopup={hasSub ? 'menu' : undefined}
                                aria-expanded={hasSub ? subOpen : undefined}
                                data-submenu-key={
                                    hasSub ? entry.key : undefined
                                }
                                disabled={entry.disabled}
                                data-testid={entry.testId}
                                onMouseEnter={(event) => {
                                    if (hasSub) {
                                        openSub(
                                            entry.key,
                                            event.currentTarget,
                                            false
                                        );
                                    } else if (sub) {
                                        setSub(null);
                                    }
                                }}
                                onClick={(event) => {
                                    if (hasSub) {
                                        openSub(
                                            entry.key,
                                            event.currentTarget,
                                            true
                                        );
                                        return;
                                    }
                                    onDone(true);
                                    entry.onSelect?.();
                                }}
                                className={`flex min-h-[32px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-body-m outline-none transition-colors duration-100 focus-visible:bg-surface-high hover:bg-surface-high disabled:opacity-40 max-sm:min-h-[44px] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 ${
                                    subOpen ? 'bg-surface-high' : ''
                                } ${
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
                                    <span aria-hidden className="text-primary">
                                        ✓
                                    </span>
                                )}
                                {entry.hint && (
                                    <kbd
                                        aria-hidden
                                        className="font-sans text-xs text-surface-on-variant"
                                    >
                                        {entry.hint}
                                    </kbd>
                                )}
                                {hasSub && (
                                    <ChevronRightIcon
                                        aria-hidden
                                        className="text-surface-on-variant"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
            {sub && subEntries && (
                <MenuPanel
                    key={sub.key}
                    entries={subEntries}
                    anchor={{ kind: 'item', el: sub.el }}
                    testId={testId ? `${testId}-${sub.key}` : undefined}
                    onDone={onDone}
                    onBack={() => {
                        const el = sub.el;
                        setSub(null);
                        el.focus();
                    }}
                    focusFirst={sub.focus}
                />
            )}
        </>
    );
};

// Closes on a press outside every panel of the menu (and its trigger).
const useOutsidePress = (
    active: boolean,
    onOutside: () => void,
    trigger?: React.RefObject<HTMLElement>
) => {
    const handler = useRef(onOutside);
    handler.current = onOutside;
    useEffect(() => {
        if (!active) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (target?.closest?.(`[${PANEL_ATTRIBUTE}]`)) return;
            if (trigger?.current?.contains(target as Node)) return;
            handler.current();
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [active, trigger]);
};

/**
 * Popup menu of the design system: arrow keys, Home/End, Escape (focus goes
 * back to the trigger), click outside, submenus (→ / ←), 44 px items on
 * touch screens. Drawn in a portal so a scrolling list never clips it.
 */
const Menu: React.FC<MenuProps> = ({
    entries,
    trigger,
    align = 'end',
    testId,
    onOpenChange,
}) => {
    const [open, setOpenState] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();

    const setOpen = useCallback(
        (value: boolean) => {
            setOpenState(value);
            onOpenChange?.(value);
        },
        [onOpenChange]
    );

    const close = useCallback(
        (refocus: boolean) => {
            setOpen(false);
            if (refocus) triggerRef.current?.focus();
        },
        [setOpen]
    );

    useOutsidePress(open, () => close(false), triggerRef);

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
            {open && (
                <MenuPanel
                    entries={entries}
                    anchor={{ kind: 'trigger', el: triggerRef.current, align }}
                    id={menuId}
                    testId={testId}
                    onDone={close}
                    focusFirst
                />
            )}
        </>
    );
};

interface ContextMenuProps {
    entries: MenuEntry[];
    x: number;
    y: number;
    onClose: () => void;
    testId?: string;
}

/**
 * The same menu opened at a point, for a right click or a long press.
 * Focus goes back to where it was when the menu closes.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
    entries,
    x,
    y,
    onClose,
    testId,
}) => {
    const opener = useRef<HTMLElement | null>(
        typeof document !== 'undefined'
            ? (document.activeElement as HTMLElement | null)
            : null
    );
    const close = useCallback(
        (refocus: boolean) => {
            onClose();
            if (refocus) opener.current?.focus?.();
        },
        [onClose]
    );
    useOutsidePress(true, () => close(false));
    return (
        <MenuPanel
            entries={entries}
            anchor={{ kind: 'point', x, y }}
            testId={testId}
            onDone={close}
            focusFirst
        />
    );
};

export default Menu;
