import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { InboxItem } from '../../entities/InboxItem';

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
}

/**
 * The inbox, pinned at the left of the board: its cards are dragged onto a
 * day to become that day's tasks. A click opens the inbox page.
 */
const InboxColumn: React.FC<InboxColumnProps> = ({ items, loading }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const open = openInboxItems(items);
    return (
        <section
            aria-label={t('sidebar.inbox', 'Inbox')}
            data-testid="inbox-column"
            className="flex min-h-0 w-[260px] shrink-0 flex-col gap-2 rounded-2xl bg-surface-high/50 p-3"
        >
            <header className="px-1">
                <h2 className="text-title font-extrabold text-surface-on">
                    {t('sidebar.inbox', 'Inbox')}
                </h2>
                <p className="text-body-m text-surface-on-variant">
                    {t('upcoming.inboxHint', 'Drag onto a day to plan it')}
                </p>
            </header>
            <div
                role="list"
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            >
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
