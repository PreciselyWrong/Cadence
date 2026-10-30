import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

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
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const close = useCallback(() => setIsOpen(false), []);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const height = popoverRef.current?.offsetHeight ?? 320;
        const width = popoverRef.current?.offsetWidth ?? 288;
        const openUpward =
            window.innerHeight - rect.bottom < height + 8 &&
            rect.top > height + 8;
        setPosition({
            top: Math.max(
                8,
                openUpward ? rect.top - height - 6 : rect.bottom + 6
            ),
            left: Math.max(
                8,
                Math.min(rect.left, window.innerWidth - width - 8)
            ),
        });
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
                        style={{ top: position.top, left: position.left }}
                        className={`fixed z-[10050] max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10 ${widthClass}`}
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
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                            selected
                                ? 'bg-indigo-50 font-medium text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100'
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
