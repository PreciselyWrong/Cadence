import React from 'react';
import { ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';

// Building blocks of the Goals and Habits panels of the minimal sidebar, so
// both read like the tasks panel: 34 px rows, 14 px text, the same hover,
// selection and keyboard focus.

export const PANEL_FOCUS =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500';

// A whole row; `selected` is the item whose page is open.
export const panelRowClass = (selected: boolean) =>
    `group flex h-[34px] items-center gap-[8px] rounded-[8px] px-[10px] text-[14px] transition-colors duration-150 ${
        selected
            ? 'bg-gray-200/70 dark:bg-gray-700 text-gray-900 dark:text-[oklch(90%_0.01_250)] font-medium'
            : 'text-gray-700 dark:text-[oklch(82%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

interface PanelHeaderProps {
    icon: React.ReactNode;
    title: string;
    // The overview page of the panel (Goals, Habits).
    onOpen: () => void;
    active: boolean;
    addLabel?: string;
    onAdd?: () => void;
    // One quiet line under the title, e.g. "2 of 5 done for now".
    summary?: React.ReactNode;
}

// The panel's title row: the name opens the overview page, + creates.
export const PanelHeader: React.FC<PanelHeaderProps> = ({
    icon,
    title,
    onOpen,
    active,
    addLabel,
    onAdd,
    summary,
}) => (
    <div className="mb-2">
        <div className="flex h-[34px] items-center gap-1 px-[2px]">
            <button
                type="button"
                onClick={onOpen}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full min-w-0 flex-1 items-center gap-[8px] rounded-[8px] px-[8px] text-[15px] font-semibold transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800 ${PANEL_FOCUS} ${
                    active
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-200'
                }`}
            >
                <span className="flex-shrink-0 text-gray-600 dark:text-gray-300 [&>svg]:h-[16px] [&>svg]:w-[16px]">
                    {icon}
                </span>
                <span className="truncate">{title}</span>
            </button>
            {onAdd && addLabel && (
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label={addLabel}
                    title={addLabel}
                    className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white ${PANEL_FOCUS}`}
                >
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </div>
        {summary && (
            <p className="px-[10px] text-xs text-gray-500 dark:text-gray-300">
                {summary}
            </p>
        )}
    </div>
);

interface PanelGroupProps {
    id: string;
    title: string;
    // Shown after the title in the same weight, e.g. a time range.
    detail?: string;
    count: number;
    // Foldable groups toggle from their header; the others always show.
    expanded?: boolean;
    onToggle?: () => void;
    children: React.ReactNode;
}

// A titled group of rows. The header is the same small capitals as the
// sections of the tasks panel, with the count on the right.
export const PanelGroup: React.FC<PanelGroupProps> = ({
    id,
    title,
    detail,
    count,
    expanded = true,
    onToggle,
    children,
}) => {
    const headingId = `sidebar-panel-${id}`;
    const label = (
        <>
            <span className="truncate">
                {title}
                {detail && (
                    <span className="ml-[6px] font-medium normal-case tracking-normal tabular-nums">
                        {detail}
                    </span>
                )}
            </span>
            <span className="ml-auto flex items-center gap-[6px]">
                {count > 0 && (
                    <span className="tabular-nums font-medium">{count}</span>
                )}
                {onToggle && (
                    <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${
                            expanded ? 'rotate-90' : ''
                        }`}
                    />
                )}
            </span>
        </>
    );
    const headerClass =
        'flex h-[28px] w-full items-center gap-[6px] rounded-[8px] px-[10px] text-[12px] font-semibold uppercase tracking-[0.01em] text-gray-500 dark:text-gray-300';
    return (
        <div
            role="group"
            aria-labelledby={headingId}
            className="mb-[10px] last:mb-0"
        >
            {onToggle ? (
                <button
                    type="button"
                    id={headingId}
                    onClick={onToggle}
                    aria-expanded={expanded}
                    className={`${headerClass} transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white ${PANEL_FOCUS}`}
                >
                    {label}
                </button>
            ) : (
                <div id={headingId} className={headerClass}>
                    {label}
                </div>
            )}
            {expanded && <ul className="flex flex-col gap-px">{children}</ul>}
        </div>
    );
};

interface PanelEmptyProps {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
}

// Nothing to list yet: one line and the way to make the first one.
export const PanelEmpty: React.FC<PanelEmptyProps> = ({
    title,
    actionLabel,
    onAction,
}) => (
    <div className="px-[10px] py-3">
        <p className="mb-2 text-[14px] text-gray-600 dark:text-gray-300">
            {title}
        </p>
        {onAction && actionLabel && (
            <button
                type="button"
                onClick={onAction}
                className={`inline-flex h-[32px] items-center gap-[6px] rounded-[8px] bg-gray-100 px-3 text-[13px] font-medium text-gray-900 transition-colors duration-150 hover:bg-gray-200 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 active:scale-[0.97] ${PANEL_FOCUS}`}
            >
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                {actionLabel}
            </button>
        )}
    </div>
);
