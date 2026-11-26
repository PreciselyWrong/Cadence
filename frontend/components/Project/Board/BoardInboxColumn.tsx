import React, { useState } from 'react';
import { TFunction } from 'i18next';
import {
    InboxIcon,
    PlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { InboxItem } from '../../../entities/InboxItem';
import { BoardTreeSubProject } from '../../../entities/Project';
import { Task } from '../../../entities/Task';

interface BoardInboxColumnProps {
    inboxItems: InboxItem[];
    unsortedTasks: Task[];
    subProjects: BoardTreeSubProject[];
    loading: boolean;
    onClose: () => void;
    onQuickCapture: (text: string) => Promise<void>;
    onAssignTaskToProject: (task: Task, projectUid: string) => Promise<void>;
    onConvertInboxToProject: (
        item: InboxItem,
        projectUid: string
    ) => Promise<void>;
    onOpenTask: (task: Task) => void;
    onDragStartItem: (
        payload:
            | { kind: 'unsorted_task'; task: Task }
            | { kind: 'inbox_item'; item: InboxItem }
    ) => void;
    onDragEnd: () => void;
    t: TFunction;
}

const BoardInboxColumn: React.FC<BoardInboxColumnProps> = ({
    inboxItems,
    unsortedTasks,
    subProjects,
    loading,
    onClose,
    onQuickCapture,
    onAssignTaskToProject,
    onConvertInboxToProject,
    onOpenTask,
    onDragStartItem,
    onDragEnd,
    t,
}) => {
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || saving) return;
        setSaving(true);
        try {
            await onQuickCapture(trimmed);
            setText('');
        } finally {
            setSaving(false);
        }
    };

    const total = unsortedTasks.length + inboxItems.length;

    return (
        <section
            aria-label={t('projectBoard.capturesColumn', 'Captures & Inbox')}
            data-testid="board-inbox-column"
            className="flex w-72 shrink-0 flex-col rounded-xl border border-blue-200/80 bg-blue-50/40 p-2.5 dark:border-blue-900/50 dark:bg-blue-950/20"
        >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5">
                    <InboxIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
                        {t('projectBoard.capturesTitle', 'Captures')}
                    </h3>
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
                        {total}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close', 'Close')}
                    className="rounded p-1 text-gray-400 hover:bg-blue-100/70 hover:text-gray-700 dark:hover:bg-blue-900/40 dark:hover:text-gray-200"
                >
                    <XMarkIcon className="h-3.5 w-3.5" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="mb-2.5 flex gap-1">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t(
                        'projectBoard.capturePlaceholder',
                        'Quick idea…'
                    )}
                    className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-blue-900 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                    type="submit"
                    disabled={saving || !text.trim()}
                    aria-label={t('common.add', 'Add')}
                    className="rounded-lg bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                    <PlusIcon className="h-3.5 w-3.5" />
                </button>
            </form>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
                {loading && total === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">
                        {t('common.loading', 'Loading…')}
                    </p>
                )}
                {!loading && total === 0 && (
                    <p className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                        {t(
                            'projectBoard.capturesEmpty',
                            'Inbox is clear. Drag items from here into a project column.'
                        )}
                    </p>
                )}

                {unsortedTasks.map((task) => (
                    <div
                        key={`u:${task.uid}`}
                        draggable
                        onDragStart={() =>
                            onDragStartItem({ kind: 'unsorted_task', task })
                        }
                        onDragEnd={onDragEnd}
                        className="group rounded-lg border border-gray-200/90 bg-white p-2 shadow-xs hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900"
                    >
                        <button
                            type="button"
                            onClick={() => onOpenTask(task)}
                            className="block w-full text-left text-xs font-medium text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
                        >
                            {task.name}
                        </button>
                        {subProjects.length > 0 && (
                            <div className="mt-1.5">
                                <select
                                    aria-label={t(
                                        'projectBoard.moveToProject',
                                        'Move to project'
                                    )}
                                    defaultValue=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            void onAssignTaskToProject(
                                                task,
                                                e.target.value
                                            );
                                        }
                                    }}
                                    className="w-full rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                    <option value="">
                                        {t(
                                            'projectBoard.sendToSubProject',
                                            '→ Send to project…'
                                        )}
                                    </option>
                                    {subProjects.map((p) => (
                                        <option key={p.uid} value={p.uid}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                ))}

                {inboxItems.map((item) => (
                    <div
                        key={`i:${item.uid}`}
                        draggable
                        onDragStart={() =>
                            onDragStartItem({ kind: 'inbox_item', item })
                        }
                        onDragEnd={onDragEnd}
                        className="rounded-lg border border-dashed border-blue-200 bg-white/90 p-2 dark:border-blue-900/60 dark:bg-gray-900/80"
                    >
                        <p className="text-xs text-gray-800 dark:text-gray-200">
                            {item.content}
                        </p>
                        {subProjects.length > 0 && (
                            <div className="mt-1.5">
                                <select
                                    aria-label={t(
                                        'projectBoard.moveToProject',
                                        'Move to project'
                                    )}
                                    defaultValue=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            void onConvertInboxToProject(
                                                item,
                                                e.target.value
                                            );
                                        }
                                    }}
                                    className="w-full rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                    <option value="">
                                        {t(
                                            'projectBoard.sendToSubProject',
                                            '→ Send to project…'
                                        )}
                                    </option>
                                    {subProjects.map((p) => (
                                        <option key={p.uid} value={p.uid}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
};

export default BoardInboxColumn;
