import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import Menu, { MenuEntry } from './Menu';
import { IconButton } from './Button';

export interface ListRowProps {
    /** Where a click goes; the whole row is the link. */
    to?: string;
    /** Used instead of `to` when opening is not a navigation. */
    onOpen?: () => void;
    /** An entity icon or a 6 px colour dot. */
    leading?: React.ReactNode;
    title: React.ReactNode;
    /** Second level: context in grey (area, counts, dates). */
    meta?: React.ReactNode;
    /** Right side: a non-zero count, a status word. */
    trailing?: React.ReactNode;
    /** Row actions; also opened by a right click. */
    menu?: MenuEntry[];
    selected?: boolean;
    muted?: boolean;
    testId?: string;
    menuTestId?: string;
    menuLabel?: string;
}

/**
 * A row of a list page (projects, areas, tags, people, links, notes), the
 * same two-level shape as a task line on Today: title, then context in grey.
 * A click opens; the ⋯ menu is a shortcut: it shows on hover or keyboard
 * focus, opens on a right click, and stays visible on touch screens. Every
 * action in it is also on the item's own page.
 */
const ListRow: React.FC<ListRowProps> = ({
    to,
    onOpen,
    leading,
    title,
    meta,
    trailing,
    menu,
    selected = false,
    muted = false,
    testId,
    menuTestId,
    menuLabel,
}) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuTrigger = useRef<HTMLButtonElement | null>(null);

    const body = (
        <>
            {leading && (
                <span className="flex h-6 w-5 shrink-0 items-center justify-center text-surface-on-variant">
                    {leading}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span
                    className={`block truncate text-body font-medium leading-6 ${
                        muted ? 'text-surface-on-variant' : 'text-surface-on'
                    }`}
                >
                    {title}
                </span>
                {meta && (
                    <span className="block truncate text-xs leading-4 text-surface-on-variant">
                        {meta}
                    </span>
                )}
            </span>
            {trailing && (
                <span className="shrink-0 text-body-m tabular-nums text-surface-on-variant">
                    {trailing}
                </span>
            )}
        </>
    );

    const rowClass = `flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:min-h-[44px] ${
        menu ? 'pr-10' : 'pr-3'
    }`;

    return (
        <div
            data-testid={testId}
            role="listitem"
            className={`group relative flex items-center rounded-xl transition-colors duration-150 ${
                selected ? 'bg-surface-highest' : 'hover:bg-surface-high/60'
            }`}
            onContextMenu={
                menu
                    ? (event) => {
                          event.preventDefault();
                          menuTrigger.current?.click();
                      }
                    : undefined
            }
        >
            {to ? (
                <Link to={to} className={rowClass}>
                    {body}
                </Link>
            ) : (
                <button
                    type="button"
                    onClick={onOpen}
                    className={`${rowClass} text-left`}
                >
                    {body}
                </button>
            )}
            {menu && menu.length > 0 && (
                <span
                    className={`absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-150 ${
                        menuOpen || selected
                            ? ''
                            : '[@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                    }`}
                >
                    <Menu
                        entries={menu}
                        align="end"
                        testId={menuTestId ? `${menuTestId}-menu` : undefined}
                        onOpenChange={setMenuOpen}
                        trigger={(triggerProps) => (
                            <IconButton
                                {...triggerProps}
                                ref={(node) => {
                                    menuTrigger.current = node;
                                    const forward = triggerProps.ref;
                                    if (typeof forward === 'function')
                                        forward(node);
                                    else if (forward)
                                        (
                                            forward as React.MutableRefObject<HTMLButtonElement | null>
                                        ).current = node;
                                }}
                                data-testid={menuTestId}
                                label={
                                    menuLabel ??
                                    t('common.moreActions', 'More actions')
                                }
                            >
                                <EllipsisHorizontalIcon />
                            </IconButton>
                        )}
                    />
                </span>
            )}
        </div>
    );
};

/** A quiet group label above rows (a letter, an area, a status). */
export const ListSection: React.FC<{
    label: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
}> = ({ label, action, children }) => (
    <section className="py-1">
        <div className="flex h-8 items-center gap-2 px-3">
            <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-surface-on-variant">
                {label}
            </h2>
            {action}
        </div>
        <div role="list">{children}</div>
    </section>
);

/** The colour of a project or tag: a 6 px dot, never a row background. */
export const ColorDot: React.FC<{ color?: string | null }> = ({ color }) => (
    <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            color ? '' : 'bg-outline-variant'
        }`}
        style={color ? { backgroundColor: color } : undefined}
    />
);

export default ListRow;
