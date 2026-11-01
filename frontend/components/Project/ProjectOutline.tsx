import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { isTaskDone } from '../../constants/taskStatus';
import { useToast } from '../Shared/ToastContext';
import {
    createTask,
    fetchSubtasks,
    toggleTaskCompletion,
    updateTask,
} from '../../utils/tasksService';

interface ProjectOutlineProps {
    // Top-level tasks in the order shown, each with its `subtasks`.
    tasks: Task[];
    projectUid: string;
    // Saves the order of the top-level tasks (uids, in their new order).
    onReorder: (orderedUids: string[]) => Promise<void> | void;
    // Reads the project's tasks again after a change.
    onReload: () => Promise<void> | void;
    readOnly?: boolean;
    // TODO.md projects: the file only takes new lines and ticks.
    structureLocked?: boolean;
}

interface Row {
    task: Task;
    depth: 0 | 1;
    parent: Task | null;
}

// A line being typed: it becomes a task on Enter. `afterUid` is the row it
// is drawn under; `anchorUid` the sibling it goes after (null: at the end).
interface Draft {
    afterUid: string | null;
    anchorUid: string | null;
    depth: 0 | 1;
    parent: Task | null;
    name: string;
}

const DRAFT = 'draft';

const bySubtaskOrder = (a: Task, b: Task) =>
    (a.order ?? -Infinity) - (b.order ?? -Infinity) ||
    (a.id ?? 0) - (b.id ?? 0);

const subtasksOf = (task: Task): Task[] =>
    [...(task.subtasks ?? [])].sort(bySubtaskOrder);

const insertAfter = (uids: string[], uid: string, anchor: string | null) => {
    const rest = uids.filter((u) => u !== uid);
    if (anchor === null) return [...rest, uid];
    const at = rest.indexOf(anchor);
    return at < 0
        ? [...rest, uid]
        : [...rest.slice(0, at + 1), uid, ...rest.slice(at + 1)];
};

// Tasks and their subtasks as one indented, keyboard-driven outline: Enter
// starts a new line, Tab and Shift+Tab set or clear the parent, Alt+Up and
// Alt+Down move a line among its siblings. One level of subtasks, as
// everywhere else in Cadence.
const ProjectOutline: React.FC<ProjectOutlineProps> = ({
    tasks,
    projectUid,
    onReorder,
    onReload,
    readOnly = false,
    structureLocked = false,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [names, setNames] = useState<Record<string, string>>({});
    const [draft, setDraft] = useState<Draft | null>(null);
    const [focusTarget, setFocusTarget] = useState<string | null>(null);
    const inputs = useRef<Record<string, HTMLInputElement | null>>({});
    const busy = useRef(false);

    const rows = useMemo<Row[]>(
        () =>
            tasks.flatMap((task) => [
                { task, depth: 0 as const, parent: null },
                ...subtasksOf(task).map((sub) => ({
                    task: sub,
                    depth: 1 as const,
                    parent: task,
                })),
            ]),
        [tasks]
    );
    const topUids = tasks.map((task) => task.uid as string);
    const canEditNames = !readOnly && !structureLocked;
    const canRestructure = !readOnly && !structureLocked;

    useEffect(() => {
        if (!focusTarget) return;
        const input = inputs.current[focusTarget];
        if (input) {
            input.focus();
            setFocusTarget(null);
        }
    }, [focusTarget, rows, draft]);

    const run = async (change: () => Promise<void>) => {
        if (busy.current) return;
        busy.current = true;
        try {
            await change();
        } catch (error) {
            showErrorToast(
                (error as Error).message ||
                    t('outline.saveError', 'Could not save that change')
            );
        } finally {
            busy.current = false;
        }
    };

    const lastOfSubtree = (top: Task) => {
        const subs = subtasksOf(top);
        return (subs.length ? subs[subs.length - 1] : top).uid as string;
    };

    const nameOf = (task: Task) => names[task.uid as string] ?? task.name;

    const saveName = (task: Task) => {
        const uid = task.uid as string;
        const next = names[uid];
        if (next === undefined) return;
        const trimmed = next.trim();
        setNames((current) => {
            const rest = { ...current };
            delete rest[uid];
            return rest;
        });
        if (!trimmed || trimmed === task.name) return;
        void run(async () => {
            await updateTask(uid, { name: trimmed });
            await onReload();
        });
    };

    const openDraftAfter = (row: Row) => {
        if (readOnly) return;
        setDraft(
            row.depth === 0
                ? {
                      afterUid: lastOfSubtree(row.task),
                      anchorUid: row.task.uid as string,
                      depth: 0,
                      parent: null,
                      name: '',
                  }
                : {
                      afterUid: row.task.uid as string,
                      anchorUid: row.task.uid as string,
                      depth: 1,
                      parent: row.parent,
                      name: '',
                  }
        );
        setFocusTarget(DRAFT);
    };

    // Puts a subtask after `anchor` among all of the parent's subtasks, as
    // the server holds them: the list sent is the whole set, so none is lost.
    const placeSubtask = async (
        parent: Task,
        uid: string,
        anchor: string | null,
        move?: -1 | 1
    ) => {
        const fresh = await fetchSubtasks(parent.uid as string);
        if (!Array.isArray(fresh)) return;
        let order = fresh.map((sub) => sub.uid as string);
        if (move) {
            const at = order.indexOf(uid);
            const to = at + move;
            if (at < 0 || to < 0 || to >= order.length) return;
            [order[at], order[to]] = [order[to], order[at]];
        } else {
            order = insertAfter(order, uid, anchor);
        }
        const idOf = new Map(fresh.map((sub) => [sub.uid, sub.id]));
        await updateTask(parent.uid as string, {
            subtasks: order.map((u) => ({ id: idOf.get(u) })) as Task[],
        });
    };

    const createFromDraft = () => {
        if (!draft) return;
        const name = draft.name.trim();
        if (!name) return;
        const current = draft;
        void run(async () => {
            const created = await createTask({
                name,
                project_uid: projectUid,
                status: 'not_started',
                completed_at: null,
                parent_task_id: current.parent?.id ?? null,
            } as unknown as Task);
            const uid = created.uid as string;
            if (current.depth === 0) {
                await onReorder(insertAfter(topUids, uid, current.anchorUid));
            } else if (current.parent) {
                await placeSubtask(current.parent, uid, current.anchorUid);
            }
            await onReload();
            // Typing goes on: the next line opens under the new task.
            setDraft({ ...current, afterUid: uid, anchorUid: uid, name: '' });
            setFocusTarget(DRAFT);
        });
    };

    const indent = (row: Row) => {
        if (row.depth !== 0 || (row.task.subtasks?.length ?? 0) > 0) return;
        const index = topUids.indexOf(row.task.uid as string);
        if (index <= 0) return;
        const parent = tasks[index - 1];
        void run(async () => {
            await updateTask(row.task.uid as string, {
                parent_task_id: parent.id,
            });
            await onReload();
            setFocusTarget(row.task.uid as string);
        });
    };

    const outdent = (row: Row) => {
        if (row.depth !== 1 || !row.parent) return;
        const uid = row.task.uid as string;
        const parentUid = row.parent.uid as string;
        void run(async () => {
            await updateTask(uid, { parent_task_id: null } as Partial<Task>);
            await onReorder(insertAfter(topUids, uid, parentUid));
            await onReload();
            setFocusTarget(uid);
        });
    };

    const move = (row: Row, step: -1 | 1) => {
        const uid = row.task.uid as string;
        if (row.depth === 1 && row.parent) {
            const parent = row.parent;
            void run(async () => {
                await placeSubtask(parent, uid, null, step);
                await onReload();
                setFocusTarget(uid);
            });
            return;
        }
        const at = topUids.indexOf(uid);
        const to = at + step;
        if (at < 0 || to < 0 || to >= topUids.length) return;
        const next = [...topUids];
        [next[at], next[to]] = [next[to], next[at]];
        void run(async () => {
            await onReorder(next);
            setFocusTarget(uid);
        });
    };

    const focusNeighbour = (uid: string, step: -1 | 1) => {
        const order = rows.flatMap((row) =>
            draft && draft.afterUid === row.task.uid
                ? [row.task.uid as string, DRAFT]
                : [row.task.uid as string]
        );
        const at = order.indexOf(uid);
        const next = order[at + step];
        if (next) inputs.current[next]?.focus();
    };

    const onRowKeyDown = (event: React.KeyboardEvent, row: Row) => {
        const uid = row.task.uid as string;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            saveName(row.task);
            openDraftAfter(row);
        } else if (event.key === 'Tab') {
            if (!canRestructure) return;
            event.preventDefault();
            if (event.shiftKey) outdent(row);
            else indent(row);
        } else if (
            event.altKey &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
            event.preventDefault();
            if (canRestructure) move(row, event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            focusNeighbour(uid, event.key === 'ArrowUp' ? -1 : 1);
        }
    };

    const dropDraft = () => {
        const back = draft?.afterUid;
        setDraft(null);
        if (back) inputs.current[back]?.focus();
    };

    const onDraftKeyDown = (event: React.KeyboardEvent) => {
        if (!draft) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            createFromDraft();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            dropDraft();
        } else if (event.key === 'Backspace' && draft.name === '') {
            event.preventDefault();
            dropDraft();
        } else if (event.key === 'Tab') {
            if (structureLocked) return;
            event.preventDefault();
            if (event.shiftKey && draft.depth === 1 && draft.parent) {
                setDraft({
                    ...draft,
                    depth: 0,
                    parent: null,
                    anchorUid: draft.parent.uid as string,
                    afterUid: lastOfSubtree(draft.parent),
                });
            } else if (!event.shiftKey && draft.depth === 0) {
                // The line joins the task it is drawn under, at the end.
                const top = tasks.find(
                    (task) => lastOfSubtree(task) === draft.afterUid
                );
                if (top) {
                    setDraft({
                        ...draft,
                        depth: 1,
                        parent: top,
                        anchorUid: null,
                    });
                }
            }
        } else if (event.key === 'ArrowUp' && draft.afterUid) {
            event.preventDefault();
            inputs.current[draft.afterUid]?.focus();
        }
    };

    const toggle = (task: Task) =>
        void run(async () => {
            await toggleTaskCompletion(task.uid as string, task);
            await onReload();
        });

    const draftLine = (key: string) =>
        draft && (
            <li
                key={key}
                role="treeitem"
                aria-level={draft.depth + 1}
                className={`flex items-center gap-2 py-1 ${draft.depth ? 'pl-7' : ''}`}
            >
                <span
                    aria-hidden="true"
                    className="h-4 w-4 flex-shrink-0 rounded border border-dashed border-gray-300 dark:border-gray-600"
                />
                <input
                    ref={(el) => {
                        inputs.current[DRAFT] = el;
                    }}
                    data-testid="outline-draft"
                    value={draft.name}
                    onChange={(e) =>
                        setDraft((d) =>
                            d ? { ...d, name: e.target.value } : d
                        )
                    }
                    onKeyDown={onDraftKeyDown}
                    onBlur={() => {
                        if (!draft.name.trim()) setDraft(null);
                    }}
                    placeholder={t('outline.newLine', 'New task')}
                    aria-label={t('outline.newLine', 'New task')}
                    className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                />
            </li>
        );

    return (
        <div data-testid="project-outline">
            <ul
                role="tree"
                aria-label={t('outline.title', 'Outline')}
                className="rounded-xl bg-white px-4 py-3 dark:bg-gray-900"
            >
                {draft && draft.afterUid === null && draftLine('draft-top')}
                {rows.map((row) => {
                    const uid = row.task.uid as string;
                    const done = isTaskDone(row.task.status);
                    return (
                        <React.Fragment key={uid}>
                            <li
                                role="treeitem"
                                aria-level={row.depth + 1}
                                className={`flex items-center gap-2 py-1 ${row.depth ? 'pl-7' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={done}
                                    disabled={readOnly}
                                    onChange={() => toggle(row.task)}
                                    aria-label={row.task.name}
                                    className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                                />
                                <input
                                    ref={(el) => {
                                        inputs.current[uid] = el;
                                    }}
                                    value={nameOf(row.task)}
                                    readOnly={!canEditNames}
                                    onChange={(e) =>
                                        setNames((current) => ({
                                            ...current,
                                            [uid]: e.target.value,
                                        }))
                                    }
                                    onBlur={() => saveName(row.task)}
                                    onKeyDown={(e) => onRowKeyDown(e, row)}
                                    aria-label={row.task.name}
                                    className={`min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none ${
                                        done
                                            ? 'text-gray-400 line-through dark:text-gray-500'
                                            : 'text-gray-900 dark:text-gray-100'
                                    }`}
                                />
                            </li>
                            {draft &&
                                draft.afterUid === uid &&
                                draftLine(`draft-${uid}`)}
                        </React.Fragment>
                    );
                })}
                {!readOnly && !draft && (
                    <li role="treeitem" aria-level={1} className="py-1">
                        <button
                            type="button"
                            data-testid="outline-add"
                            onClick={() => {
                                setDraft({
                                    afterUid: rows.length
                                        ? (rows[rows.length - 1].task
                                              .uid as string)
                                        : null,
                                    anchorUid: null,
                                    depth: 0,
                                    parent: null,
                                    name: '',
                                });
                                setFocusTarget(DRAFT);
                            }}
                            className="pl-6 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            {t('tasks.addTaskInline', '+ Add task')}
                        </button>
                    </li>
                )}
            </ul>
            {!readOnly && (
                <p className="mt-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                    {structureLocked
                        ? t('outline.hintLocked', 'Enter: new line')
                        : t(
                              'outline.hint',
                              'Enter: new line · Tab / Shift+Tab: indent · Alt+↑ / Alt+↓: move'
                          )}
                </p>
            )}
        </div>
    );
};

export default ProjectOutline;
