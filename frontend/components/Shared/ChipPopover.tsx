import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CONTROL_HEIGHT } from './ui/controlSizes';

export interface ChipPopoverTriggerProps {
    ref: React.RefObject<HTMLButtonElement>;
    onClick: () => void;
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
}

interface ChipPopoverProps {
    renderTrigger: (props: ChipPopoverTriggerProps) => React.ReactNode;
    // Receives close(); call it once a choice is made
    children: (close: () => void) => React.ReactNode;
    label: string;
    // Called whenever the popover closes (choice, Esc, outside click)
    onClose?: () => void;
    widthClass?: string;
}

const FOCUSABLE =
    'input, button:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

export interface PopoverPlacement {
    top: number;
    left: number;
    // Set when the popover does not fit on either side: it scrolls instead
    maxHeight?: number;
}

// Places a popover next to its anchor, inside the viewport: below by default,
// above when only the top side has room, and capped to the room left (it
// scrolls) when neither side fits. Pure, so the rule can be tested alone.
export function placePopover(
    anchor: { top: number; bottom: number; left: number },
    size: { width: number; height: number },
    viewport: { width: number; height: number }
): PopoverPlacement {
    const spaceBelow =
        viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
    const openUpward = size.height > spaceBelow && spaceAbove > spaceBelow;
    const room = Math.max(0, openUpward ? spaceAbove : spaceBelow);
    const height = Math.min(size.height, room);
    const width = Math.min(size.width, viewport.width - 2 * VIEWPORT_MARGIN);
    const rawTop = openUpward
        ? anchor.top - ANCHOR_GAP - height
        : anchor.bottom + ANCHOR_GAP;
    return {
        top: Math.max(VIEWPORT_MARGIN, rawTop),
        left: Math.min(
            Math.max(VIEWPORT_MARGIN, anchor.left),
            viewport.width - width - VIEWPORT_MARGIN
        ),
        maxHeight: room < size.height ? room : undefined,
    };
}

// A small popover anchored to a chip. It portals to the body above the task
// panel (z-[60]) and carries data-portal-menu, so the panel knows a menu is
// open: Escape and an outside click then close the popover, not the panel.
const ChipPopover: React.FC<ChipPopoverProps> = ({
    renderTrigger,
    children,
    label,
    onClose,
    widthClass = 'w-72',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<PopoverPlacement>({
        top: 0,
        left: 0,
    });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const close = useCallback(() => setIsOpen(false), []);

    useLayoutEffect(() => {
        const popover = popoverRef.current;
        if (!isOpen || !triggerRef.current || !popover) return;
        setPosition(
            placePopover(
                triggerRef.current.getBoundingClientRect(),
                {
                    width: popover.offsetWidth,
                    // Natural height: the popover is not capped yet on open
                    height: popover.scrollHeight,
                },
                { width: window.innerWidth, height: window.innerHeight }
            )
        );
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const frame = requestAnimationFrame(() =>
            popoverRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
        );
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                popoverRef.current?.contains(target)
            ) {
                return;
            }
            setIsOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (wasOpen.current && !isOpen) {
            onCloseRef.current?.();
            triggerRef.current?.focus();
        }
        wasOpen.current = isOpen;
    }, [isOpen]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            setIsOpen(false);
        }
    };

    return (
        <>
            {renderTrigger({
                ref: triggerRef,
                onClick: () => setIsOpen((open) => !open),
                'aria-haspopup': 'dialog',
                'aria-expanded': isOpen,
            })}
            {isOpen &&
                createPortal(
                    <div
                        ref={popoverRef}
                        role="dialog"
                        aria-label={label}
                        data-portal-menu
                        onKeyDown={onKeyDown}
                        style={{
                            top: position.top,
                            left: position.left,
                            maxHeight: position.maxHeight,
                        }}
                        className={`fixed z-[10050] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10 ${widthClass}`}
                    >
                        {children(close)}
                    </div>,
                    document.body
                )}
        </>
    );
};

export interface PopoverOption<V> {
    value: V;
    label: string;
    icon?: React.ReactNode;
}

interface OptionListProps<V> {
    options: PopoverOption<V>[];
    value: V;
    onSelect: (value: V) => void;
    label: string;
}

// A keyboard list: Up and Down move between choices, Enter picks one.
export function OptionList<V extends string | number | null>({
    options,
    value,
    onSelect,
    label,
}: OptionListProps<V>) {
    const listRef = useRef<HTMLDivElement>(null);

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const items = Array.from(
            listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
                []
        );
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
            event.key === 'ArrowDown'
                ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
        items[next]?.focus();
    };

    return (
        <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            onKeyDown={onKeyDown}
            className="max-h-64 overflow-y-auto"
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => onSelect(option.value)}
                        className={`flex ${CONTROL_HEIGHT.md} w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            selected
                                ? 'bg-primary-container font-medium text-primary-on-container'
                                : 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        {option.icon}
                        <span className="min-w-0 flex-1 truncate">
                            {option.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default ChipPopover;
