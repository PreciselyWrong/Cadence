import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import {
    ChevronDoubleLeftIcon,
    InboxIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { InboxItem } from '../../entities/InboxItem';
import { createInboxItemWithStore } from '../../utils/inboxService';

export interface InboxDragData {
    kind: 'inbox';
    uid: string;
    title: string;
}

// Open inbox items only: processed, deleted and trashed ones are not waiting.
export const openInboxItems = (items: InboxItem[]): InboxItem[] =>
    items.filter(
        (item) =>
            !!item.uid &&
            (item.status === undefined ||
                !['processed', 'deleted', 'trashed'].includes(item.status))
    );

// The text a card shows and a task takes as its name.
export const inboxTitle = (item: InboxItem): string =>
    (item.title || item.content || '').trim();

const InboxCard: React.FC<{ item: InboxItem; onOpen(): void }> = ({
    item,
    onOpen,
}) => {
    const data: InboxDragData = {
        kind: 'inbox',
        uid: item.uid as string,
        title: inboxTitle(item),
    };
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `inbox:${item.uid}`,
        data,
    });
    const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};
    return (
        <div
            ref={setNodeRef}
            role="listitem"
            tabIndex={0}
            data-testid="inbox-card"
            data-task-row=""
            {...attributes}
            {...dragListeners}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onOpen();
                    return;
                }
                dragKeyDown?.(event);
            }}
            className={`cursor-default rounded-xl bg-surface p-3 outline-none ring-1 ring-outline-variant/60 focus-visible:ring-2 focus-visible:ring-primary/60 ${
                isDragging ? 'opacity-60 shadow-lg' : ''
            }`}
        >
            <p className="whitespace-pre-line break-words text-body font-medium leading-5 text-surface-on line-clamp-4">
                {data.title}
            </p>
            {item.source && (
                <p className="mt-1 truncate text-xs text-surface-on-variant">
                    {item.source}
                </p>
            )}
        </div>
    );
};

export interface InboxColumnProps {
    items: InboxItem[];
    loading: boolean;
    // A thin bar with the inbox icon and the count instead of the column.
    collapsed?: boolean;
    onCollapsedChange?(collapsed: boolean): void;
}

const AddToInboxButton: React.FC<{ onClick(): void; className: string }> = ({
    onClick,
    className,
}) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            aria-label={t('upcoming.addToInbox', 'Add to inbox')}
            title={t('upcoming.addToInbox', 'Add to inbox')}
            onClick={onClick}
            className={className}
        >
            <PlusIcon aria-hidden="true" className="h-4 w-4" />
        </button>
    );
};

const COLLAPSED_KEY = 'upcoming.inboxCollapsed';

// The viewer's own choice, or null when they never chose: the inbox is then
// collapsed exactly when it is empty.
export const loadInboxCollapsed = (): boolean | null => {
    try {
        const stored = localStorage.getItem(COLLAPSED_KEY);
        return stored === null ? null : stored === '1';
    } catch {
        return null;
    }
};

export const saveInboxCollapsed = (collapsed: boolean): void => {
    try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
        // Private mode: the choice lasts until reload.
    }
};

// Empty: collapsed whatever was chosen, there is nothing to drag from it.
export const inboxCollapsed = (
    openCount: number,
    choice: boolean | null
): boolean => openCount === 0 || (choice ?? false);

/**
 * The inbox, pinned at the left of the board: its cards are dragged onto a
 * day to become that day's tasks. A click opens the inbox page. Collapsed,
 * it is a 44 px bar that expands it again.
 */
const InboxColumn: React.FC<InboxColumnProps> = ({
    items,
    loading,
    collapsed = false,
    onCollapsedChange,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const open = openInboxItems(items);
    const title = t('sidebar.inbox', 'Inbox');
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    const startAdding = () => {
        setAdding(true);
        if (collapsed) onCollapsedChange?.(false);
    };
    const stopAdding = () => {
        setAdding(false);
        setDraft('');
        setFailed(false);
    };
    const submit = async () => {
        const content = draft.trim();
        if (!content || saving) return;
        setSaving(true);
        setFailed(false);
        try {
            await createInboxItemWithStore(content);
            setDraft('');
        } catch {
            // The text stays so the viewer can retry.
            setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    // An empty inbox stays collapsed on the board; while the viewer is
    // typing a new item the column must be open, or the field never shows.
    if (collapsed && !adding) {
        const empty = open.length === 0;
        return (
            <section
                aria-label={title}
                data-testid="inbox-column"
                data-collapsed="true"
                className="flex min-h-0 w-11 shrink-0 flex-col items-center rounded-2xl bg-surface-high/50 py-2"
            >
                <button
                    type="button"
                    aria-expanded={false}
                    disabled={empty}
                    title={
                        empty
                            ? t('upcoming.inboxEmpty', 'Inbox is empty.')
                            : undefined
                    }
                    aria-label={t(
                        'upcoming.expandInbox',
                        'Show the inbox ({{count}})',
                        {
                            count: open.length,
                        }
                    )}
                    onClick={() => onCollapsedChange?.(false)}
                    className="flex w-9 flex-col items-center gap-1 rounded-lg py-2 text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary disabled:hover:bg-transparent disabled:hover:text-surface-on-variant"
                >
                    <InboxIcon aria-hidden="true" className="h-5 w-5" />
                    <span className="text-xs font-semibold tabular-nums">
                        {loading && empty ? '' : open.length}
                    </span>
                </button>
                <AddToInboxButton
                    onClick={startAdding}
                    className="mt-1 flex h-8 w-9 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary"
                />
            </section>
        );
    }
    return (
        <section
            aria-label={t('sidebar.inbox', 'Inbox')}
            data-testid="inbox-column"
            className="flex min-h-0 w-[260px] shrink-0 flex-col gap-2 rounded-2xl bg-surface-high/50 p-3"
        >
            <header className="relative px-1 pr-20">
                <h2 className="text-title font-extrabold text-surface-on">
                    {title}
                </h2>
                <div className="absolute right-0 top-0 flex gap-1">
                    <AddToInboxButton
                        onClick={startAdding}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    {onCollapsedChange && (
                        <button
                            type="button"
                            aria-expanded={true}
                            aria-label={t(
                                'upcoming.hideInbox',
                                'Collapse the inbox'
                            )}
                            onClick={() => onCollapsedChange(true)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary"
                        >
                            <ChevronDoubleLeftIcon
                                aria-hidden="true"
                                className="h-4 w-4"
                            />
                        </button>
                    )}
                </div>
                <p className="text-body-m text-surface-on-variant">
                    {t('upcoming.inboxHint', 'Drag onto a day to plan it')}
                </p>
            </header>
            <div
                role="list"
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            >
                {adding && (
                    <div className="rounded-xl bg-surface p-2 ring-1 ring-primary/60">
                        <input
                            ref={inputRef}
                            type="text"
                            aria-label={t(
                                'upcoming.inboxNewItem',
                                'New inbox item'
                            )}
                            placeholder={t(
                                'upcoming.addToInbox',
                                'Add to inbox'
                            )}
                            value={draft}
                            disabled={saving}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                setFailed(false);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void submit();
                                } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    stopAdding();
                                }
                            }}
                            onBlur={() => {
                                if (!draft.trim() && !saving) stopAdding();
                            }}
                            className="w-full bg-transparent text-body font-medium text-surface-on outline-none placeholder:text-surface-on-variant"
                        />
                        {failed && (
                            <p role="alert" className="mt-1 text-xs text-error">
                                {t(
                                    'upcoming.addToInboxFailed',
                                    'Could not add it. Try again.'
                                )}
                            </p>
                        )}
                    </div>
                )}
                {open.map((item) => (
                    <InboxCard
                        key={item.uid}
                        item={item}
                        onOpen={() => navigate('/inbox')}
                    />
                ))}
                {!loading && open.length === 0 && (
                    <p className="px-1 pt-2 text-body-m text-surface-on-variant">
                        {t('upcoming.inboxEmpty', 'Inbox is empty.')}
                    </p>
                )}
            </div>
        </section>
    );
};

export default InboxColumn;
