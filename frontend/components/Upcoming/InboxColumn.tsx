import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    ChevronDoubleLeftIcon,
    InboxIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { InboxItem } from '../../entities/InboxItem';
import { Task } from '../../entities/Task';
import { DayLine, lineFromDue } from '../Today/dayModel';
import TaskCard, { cardId } from './TaskCard';
import { taskCardClass } from '../Shared/task/TaskCardBody';
import { plainPreview } from '../Shared/task/plainText';
import TriageEntry from '../Inbox/TriageEntry';

export interface InboxDragData {
    kind: 'inbox';
    uid: string;
    title: string;
}

// The pseudo-day an unsorted task card carries in its drag data: planned
// nowhere, so a drop plans it rather than moves it.
export const INBOX_CARD_DATE = 'inbox';

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

// Where an item came from, in words; nothing for one typed in Cadence
// itself ('manual', the server default).
export const inboxSourceLabel = (
    source: string | null | undefined,
    t: (key: string, fallback: string) => string
): string | null => {
    const key = source?.trim().toLowerCase();
    if (!key || key === 'manual' || key === 'web') return null;
    return t(
        `inbox.sources.${key}`,
        key.charAt(0).toUpperCase() + key.slice(1)
    );
};

const InboxCard: React.FC<{ item: InboxItem; onOpen(): void }> = ({
    item,
    onOpen,
}) => {
    const { t } = useTranslation();
    const source = inboxSourceLabel(item.source, t);
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
            className={taskCardClass(false, isDragging)}
        >
            <p className="break-words text-body-m font-medium leading-5 text-surface-on line-clamp-3">
                {plainPreview(data.title) || data.title}
            </p>
            {source && (
                <p className="mt-0.5 truncate text-xs text-surface-on-variant">
                    {source}
                </p>
            )}
        </div>
    );
};

export interface InboxColumnProps {
    items: InboxItem[];
    // Inbox › « Tâches à classer »: open tasks with no moment decided.
    tasks?: Task[];
    today: string;
    loading: boolean;
    openTaskUid?: string | null;
    // Creates a task from the typed line; false keeps the text to retry.
    onAdd(text: string): Promise<boolean>;
    onOpenTask?(line: DayLine): void;
    onToggleTask?(line: DayLine): void;
    onToggleSubtask?(subtask: Task): void;
    // An opened idea became a task waiting in « Tâches à classer ».
    onIdeaToTask?(): void;
    // A thin bar with the inbox icon and the count instead of the column.
    collapsed?: boolean;
    onCollapsedChange?(collapsed: boolean): void;
}

const AddTaskButton: React.FC<{
    name: string;
    onClick(): void;
    className: string;
}> = ({ name, onClick, className }) => {
    const { t } = useTranslation();
    const label = t('upcoming.addTaskIn', 'Add a task to {{name}}', { name });
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className={className}
        >
            <PlusIcon aria-hidden="true" className="h-4 w-4" />
        </button>
    );
};

// Loaded on the first opened idea: its panel brings the note editor along.
const InboxIdeaSheet = lazy(() => import('../Inbox/InboxIdeaSheet'));

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

const noop = () => undefined;

/**
 * The inbox, pinned at the left of the board: the unsorted tasks first, as
 * task cards (a click opens the sheet), then the open ideas (a click opens
 * the idea's decision panel). Both are dragged onto a day or a horizon to plan them.
 * Its + creates a task. Collapsed, it is a 44 px bar that expands it again.
 */
const InboxColumn: React.FC<InboxColumnProps> = ({
    items,
    tasks = [],
    today,
    loading,
    openTaskUid = null,
    onAdd,
    onOpenTask = noop,
    onToggleTask = noop,
    onToggleSubtask = noop,
    onIdeaToTask,
    collapsed = false,
    onCollapsedChange,
}) => {
    const { t } = useTranslation();
    const open = openInboxItems(items);
    const [openIdeaUid, setOpenIdeaUid] = useState<string | null>(null);
    // A decided or deleted idea leaves the store, and its panel with it.
    const openIdea = open.find((item) => item.uid === openIdeaUid) ?? null;
    const lines = tasks.map((task) => lineFromDue(task, today));
    const count = lines.length + open.length;
    const title = t('sidebar.inbox', 'Inbox');
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

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
        const added = await onAdd(content).catch(() => false);
        setSaving(false);
        // The text stays so the viewer can retry.
        if (added) setDraft('');
        else setFailed(true);
    };

    // The field is disabled while saving, which drops its focus.
    useEffect(() => {
        if (adding && !saving) inputRef.current?.focus();
    }, [adding, saving]);

    // An empty inbox stays collapsed on the board; while the viewer is
    // typing a new item the column must be open, or the field never shows.
    if (collapsed && !adding) {
        const empty = count === 0;
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
                            count,
                        }
                    )}
                    onClick={() => onCollapsedChange?.(false)}
                    className="flex w-9 flex-col items-center gap-1 rounded-lg py-2 text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary disabled:hover:bg-transparent disabled:hover:text-surface-on-variant"
                >
                    <InboxIcon aria-hidden="true" className="h-5 w-5" />
                    <span className="text-xs font-semibold tabular-nums">
                        {loading && empty ? '' : count}
                    </span>
                </button>
                <AddTaskButton
                    name={title}
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
            className="flex min-h-0 w-[260px] shrink-0 flex-col gap-2 rounded-2xl p-2"
        >
            <header className="px-2.5 py-2">
                <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-body font-semibold text-surface-on">
                        {title}
                    </h2>
                    <div className="flex shrink-0 gap-0.5">
                        <AddTaskButton
                            name={title}
                            onClick={startAdding}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary"
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
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-visible:outline-2 focus-visible:outline-primary"
                            >
                                <ChevronDoubleLeftIcon
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-surface-on-variant">
                    {t('upcoming.inboxHint', 'Drag onto a day to plan it')}
                </p>
                <div className="-ml-2.5 mt-1 flex flex-wrap gap-0.5 empty:hidden">
                    <TriageEntry />
                    {open.length > 0 && (
                        <Link
                            to="/inbox?triage=1"
                            data-testid="inbox-triage-start"
                            className="inline-flex h-7 items-center rounded-lg px-2.5 text-body-m font-medium text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                            {t('inbox.triage.start', 'Triage')}
                        </Link>
                    )}
                </div>
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
                            aria-label={t('upcoming.addTask', 'Add a task')}
                            placeholder={t('upcoming.addTask', 'Add a task')}
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
                {lines.length > 0 && (
                    <div
                        data-card-date={INBOX_CARD_DATE}
                        className="flex flex-col gap-2"
                    >
                        <SortableContext
                            items={lines.map((line) =>
                                cardId(INBOX_CARD_DATE, line.uid)
                            )}
                            strategy={verticalListSortingStrategy}
                        >
                            {lines.map((line) => (
                                <TaskCard
                                    key={line.uid}
                                    line={line}
                                    date={INBOX_CARD_DATE}
                                    selected={openTaskUid === line.uid}
                                    onToggle={onToggleTask}
                                    onOpen={onOpenTask}
                                    onToggleSubtask={onToggleSubtask}
                                />
                            ))}
                        </SortableContext>
                    </div>
                )}
                {open.map((item) => (
                    <InboxCard
                        key={item.uid}
                        item={item}
                        onOpen={() => setOpenIdeaUid(item.uid ?? null)}
                    />
                ))}
                {!loading && count === 0 && (
                    <p className="px-1 pt-2 text-body-m text-surface-on-variant">
                        {t('upcoming.inboxEmpty', 'Inbox is empty.')}
                    </p>
                )}
            </div>
            {openIdeaUid !== null && (
                <Suspense fallback={null}>
                    <InboxIdeaSheet
                        item={openIdea}
                        onClose={() => setOpenIdeaUid(null)}
                        onTaskCaptured={onIdeaToTask}
                    />
                </Suspense>
            )}
        </section>
    );
};

export default InboxColumn;
