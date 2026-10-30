import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TFunction } from 'i18next';
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    EllipsisHorizontalIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { Project } from '../../../entities/Project';
import { Task } from '../../../entities/Task';
import {
    ProjectSection,
    createProjectSection,
    deleteProjectSection,
    fetchProjectSections,
    renameProjectSection,
    reorderProjectSections,
} from '../../../utils/projectSectionsService';
import ConfirmDialog from '../../Shared/ConfirmDialog';
import { useToast } from '../../Shared/ToastContext';

interface ProjectBoardProps {
    project: Project;
    tasks: Task[];
    // Saves the task in its new column; rejects when the server refuses.
    onMoveTask: (task: Task, sectionUid: string | null) => Promise<void>;
    // Puts the listed tasks, in this order, into a column (null =
    // Unsectioned) and saves it; rejects when the server refuses. Without
    // it, a drop only changes the column.
    onOrderColumn?: (
        sectionUid: string | null,
        taskUids: string[]
    ) => Promise<void>;
    onOpenTask: (task: Task) => void;
    // Read-only viewers see the board without its write controls.
    readOnly?: boolean;
    t: TFunction;
}

// Cards with a position first (ascending), then the rest in their order.
const byPosition = (list: Task[]) =>
    list
        .map((task, i) => ({ task, i }))
        .sort((a, b) => {
            const pa = a.task.section_position;
            const pb = b.task.section_position;
            const na = pa === null || pa === undefined;
            const nb = pb === null || pb === undefined;
            if (na !== nb) return na ? 1 : -1;
            if (!na && !nb && pa !== pb) return (pa as number) - (pb as number);
            return a.i - b.i;
        })
        .map(({ task }) => task);

const DONE_STATUSES = new Set<unknown>([2, 'done']);

const ProjectBoard: React.FC<ProjectBoardProps> = ({
    project,
    tasks,
    onMoveTask,
    onOrderColumn,
    onOpenTask,
    readOnly = false,
    t,
}) => {
    const { showErrorToast } = useToast();
    const [sections, setSections] = useState<ProjectSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUid, setEditingUid] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [menuUid, setMenuUid] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [toDelete, setToDelete] = useState<ProjectSection | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [dropBefore, setDropBefore] = useState<string | null>(null);
    const draggingRef = useRef<Task | null>(null);
    const draggingColumnRef = useRef<string | null>(null);
    const projectUid = project.uid as string;

    useEffect(() => {
        if (!projectUid) return;
        let cancelled = false;
        setLoading(true);
        fetchProjectSections(projectUid)
            .then((list) => {
                if (!cancelled) setSections(list);
            })
            .catch(() => {
                if (!cancelled)
                    showErrorToast(
                        t('projectBoard.loadError', 'Could not load columns')
                    );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectUid]);

    const failed = () =>
        showErrorToast(t('projectBoard.saveError', 'Could not save the board'));

    const columns = useMemo(() => {
        const known = new Set(sections.map((s) => s.uid));
        const byColumn: Record<string, Task[]> = { '': [] };
        sections.forEach((s) => (byColumn[s.uid] = []));
        tasks.forEach((task) => {
            const key =
                task.section_uid && known.has(task.section_uid)
                    ? task.section_uid
                    : '';
            byColumn[key].push(task);
        });
        Object.keys(byColumn).forEach(
            (key) => (byColumn[key] = byPosition(byColumn[key]))
        );
        return byColumn;
    }, [sections, tasks]);

    const addSection = async (name: string, position?: number) => {
        try {
            const created = await createProjectSection(
                projectUid,
                name,
                position
            );
            setSections(
                await fetchProjectSections(projectUid).catch(() => [
                    ...sections,
                    created,
                ])
            );
            return created;
        } catch {
            failed();
            return null;
        }
    };

    const submitNew = async () => {
        const name = newName.trim();
        if (!name) {
            setAdding(false);
            return;
        }
        await addSection(name);
        setNewName('');
        setAdding(false);
    };

    const addBeside = async (index: number, side: 'left' | 'right') => {
        setMenuUid(null);
        const name = t('projectBoard.newColumn', 'New column');
        const created = await addSection(
            name,
            side === 'left' ? index : index + 1
        );
        if (created) {
            setEditingUid(created.uid);
            setEditName(created.name);
        }
    };

    const submitRename = async (section: ProjectSection) => {
        const name = editName.trim();
        setEditingUid(null);
        if (!name || name === section.name) return;
        setSections((prev) =>
            prev.map((s) => (s.uid === section.uid ? { ...s, name } : s))
        );
        try {
            await renameProjectSection(projectUid, section.uid, name);
        } catch {
            setSections((prev) =>
                prev.map((s) => (s.uid === section.uid ? section : s))
            );
            failed();
        }
    };

    const move = async (index: number, delta: number) => {
        setMenuUid(null);
        const target = index + delta;
        if (target < 0 || target >= sections.length) return;
        const next = [...sections];
        [next[index], next[target]] = [next[target], next[index]];
        await saveSectionOrder(next);
    };

    const saveSectionOrder = async (next: ProjectSection[]) => {
        const previous = sections;
        setSections(next);
        try {
            await reorderProjectSections(
                projectUid,
                next.map((s) => s.uid)
            );
        } catch {
            setSections(previous);
            failed();
        }
    };

    const confirmDelete = async () => {
        const section = toDelete;
        setToDelete(null);
        if (!section) return;
        try {
            await deleteProjectSection(projectUid, section.uid);
            setSections((prev) => prev.filter((s) => s.uid !== section.uid));
        } catch {
            failed();
        }
    };

    // Drops a dragged column onto another one: it takes that column's place.
    const dropColumn = async (targetUid: string | null) => {
        const draggedUid = draggingColumnRef.current;
        draggingColumnRef.current = null;
        if (!draggedUid || draggedUid === targetUid) return;
        const from = sections.findIndex((s) => s.uid === draggedUid);
        if (from < 0) return;
        const next = sections.filter((s) => s.uid !== draggedUid);
        // Dropping on Unsectioned puts the column first.
        const to = targetUid
            ? sections.findIndex((s) => s.uid === targetUid)
            : 0;
        if (to < 0) return;
        next.splice(to, 0, sections[from]);
        await saveSectionOrder(next);
    };

    // Drops the dragged card in a column, before `beforeUid` (end when null).
    const onDrop = async (
        e: React.DragEvent,
        sectionUid: string | null,
        beforeUid: string | null = null
    ) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(null);
        setDropBefore(null);
        if (draggingColumnRef.current) {
            await dropColumn(sectionUid);
            return;
        }
        const task = draggingRef.current;
        draggingRef.current = null;
        if (!task || readOnly) return;
        const sameColumn = (task.section_uid || null) === sectionUid;
        if (!onOrderColumn) {
            if (sameColumn) return;
            try {
                await onMoveTask(task, sectionUid);
            } catch {
                failed();
            }
            return;
        }
        const current = columns[sectionUid || ''] || [];
        const uids = current
            .map((item) => item.uid as string)
            .filter((uid) => uid && uid !== task.uid);
        const at = beforeUid ? uids.indexOf(beforeUid) : -1;
        uids.splice(at < 0 ? uids.length : at, 0, task.uid as string);
        const before = current.map((item) => item.uid);
        if (sameColumn && before.join() === uids.join()) return;
        try {
            await onOrderColumn(sectionUid, uids);
        } catch {
            failed();
        }
    };

    const renderCards = (list: Task[], sectionUid: string | null) =>
        list.length === 0 ? (
            <p className="text-xs py-3 text-center text-gray-500 dark:text-gray-400">
                {t('projectBoard.empty', 'No tasks')}
            </p>
        ) : (
            list.map((task) => (
                <div
                    key={task.uid || task.id}
                    draggable={!readOnly}
                    data-testid={`board-card-${task.uid}`}
                    onDragOver={(e) => {
                        if (readOnly || draggingColumnRef.current) return;
                        e.preventDefault();
                        if (dropBefore !== task.uid)
                            setDropBefore(task.uid || null);
                    }}
                    onDrop={(e) => onDrop(e, sectionUid, task.uid || null)}
                    onDragStart={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        draggingRef.current = task;
                        e.dataTransfer.effectAllowed = 'move';
                        try {
                            e.dataTransfer.setData(
                                'text/plain',
                                task.uid || ''
                            );
                        } catch {
                            // Some browsers refuse data on synthetic events
                        }
                    }}
                    onDragEnd={() => {
                        draggingRef.current = null;
                        setDragOver(null);
                        setDropBefore(null);
                    }}
                    onClick={() => onOpenTask(task)}
                    className={`${
                        readOnly
                            ? 'cursor-pointer'
                            : 'cursor-grab active:cursor-grabbing'
                    } ${
                        dropBefore === task.uid
                            ? 'border-t-2 border-t-blue-500'
                            : ''
                    } rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm shadow-sm hover:border-gray-300 dark:hover:border-gray-600 ${
                        DONE_STATUSES.has(task.status)
                            ? 'line-through text-gray-500 dark:text-gray-400'
                            : 'text-gray-900 dark:text-gray-100'
                    }`}
                >
                    {task.name}
                </div>
            ))
        );

    const columnShell = (
        key: string,
        sectionUid: string | null,
        header: React.ReactNode,
        list: Task[]
    ) => (
        <div
            key={key}
            data-testid={`board-column-${sectionUid || 'none'}`}
            className={`relative flex flex-col w-72 flex-shrink-0 rounded-xl border bg-gray-50 dark:bg-gray-800/60 ${
                dragOver === key
                    ? 'border-dashed border-gray-400 dark:border-gray-500'
                    : 'border-gray-200 dark:border-gray-700'
            }`}
            onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                if (dragOver !== key) setDragOver(key);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOver(null);
                    setDropBefore(null);
                }
            }}
            onDrop={(e) => onDrop(e, sectionUid)}
        >
            <div
                className={`px-3 py-2 flex items-center justify-between gap-2 ${
                    sectionUid && !readOnly ? 'cursor-move' : ''
                }`}
                data-testid={`board-column-header-${sectionUid || 'none'}`}
                draggable={Boolean(sectionUid) && !readOnly}
                onDragStart={(e) => {
                    if (!sectionUid || readOnly) return;
                    draggingColumnRef.current = sectionUid;
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                        e.dataTransfer.setData('text/plain', sectionUid);
                    } catch {
                        // Some browsers refuse data on synthetic events
                    }
                }}
                onDragEnd={() => {
                    draggingColumnRef.current = null;
                    setDragOver(null);
                }}
            >
                {header}
                <span className="text-xs text-gray-600 dark:text-gray-300">
                    {list.length}
                </span>
            </div>
            <div className="flex-1 p-2 space-y-1.5 min-h-[4rem]">
                {renderCards(list, sectionUid)}
            </div>
        </div>
    );

    if (loading) {
        return (
            <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('common.loading', 'Loading...')}
            </p>
        );
    }

    const menuItem =
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40';

    return (
        <div
            className="flex gap-3 overflow-x-auto pb-4 items-start"
            data-testid="project-board"
        >
            {columnShell(
                'none',
                null,
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    {t('projectBoard.unsectioned', 'Unsectioned')}
                </span>,
                columns['']
            )}

            {sections.map((section, index) =>
                columnShell(
                    section.uid,
                    section.uid,
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {editingUid === section.uid ? (
                            <input
                                autoFocus
                                aria-label={t(
                                    'projectBoard.columnName',
                                    'Column name'
                                )}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => submitRename(section)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter')
                                        submitRename(section);
                                    if (e.key === 'Escape') setEditingUid(null);
                                }}
                                className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-0.5 text-sm dark:text-white"
                            />
                        ) : (
                            <span
                                className="truncate text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                                onDoubleClick={() => {
                                    if (readOnly) return;
                                    setEditingUid(section.uid);
                                    setEditName(section.name);
                                }}
                            >
                                {section.name}
                            </span>
                        )}
                        {!readOnly && (
                            <div className="relative ml-auto">
                                <button
                                    type="button"
                                    aria-label={t(
                                        'projectBoard.columnActions',
                                        'Column actions'
                                    )}
                                    data-testid={`board-menu-${section.uid}`}
                                    onClick={() =>
                                        setMenuUid(
                                            menuUid === section.uid
                                                ? null
                                                : section.uid
                                        )
                                    }
                                    className="p-1 rounded text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                                >
                                    <EllipsisHorizontalIcon className="h-4 w-4" />
                                </button>
                                {menuUid === section.uid && (
                                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg">
                                        <button
                                            type="button"
                                            className={menuItem}
                                            onClick={() => {
                                                setMenuUid(null);
                                                setEditingUid(section.uid);
                                                setEditName(section.name);
                                            }}
                                        >
                                            <PencilSquareIcon className="h-4 w-4" />
                                            {t('projectBoard.rename', 'Rename')}
                                        </button>
                                        <button
                                            type="button"
                                            className={menuItem}
                                            onClick={() =>
                                                addBeside(index, 'left')
                                            }
                                        >
                                            <PlusIcon className="h-4 w-4" />
                                            {t(
                                                'projectBoard.addLeft',
                                                'Add column to the left'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className={menuItem}
                                            onClick={() =>
                                                addBeside(index, 'right')
                                            }
                                        >
                                            <PlusIcon className="h-4 w-4" />
                                            {t(
                                                'projectBoard.addRight',
                                                'Add column to the right'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className={menuItem}
                                            disabled={index === 0}
                                            onClick={() => move(index, -1)}
                                        >
                                            <ArrowLeftIcon className="h-4 w-4" />
                                            {t(
                                                'projectBoard.moveLeft',
                                                'Move left'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className={menuItem}
                                            disabled={
                                                index === sections.length - 1
                                            }
                                            onClick={() => move(index, 1)}
                                        >
                                            <ArrowRightIcon className="h-4 w-4" />
                                            {t(
                                                'projectBoard.moveRight',
                                                'Move right'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className={`${menuItem} text-red-600 dark:text-red-400`}
                                            onClick={() => {
                                                setMenuUid(null);
                                                setToDelete(section);
                                            }}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                            {t('projectBoard.delete', 'Delete')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>,
                    columns[section.uid] || []
                )
            )}

            {!readOnly && (
                <div className="w-72 flex-shrink-0">
                    {adding ? (
                        <input
                            autoFocus
                            aria-label={t(
                                'projectBoard.columnName',
                                'Column name'
                            )}
                            placeholder={t(
                                'projectBoard.columnName',
                                'Column name'
                            )}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={submitNew}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNew();
                                if (e.key === 'Escape') {
                                    setAdding(false);
                                    setNewName('');
                                }
                            }}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm dark:text-white"
                        />
                    ) : (
                        <button
                            type="button"
                            data-testid="board-add-column"
                            onClick={() => setAdding(true)}
                            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200"
                        >
                            <PlusIcon className="h-4 w-4" />
                            {t('projectBoard.addColumn', 'Add column')}
                        </button>
                    )}
                </div>
            )}

            {toDelete && (
                <ConfirmDialog
                    title={t('projectBoard.deleteTitle', 'Delete column')}
                    message={t(
                        'projectBoard.deleteMessage',
                        'Delete "{{name}}"? Its tasks move to Unsectioned.',
                        { name: toDelete.name }
                    )}
                    confirmButtonText={t('projectBoard.delete', 'Delete')}
                    onConfirm={confirmDelete}
                    onCancel={() => setToDelete(null)}
                />
            )}
        </div>
    );
};

export default ProjectBoard;
