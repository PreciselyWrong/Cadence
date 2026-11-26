import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TFunction } from 'i18next';
import {
    AdjustmentsHorizontalIcon,
    ArrowPathIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ClockIcon,
    EyeIcon,
    FolderIcon,
    InboxIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import {
    BoardTreeSubProject,
    Project,
    ProjectStatus,
} from '../../../entities/Project';
import { InboxItem } from '../../../entities/InboxItem';
import { Task } from '../../../entities/Task';
import {
    fetchProjectBoardTree,
    updateProject,
} from '../../../utils/projectsService';
import {
    createTask,
    fetchTasks,
    toggleTaskCompletion,
    updateTask,
} from '../../../utils/tasksService';
import {
    createInboxItem,
    fetchInboxItems,
    processInboxItem,
} from '../../../utils/inboxService';
import { rescanTodoMd } from '../../../utils/todoMdService';
import { useToast } from '../../Shared/ToastContext';
import EntityIcon from '../../Shared/EntityIcon';
import { getProjectStatusTint } from '../projectStatusStyles';
import { dueDayLabel, isDueLate, localToday } from '../../Shared/task/dueLabel';
import {
    BoardPreset,
    BoardViewMode,
    CardDensity,
    PORTFOLIO_STATUS_ORDER,
    PortfolioGroupBy,
    PriorityKey,
    ProjectBoardConfig,
    TaskGroupBy,
    TaskStatusKey,
    buildPortfolioColumns,
    buildSubProjectColumns,
    buildTaskGroupColumns,
    canMoveTaskBetweenProjects,
    priorityKeyToValue,
    taskStatusToCode,
} from './boardModel';
import SubProjectDrawer from './SubProjectDrawer';
import BoardInboxColumn from './BoardInboxColumn';
import HandoffSummary from './HandoffSummary';
import ProjectBoard from './ProjectBoard';

interface ProjectControlBoardProps {
    project: Project;
    tasks: Task[];
    config: ProjectBoardConfig;
    onChangeConfig: (next: ProjectBoardConfig) => void;
    onMoveTaskSection: (task: Task, sectionUid: string | null) => Promise<void>;
    onOrderColumn?: (
        sectionUid: string | null,
        taskUids: string[]
    ) => Promise<void>;
    onOpenTask: (task: Task) => void;
    onToggleTask?: (task: Task) => void;
    onReloadParent?: () => void;
    readOnly?: boolean;
    t: TFunction;
}

type DragPayload =
    | { kind: 'task'; task: Task }
    | { kind: 'subproject'; project: BoardTreeSubProject }
    | { kind: 'unsorted_task'; task: Task }
    | { kind: 'inbox_item'; item: InboxItem };

const DONE_STATUSES = new Set<unknown>([2, 'done']);

const ProjectControlBoard: React.FC<ProjectControlBoardProps> = ({
    project,
    tasks,
    config,
    onChangeConfig,
    onMoveTaskSection,
    onOrderColumn,
    onOpenTask,
    onToggleTask,
    onReloadParent,
    readOnly = false,
    t,
}) => {
    const { showErrorToast, showSuccessToast } = useToast();
    const projectUid = project.uid as string;
    const hasSubProjects = Boolean(
        project.SubProjects && project.SubProjects.length > 0
    );

    const [subProjects, setSubProjects] = useState<BoardTreeSubProject[]>([]);
    const [subTasks, setSubTasks] = useState<Task[]>([]);
    const [treeLoading, setTreeLoading] = useState(false);

    const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
    const [unsortedTasks, setUnsortedTasks] = useState<Task[]>([]);
    const [inboxLoading, setInboxLoading] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [displayOpen, setDisplayOpen] = useState(false);
    const [drawerProjectUid, setDrawerProjectUid] = useState<string | null>(
        null
    );
    const [mobileColId, setMobileColId] = useState<string>('');
    const [addingColId, setAddingColId] = useState<string | null>(null);
    const [quickTaskName, setQuickTaskName] = useState('');
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const draggingRef = useRef<DragPayload | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const activePreset: BoardPreset = useMemo(
        () =>
            config.presets.find((p) => p.id === config.activePresetId) ||
            config.presets[0],
        [config]
    );

    const updateActivePreset = useCallback(
        (patch: Partial<BoardPreset>) => {
            onChangeConfig({
                ...config,
                presets: config.presets.map((p) =>
                    p.id === activePreset.id ? { ...p, ...patch } : p
                ),
            });
        },
        [config, activePreset.id, onChangeConfig]
    );

    const reloadTree = useCallback(async () => {
        if (!projectUid || !config.includeSubProjects || !hasSubProjects) {
            setSubProjects([]);
            setSubTasks([]);
            return;
        }
        setTreeLoading(true);
        try {
            const tree = await fetchProjectBoardTree(projectUid, false);
            setSubProjects(tree.sub_projects || []);
            setSubTasks(tree.tasks || []);
        } catch {
            showErrorToast(
                t('projectBoard.loadError', 'Could not load sub-projects')
            );
        } finally {
            setTreeLoading(false);
        }
    }, [projectUid, config.includeSubProjects, hasSubProjects, showErrorToast, t]);

    useEffect(() => {
        void reloadTree();
    }, [reloadTree]);

    const followsTodoMd =
        project.source_type === 'todo_md' ||
        subProjects.some((p) => p.source_type === 'todo_md');

    // Reads the TODO.md file of every project again, then shows the result.
    const handleRefreshTodoMd = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await rescanTodoMd();
            await reloadTree();
            onReloadParent?.();
            showSuccessToast(t('todoMd.rereadDone', 'TODO.md files reread.'));
        } catch {
            showErrorToast(
                t('todoMd.rereadFailed', 'Could not reread the TODO.md files.')
            );
        } finally {
            setRefreshing(false);
        }
    };

    const reloadInbox = useCallback(async () => {
        if (!activePreset.showInboxColumn) return;
        setInboxLoading(true);
        try {
            const [inboxRes, unsortedRes] = await Promise.all([
                fetchInboxItems(50, 0),
                fetchTasks('?type=unsorted'),
            ]);
            const rawInbox = Array.isArray(inboxRes)
                ? inboxRes
                : inboxRes.items || [];
            setInboxItems(rawInbox.filter((i) => i.status === 'added'));
            setUnsortedTasks(unsortedRes.tasks || []);
        } catch {
            // Leave existing state intact on transient error.
        } finally {
            setInboxLoading(false);
        }
    }, [activePreset.showInboxColumn]);

    useEffect(() => {
        void reloadInbox();
    }, [reloadInbox]);

    // Global `/` shortcut to focus search and `Escape` to close popovers.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            const inInput =
                tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
            if (e.key === '/' && !inInput) {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === 'Escape' && displayOpen) {
                setDisplayOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [displayOpen]);

    const statusLabel = useCallback(
        (status: ProjectStatus): string => {
            switch (status) {
                case 'in_progress':
                    return t('projects.status.inProgress', 'In progress');
                case 'planned':
                    return t('projects.status.planned', 'Planned');
                case 'waiting':
                    return t('projects.status.waiting', 'Waiting');
                case 'not_started':
                    return t('projects.status.notStarted', 'Not started');
                case 'paused':
                    return t('projects.status.paused', 'Paused');
                case 'done':
                    return t('projects.status.done', 'Done');
                case 'cancelled':
                    return t('projects.status.cancelled', 'Cancelled');
                case 'archived':
                    return t('projects.status.archived', 'Archived');
            }
        },
        [t]
    );

    const taskStatusLabel = useCallback(
        (key: TaskStatusKey): string => {
            switch (key) {
                case 'not_started':
                    return t('tasks.kanban.todo', 'To Do');
                case 'planned':
                    return t('tasks.status.planned', 'Planned');
                case 'in_progress':
                    return t('tasks.status.inProgress', 'In progress');
                case 'waiting':
                    return t('tasks.status.waiting', 'Waiting');
                case 'done':
                    return t('tasks.status.done', 'Done');
            }
        },
        [t]
    );

    const priorityLabel = useCallback(
        (key: PriorityKey): string => {
            switch (key) {
                case 'high':
                    return t('priority.high', 'High');
                case 'medium':
                    return t('priority.medium', 'Medium');
                case 'low':
                    return t('priority.low', 'Low');
                case 'none':
                    return t('priority.none', 'No priority');
            }
        },
        [t]
    );

    const subProjectByUid = useMemo(() => {
        const map = new Map<string, BoardTreeSubProject>();
        for (const p of subProjects) map.set(p.uid, p);
        return map;
    }, [subProjects]);

    const allCombinedTasks = useMemo(() => {
        const parentTagged = tasks.map((tk) => ({
            ...tk,
            project_uid: tk.project_uid || projectUid,
        }));
        if (!config.includeSubProjects) return parentTagged;
        return [...parentTagged, ...subTasks];
    }, [tasks, subTasks, config.includeSubProjects, projectUid]);

    const allowedProjectUids = useMemo(() => {
        if (!config.includeSubProjects) return new Set([projectUid]);
        const set = new Set<string>([projectUid]);
        const wanted =
            activePreset.projectStatuses.length > 0
                ? new Set(activePreset.projectStatuses)
                : null;
        for (const p of subProjects) {
            if (wanted && !wanted.has(p.status)) continue;
            if (activePreset.onlyTodoMd && p.source_type !== 'todo_md') continue;
            set.add(p.uid);
        }
        return set;
    }, [
        config.includeSubProjects,
        projectUid,
        subProjects,
        activePreset.projectStatuses,
        activePreset.onlyTodoMd,
    ]);

    const subProjectColumns = useMemo(
        () =>
            activePreset.mode === 'by_subproject'
                ? buildSubProjectColumns(
                      project,
                      tasks,
                      subProjects,
                      subTasks,
                      activePreset,
                      searchQuery
                  )
                : [],
        [project, tasks, subProjects, subTasks, activePreset, searchQuery]
    );

    const portfolioColumns = useMemo(
        () =>
            activePreset.mode === 'portfolio'
                ? buildPortfolioColumns(subProjects, activePreset, searchQuery)
                : [],
        [subProjects, activePreset, searchQuery]
    );

    const taskGroupColumns = useMemo(
        () =>
            activePreset.mode === 'tasks' &&
            activePreset.taskGroupBy !== 'section'
                ? buildTaskGroupColumns(
                      allCombinedTasks,
                      [],
                      activePreset,
                      searchQuery,
                      allowedProjectUids
                  )
                : [],
        [allCombinedTasks, activePreset, searchQuery, allowedProjectUids]
    );

    // Keep mobile active column valid when switching modes/presets.
    const activeColumnIds = useMemo(() => {
        if (activePreset.mode === 'by_subproject') {
            return subProjectColumns.map((c) => c.id);
        }
        if (activePreset.mode === 'portfolio') {
            return portfolioColumns.map((c) => c.id);
        }
        return taskGroupColumns.map((c) => c.id);
    }, [
        activePreset.mode,
        subProjectColumns,
        portfolioColumns,
        taskGroupColumns,
    ]);

    useEffect(() => {
        if (
            activeColumnIds.length > 0 &&
            !activeColumnIds.includes(mobileColId)
        ) {
            setMobileColId(activeColumnIds[0]);
        }
    }, [activeColumnIds, mobileColId]);

    const toggleCollapseColumn = (colId: string) => {
        const set = new Set(activePreset.collapsedColumns);
        if (set.has(colId)) set.delete(colId);
        else set.add(colId);
        updateActivePreset({ collapsedColumns: Array.from(set) });
    };

    const toggleStatusFilter = (status: ProjectStatus) => {
        const set = new Set(activePreset.projectStatuses);
        if (set.has(status)) set.delete(status);
        else set.add(status);
        updateActivePreset({ projectStatuses: Array.from(set) });
    };

    const handleSaveNewPreset = () => {
        const name = window.prompt(
            t('projectBoard.newViewName', 'New view name')
        );
        if (!name || !name.trim()) return;
        const id = `custom-${Date.now()}`;
        const copy: BoardPreset = {
            ...activePreset,
            id,
            name: name.trim(),
        };
        onChangeConfig({
            ...config,
            activePresetId: id,
            presets: [...config.presets, copy],
        });
    };

    const handleDeletePreset = (id: string) => {
        if (config.presets.length <= 1) return;
        const remaining = config.presets.filter((p) => p.id !== id);
        onChangeConfig({
            ...config,
            activePresetId:
                config.activePresetId === id
                    ? remaining[0].id
                    : config.activePresetId,
            presets: remaining,
        });
    };

    const handleToggleSubTask = async (task: Task) => {
        if (task.project_uid === projectUid && onToggleTask) {
            onToggleTask(task);
            return;
        }
        if (!task.uid) return;
        const wasDone = DONE_STATUSES.has(task.status);
        const nextStatus = wasDone ? 0 : 2;
        setSubTasks((prev) =>
            prev.map((tk) =>
                tk.uid === task.uid ? { ...tk, status: nextStatus } : tk
            )
        );
        try {
            await toggleTaskCompletion(task.uid, task);
            void reloadTree();
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not update task')
            );
            void reloadTree();
        }
    };

    const handleQuickAddInProject = async (
        targetProjectUid: string,
        name: string
    ) => {
        const targetSub = subProjectByUid.get(targetProjectUid);
        const isTodoMd =
            targetProjectUid === projectUid
                ? project.source_type === 'todo_md'
                : targetSub?.source_type === 'todo_md';
        try {
            const created = await createTask({
                name,
                project_uid: targetProjectUid,
                tags: isTodoMd ? [{ name: 'code' }] : undefined,
            } as Task);
            if (targetProjectUid === projectUid) {
                onReloadParent?.();
            } else {
                setSubTasks((prev) => [
                    { ...created, project_uid: targetProjectUid },
                    ...prev,
                ]);
                void reloadTree();
            }
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not create task')
            );
        }
    };

    const handleAssignTaskToProject = async (
        task: Task,
        targetProjectUid: string
    ) => {
        if (!task.uid) return;
        if (!canMoveTaskBetweenProjects(task)) {
            showErrorToast(
                t(
                    'projectBoard.todoMdMoveBlocked',
                    'TODO.md tasks stay in their repository project.'
                )
            );
            return;
        }
        const targetSub = subProjectByUid.get(targetProjectUid);
        const isTodoMd = targetSub?.source_type === 'todo_md';
        try {
            const payload: Record<string, unknown> = {
                project_uid: targetProjectUid,
                needs_when: false,
            };
            if (isTodoMd) {
                const existingTags = (task.tags || []).map((tg) => tg.name);
                if (!existingTags.includes('code')) {
                    payload.tags = [...existingTags, 'code'];
                }
            }
            await updateTask(task.uid, payload as Partial<Task>);
            setUnsortedTasks((prev) => prev.filter((tk) => tk.uid !== task.uid));
            if (
                task.project_uid === projectUid ||
                targetProjectUid === projectUid
            ) {
                onReloadParent?.();
            }
            void reloadTree();
            showSuccessToast(
                t('projectBoard.movedToProject', 'Moved to {{project}}', {
                    project:
                        targetSub?.name ||
                        (targetProjectUid === projectUid
                            ? project.name
                            : ''),
                })
            );
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not move task')
            );
        }
    };

    const handleConvertInboxToProject = async (
        item: InboxItem,
        targetProjectUid: string
    ) => {
        if (!item.uid) return;
        await handleQuickAddInProject(targetProjectUid, item.content);
        try {
            await processInboxItem(item.uid);
            setInboxItems((prev) => prev.filter((i) => i.uid !== item.uid));
        } catch {
            // Task is already created; inbox refresh will reconcile.
        }
    };

    const handleChangeSubProjectStatus = async (
        targetUid: string,
        status: ProjectStatus
    ) => {
        setSubProjects((prev) =>
            prev.map((p) => (p.uid === targetUid ? { ...p, status } : p))
        );
        try {
            await updateProject(targetUid, { status });
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not update project')
            );
            void reloadTree();
        }
    };

    const handleChangeSubProjectPriority = async (
        targetUid: string,
        priorityKey: PriorityKey
    ) => {
        const priority = priorityKeyToValue(priorityKey) as unknown as Project['priority'];
        setSubProjects((prev) =>
            prev.map((p) =>
                p.uid === targetUid ? { ...p, priority } : p
            )
        );
        try {
            await updateProject(targetUid, { priority });
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not update project')
            );
            void reloadTree();
        }
    };

    const handleDropOnSubProjectColumn = async (targetProjectUid: string) => {
        const payload = draggingRef.current;
        draggingRef.current = null;
        setDragOverCol(null);
        if (!payload || readOnly) return;

        if (payload.kind === 'task' || payload.kind === 'unsorted_task') {
            if (payload.task.project_uid === targetProjectUid) return;
            await handleAssignTaskToProject(payload.task, targetProjectUid);
        } else if (payload.kind === 'inbox_item') {
            await handleConvertInboxToProject(payload.item, targetProjectUid);
        }
    };

    const handleDropOnPortfolioColumn = async (
        colId: string,
        groupBy: PortfolioGroupBy
    ) => {
        const payload = draggingRef.current;
        draggingRef.current = null;
        setDragOverCol(null);
        if (!payload || payload.kind !== 'subproject' || readOnly) return;
        if (groupBy === 'status') {
            if (payload.project.status === colId) return;
            await handleChangeSubProjectStatus(
                payload.project.uid,
                colId as ProjectStatus
            );
        } else if (groupBy === 'priority') {
            await handleChangeSubProjectPriority(
                payload.project.uid,
                colId as PriorityKey
            );
        }
    };

    const handleDropOnTaskGroupColumn = async (
        colId: string,
        groupBy: TaskGroupBy
    ) => {
        const payload = draggingRef.current;
        draggingRef.current = null;
        setDragOverCol(null);
        if (
            !payload ||
            (payload.kind !== 'task' && payload.kind !== 'unsorted_task') ||
            readOnly ||
            !payload.task.uid
        ) {
            return;
        }
        try {
            if (groupBy === 'status') {
                await updateTask(payload.task.uid, {
                    status: taskStatusToCode(colId as TaskStatusKey),
                } as Partial<Task>);
            } else if (groupBy === 'priority') {
                await updateTask(payload.task.uid, {
                    priority: priorityKeyToValue(colId as PriorityKey) as Task['priority'],
                });
            }
            onReloadParent?.();
            void reloadTree();
        } catch {
            showErrorToast(
                t('projectBoard.saveError', 'Could not update task')
            );
        }
    };

    const today = localToday();
    const densityPad =
        activePreset.density === 'compact'
            ? 'px-2 py-1.5'
            : activePreset.density === 'detailed'
              ? 'px-3 py-2.5'
              : 'px-2.5 py-2';

    const drawerProject = drawerProjectUid
        ? subProjectByUid.get(drawerProjectUid) || null
        : null;
    const drawerTasks = useMemo(
        () =>
            drawerProjectUid
                ? subTasks.filter((tk) => tk.project_uid === drawerProjectUid)
                : [],
        [drawerProjectUid, subTasks]
    );

    const renderTaskCard = (task: Task, showProjectBadge = false) => {
        const done = DONE_STATUSES.has(task.status);
        const ownerSub = task.project_uid
            ? subProjectByUid.get(task.project_uid)
            : null;
        const canDrag = !readOnly;
        const dueLabel =
            activePreset.cardFields.dueDate && task.due_date
                ? dueDayLabel(
                      task.due_date,
                      today,
                      'en',
                      t as unknown as (key: string, fallback: string) => string
                  )
                : null;
        const late = task.due_date
            ? isDueLate(task.due_date, today, done)
            : false;

        return (
            <div
                key={task.uid}
                draggable={canDrag}
                onDragStart={() => {
                    draggingRef.current = { kind: 'task', task };
                }}
                onDragEnd={() => {
                    draggingRef.current = null;
                    setDragOverCol(null);
                }}
                className={`group rounded-lg border border-gray-200/80 bg-white ${densityPad} shadow-xs transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700`}
            >
                <div className="flex items-start gap-2">
                    <input
                        type="checkbox"
                        checked={done}
                        disabled={readOnly}
                        onChange={() => void handleToggleSubTask(task)}
                        aria-label={task.name}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className={`min-w-0 flex-1 break-words text-left text-sm leading-snug ${
                            done
                                ? 'text-gray-400 line-through'
                                : 'text-gray-900 dark:text-gray-100'
                        }`}
                    >
                        {task.name}
                    </button>
                </div>
                {(showProjectBadge ||
                    dueLabel ||
                    (activePreset.cardFields.tags &&
                        task.tags &&
                        task.tags.length > 0)) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
                        {showProjectBadge && ownerSub && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {ownerSub.name}
                            </span>
                        )}
                        {dueLabel && (
                            <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                    late
                                        ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                            >
                                {dueLabel}
                            </span>
                        )}
                        {activePreset.cardFields.tags &&
                            (task.tags || []).slice(0, 3).map((tag) => (
                                <span
                                    key={tag.name}
                                    className="rounded bg-blue-50/80 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                                >
                                    #{tag.name}
                                </span>
                            ))}
                    </div>
                )}
            </div>
        );
    };

    const renderPortfolioCard = (sub: BoardTreeSubProject) => {
        const handoff = sub.handoff_state;
        const fields = activePreset.cardFields;
        return (
            <div
                key={sub.uid}
                draggable={!readOnly}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === ' ') {
                        e.preventDefault();
                        setDrawerProjectUid(sub.uid);
                    }
                }}
                onDragStart={() => {
                    draggingRef.current = { kind: 'subproject', project: sub };
                }}
                onDragEnd={() => {
                    draggingRef.current = null;
                    setDragOverCol(null);
                }}
                data-testid={`portfolio-card-${sub.uid}`}
                className={`group rounded-xl border border-gray-200/90 bg-white ${densityPad} shadow-xs transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700`}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {sub.color && (
                            <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: sub.color }}
                            />
                        )}
                        <EntityIcon
                            icon={sub.icon}
                            className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400"
                            fallback={
                                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
                            }
                        />
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {sub.name}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDrawerProjectUid(sub.uid)}
                        title={t('projectBoard.peekProject', 'Inspect tasks')}
                        aria-label={`${t('projectBoard.peekProject', 'Inspect tasks')} ${sub.name}`}
                        data-testid={`peek-project-${sub.uid}`}
                        className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
                    >
                        <EyeIcon className="h-4 w-4" />
                    </button>
                </div>

                {fields.handoff && handoff && (
                    <HandoffSummary handoff={handoff} t={t} className="mt-2" />
                )}

                {fields.nextAction && !handoff?.next_action && sub.next_task && (
                    <p className="mt-1.5 truncate text-xs text-gray-600 dark:text-gray-400">
                        → {sub.next_task.name}
                    </p>
                )}

                {fields.progress && (
                    <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            <div
                                className="h-full rounded-full bg-blue-500 transition-all"
                                style={{
                                    width: `${sub.completion_percentage}%`,
                                }}
                            />
                        </div>
                        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                            {sub.open_tasks_count ?? 0}
                        </span>
                    </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-1">
                        {fields.sourceBadge && sub.source_type === 'todo_md' && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                TODO.md
                            </span>
                        )}
                        {fields.tags &&
                            (sub.tags || []).slice(0, 2).map((tag) => (
                                <span
                                    key={tag.name}
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                >
                                    #{tag.name}
                                </span>
                            ))}
                    </div>
                    {!readOnly && (
                        <select
                            aria-label={t('projects.status', 'Status')}
                            value={sub.status}
                            onChange={(e) =>
                                void handleChangeSubProjectStatus(
                                    sub.uid,
                                    e.target.value as ProjectStatus
                                )
                            }
                            className="md:hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            {PORTFOLIO_STATUS_ORDER.map((st) => (
                                <option key={st} value={st}>
                                    {statusLabel(st)}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
        );
    };

    const columnTitleFor = (
        colId: string,
        mode: BoardViewMode,
        fallback?: string
    ): string => {
        if (mode === 'portfolio') {
            if (activePreset.portfolioGroupBy === 'status') {
                return statusLabel(colId as ProjectStatus);
            }
            if (activePreset.portfolioGroupBy === 'priority') {
                return priorityLabel(colId as PriorityKey);
            }
            return colId === '__untagged__'
                ? t('projectBoard.untagged', 'Untagged')
                : `#${colId}`;
        }
        if (mode === 'tasks') {
            if (activePreset.taskGroupBy === 'status') {
                return taskStatusLabel(colId as TaskStatusKey);
            }
            if (activePreset.taskGroupBy === 'priority') {
                return priorityLabel(colId as PriorityKey);
            }
            if (colId === '__untagged__') {
                return t('projectBoard.untagged', 'Untagged');
            }
        }
        return fallback || colId;
    };

    const useClassicSectionsBoard =
        activePreset.mode === 'tasks' && activePreset.taskGroupBy === 'section';

    return (
        <div className="space-y-3" data-testid="project-control-board">
            {/* Top Toolbar: Saved Views + Mode + Quick Controls + Display Menu */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                {/* Saved view tabs */}
                <div className="flex flex-wrap items-center gap-1">
                    {config.presets.map((preset) => {
                        const active = preset.id === activePreset.id;
                        return (
                            <div
                                key={preset.id}
                                className={`inline-flex items-center rounded-lg text-[13px] font-medium transition ${
                                    active
                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        onChangeConfig({
                                            ...config,
                                            activePresetId: preset.id,
                                        })
                                    }
                                    data-testid={`board-preset-${preset.id}`}
                                    className="px-2.5 py-1.5"
                                >
                                    {preset.name}
                                </button>
                                {preset.id.startsWith('custom-') && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleDeletePreset(preset.id)
                                        }
                                        aria-label={t(
                                            'common.delete',
                                            'Delete'
                                        )}
                                        className="pr-1.5 opacity-70 hover:opacity-100"
                                    >
                                        <XMarkIcon className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        onClick={handleSaveNewPreset}
                        title={t('projectBoard.saveView', 'Save as new view')}
                        className="inline-flex items-center gap-0.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-[13px] text-gray-500 hover:border-gray-400 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <PlusIcon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                            {t('projectBoard.newView', 'View')}
                        </span>
                    </button>
                </div>

                {/* Mode, Group-by, Captures, Search, Display */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {hasSubProjects && config.includeSubProjects && (
                        <select
                            aria-label={t('projectBoard.mode', 'Board mode')}
                            value={activePreset.mode}
                            onChange={(e) =>
                                updateActivePreset({
                                    mode: e.target.value as BoardViewMode,
                                })
                            }
                            data-testid="board-mode-select"
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] font-medium text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="by_subproject">
                                {t(
                                    'projectBoard.modeBySubProject',
                                    '1 col / project'
                                )}
                            </option>
                            <option value="portfolio">
                                {t('projectBoard.modePortfolio', 'Portfolio')}
                            </option>
                            <option value="tasks">
                                {t('projectBoard.modeTasks', 'All tasks')}
                            </option>
                        </select>
                    )}

                    {activePreset.mode === 'portfolio' && (
                        <select
                            aria-label={t('projectBoard.groupBy', 'Group by')}
                            value={activePreset.portfolioGroupBy}
                            onChange={(e) =>
                                updateActivePreset({
                                    portfolioGroupBy: e.target
                                        .value as PortfolioGroupBy,
                                })
                            }
                            data-testid="board-portfolio-groupby"
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="status">
                                {t('projectBoard.byStatus', 'By status')}
                            </option>
                            <option value="priority">
                                {t('projectBoard.byPriority', 'By priority')}
                            </option>
                            <option value="tag">
                                {t('projectBoard.byTag', 'By tag')}
                            </option>
                        </select>
                    )}

                    {activePreset.mode === 'tasks' && (
                        <select
                            aria-label={t('projectBoard.groupBy', 'Group by')}
                            value={activePreset.taskGroupBy}
                            onChange={(e) =>
                                updateActivePreset({
                                    taskGroupBy: e.target.value as TaskGroupBy,
                                })
                            }
                            data-testid="board-task-groupby"
                            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <option value="status">
                                {t('projectBoard.byStatus', 'By status')}
                            </option>
                            <option value="priority">
                                {t('projectBoard.byPriority', 'By priority')}
                            </option>
                            <option value="tag">
                                {t('projectBoard.byTag', 'By tag')}
                            </option>
                            <option value="section">
                                {t('projectBoard.bySection', 'By section')}
                            </option>
                        </select>
                    )}

                    {followsTodoMd && !readOnly && (
                        <button
                            type="button"
                            onClick={() => void handleRefreshTodoMd()}
                            disabled={refreshing}
                            data-testid="board-refresh-todo-md"
                            title={t(
                                'projectBoard.refreshTodoMdTitle',
                                'Read the TODO.md file of every sub-project again'
                            )}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <ArrowPathIcon
                                className={`h-4 w-4 ${
                                    refreshing ? 'animate-spin' : ''
                                }`}
                            />
                            <span>
                                {t(
                                    'projectBoard.refreshTodoMd',
                                    'Refresh TODO.md'
                                )}
                            </span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            updateActivePreset({
                                showInboxColumn: !activePreset.showInboxColumn,
                            })
                        }
                        aria-pressed={activePreset.showInboxColumn}
                        data-testid="toggle-captures-column"
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${
                            activePreset.showInboxColumn
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                    >
                        <InboxIcon className="h-3.5 w-3.5" />
                        <span>{t('projectBoard.capturesTitle', 'Captures')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            updateActivePreset({
                                recentDays: activePreset.recentDays ? null : 7,
                            })
                        }
                        aria-pressed={Boolean(activePreset.recentDays)}
                        title={t(
                            'projectBoard.recent7d',
                            'Tasks captured in the last 7 days'
                        )}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${
                            activePreset.recentDays
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                    >
                        <ClockIcon className="h-3.5 w-3.5" />
                        <span>{t('projectBoard.recent7dShort', '7d')}</span>
                    </button>

                    <div className="relative">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <input
                            ref={searchInputRef}
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('common.filter', 'Filter (/ )')}
                            className="w-32 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-2 text-[13px] text-gray-900 focus:w-44 focus:border-blue-500 focus:bg-white focus:outline-none transition-all dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                        />
                    </div>

                    {/* Display options popover */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setDisplayOpen((v) => !v)}
                            aria-expanded={displayOpen}
                            data-testid="board-display-button"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                            <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
                            <span>{t('projectBoard.display', 'Display')}</span>
                        </button>
                        {displayOpen && (
                            <div
                                data-testid="board-display-menu"
                                className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900 space-y-3 text-xs"
                            >
                                {hasSubProjects && (
                                    <div className="space-y-1.5 border-b border-gray-100 pb-2.5 dark:border-gray-800">
                                        <label className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-gray-700 dark:text-gray-200">
                                                {t(
                                                    'projectBoard.includeSubProjects',
                                                    'Include sub-projects'
                                                )}
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    config.includeSubProjects
                                                }
                                                onChange={(e) =>
                                                    onChangeConfig({
                                                        ...config,
                                                        includeSubProjects:
                                                            e.target.checked,
                                                    })
                                                }
                                            />
                                        </label>
                                        <label className="flex items-center justify-between gap-2">
                                            <span className="text-gray-600 dark:text-gray-300">
                                                {t(
                                                    'projectBoard.hideSubProjectsList',
                                                    'Hide sub-projects list above'
                                                )}
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    config.hideSubProjectsList
                                                }
                                                onChange={(e) =>
                                                    onChangeConfig({
                                                        ...config,
                                                        hideSubProjectsList:
                                                            e.target.checked,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                )}

                                {hasSubProjects && config.includeSubProjects && (
                                    <div className="space-y-1.5 border-b border-gray-100 pb-2.5 dark:border-gray-800">
                                        <p className="font-medium text-gray-700 dark:text-gray-200">
                                            {t(
                                                'projectBoard.projectStatuses',
                                                'Sub-project statuses'
                                            )}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {PORTFOLIO_STATUS_ORDER.map((st) => {
                                                const active =
                                                    activePreset.projectStatuses.includes(
                                                        st
                                                    );
                                                return (
                                                    <button
                                                        key={st}
                                                        type="button"
                                                        onClick={() =>
                                                            toggleStatusFilter(
                                                                st
                                                            )
                                                        }
                                                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                                                            active
                                                                ? 'bg-blue-600 text-white'
                                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        {statusLabel(st)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <label className="mt-1 flex items-center justify-between gap-2">
                                            <span className="text-gray-600 dark:text-gray-300">
                                                {t(
                                                    'projectBoard.onlyTodoMd',
                                                    'TODO.md repos only'
                                                )}
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    activePreset.onlyTodoMd
                                                }
                                                onChange={(e) =>
                                                    updateActivePreset({
                                                        onlyTodoMd:
                                                            e.target.checked,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                )}

                                <div className="space-y-1.5 border-b border-gray-100 pb-2.5 dark:border-gray-800">
                                    <label className="flex items-center justify-between gap-2">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t(
                                                'projectBoard.hideEmptyColumns',
                                                'Hide empty columns'
                                            )}
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={
                                                activePreset.hideEmptyColumns
                                            }
                                            onChange={(e) =>
                                                updateActivePreset({
                                                    hideEmptyColumns:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                    </label>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t(
                                                'projectBoard.wipLimit',
                                                'WIP limit (In progress)'
                                            )}
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={50}
                                            value={
                                                activePreset.wipLimits
                                                    .in_progress ?? 0
                                            }
                                            onChange={(e) => {
                                                const v = Math.max(
                                                    0,
                                                    Number(e.target.value) || 0
                                                );
                                                const next = {
                                                    ...activePreset.wipLimits,
                                                };
                                                if (v === 0)
                                                    delete next.in_progress;
                                                else next.in_progress = v;
                                                updateActivePreset({
                                                    wipLimits: next,
                                                });
                                            }}
                                            className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-right dark:border-gray-700 dark:bg-gray-800"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-gray-600 dark:text-gray-300">
                                            {t(
                                                'projectBoard.density',
                                                'Density'
                                            )}
                                        </span>
                                        <select
                                            value={activePreset.density}
                                            onChange={(e) =>
                                                updateActivePreset({
                                                    density: e.target
                                                        .value as CardDensity,
                                                })
                                            }
                                            className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-800"
                                        >
                                            <option value="compact">
                                                {t(
                                                    'projectBoard.compact',
                                                    'Compact'
                                                )}
                                            </option>
                                            <option value="normal">
                                                {t(
                                                    'projectBoard.normal',
                                                    'Normal'
                                                )}
                                            </option>
                                            <option value="detailed">
                                                {t(
                                                    'projectBoard.detailed',
                                                    'Detailed'
                                                )}
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <p className="font-medium text-gray-700 dark:text-gray-200">
                                        {t(
                                            'projectBoard.cardFields',
                                            'Card details'
                                        )}
                                    </p>
                                    {(
                                        [
                                            ['handoff', 'Handoff'],
                                            ['nextAction', 'Next action'],
                                            ['progress', 'Progress'],
                                            ['tags', 'Tags'],
                                            ['dueDate', 'Due date'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <label
                                            key={key}
                                            className="flex items-center justify-between gap-2 text-gray-600 dark:text-gray-300"
                                        >
                                            <span>{label}</span>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    activePreset.cardFields[key]
                                                }
                                                onChange={(e) =>
                                                    updateActivePreset({
                                                        cardFields: {
                                                            ...activePreset.cardFields,
                                                            [key]: e.target
                                                                .checked,
                                                        },
                                                    })
                                                }
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Classic sections board when user selects Section mode */}
            {useClassicSectionsBoard ? (
                <div className="flex gap-3 overflow-x-auto">
                    {activePreset.showInboxColumn && (
                        <BoardInboxColumn
                            inboxItems={inboxItems}
                            unsortedTasks={unsortedTasks}
                            subProjects={subProjects}
                            loading={inboxLoading}
                            onClose={() =>
                                updateActivePreset({ showInboxColumn: false })
                            }
                            onQuickCapture={async (content) => {
                                await createInboxItem(content);
                                void reloadInbox();
                            }}
                            onAssignTaskToProject={handleAssignTaskToProject}
                            onConvertInboxToProject={
                                handleConvertInboxToProject
                            }
                            onOpenTask={onOpenTask}
                            onDragStartItem={(p) => {
                                draggingRef.current = p;
                            }}
                            onDragEnd={() => {
                                draggingRef.current = null;
                                setDragOverCol(null);
                            }}
                            t={t}
                        />
                    )}
                    <div className="min-w-0 flex-1">
                        <ProjectBoard
                            project={project}
                            tasks={tasks}
                            onMoveTask={onMoveTaskSection}
                            onOrderColumn={onOrderColumn}
                            onOpenTask={onOpenTask}
                            onToggleTask={onToggleTask}
                            readOnly={readOnly}
                            t={t}
                        />
                    </div>
                </div>
            ) : (
                <>
                    {/* Mobile column pill switcher (< 768px) */}
                    {activeColumnIds.length > 0 && (
                        <div
                            className="flex gap-1.5 overflow-x-auto pb-1 md:hidden"
                            data-testid="mobile-column-tabs"
                        >
                            {activePreset.mode === 'by_subproject' &&
                                subProjectColumns.map((col) => (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => setMobileColId(col.id)}
                                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                                            mobileColId === col.id
                                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}
                                    >
                                        {col.title} ({col.tasks.length})
                                    </button>
                                ))}
                            {activePreset.mode === 'portfolio' &&
                                portfolioColumns.map((col) => (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => setMobileColId(col.id)}
                                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                                            mobileColId === col.id
                                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}
                                    >
                                        {columnTitleFor(col.id, 'portfolio')} (
                                        {col.projects.length})
                                    </button>
                                ))}
                            {activePreset.mode === 'tasks' &&
                                taskGroupColumns.map((col) => (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => setMobileColId(col.id)}
                                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                                            mobileColId === col.id
                                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}
                                    >
                                        {columnTitleFor(
                                            col.id,
                                            'tasks',
                                            col.title
                                        )}{' '}
                                        ({col.tasks.length})
                                    </button>
                                ))}
                        </div>
                    )}

                    {/* Main Kanban Canvas */}
                    <div className="flex items-start gap-3 overflow-x-auto pb-4">
                        {activePreset.showInboxColumn && (
                            <BoardInboxColumn
                                inboxItems={inboxItems}
                                unsortedTasks={unsortedTasks}
                                subProjects={subProjects}
                                loading={inboxLoading}
                                onClose={() =>
                                    updateActivePreset({
                                        showInboxColumn: false,
                                    })
                                }
                                onQuickCapture={async (content) => {
                                    await createInboxItem(content);
                                    void reloadInbox();
                                }}
                                onAssignTaskToProject={
                                    handleAssignTaskToProject
                                }
                                onConvertInboxToProject={
                                    handleConvertInboxToProject
                                }
                                onOpenTask={onOpenTask}
                                onDragStartItem={(p) => {
                                    draggingRef.current = p;
                                }}
                                onDragEnd={() => {
                                    draggingRef.current = null;
                                    setDragOverCol(null);
                                }}
                                t={t}
                            />
                        )}

                        {treeLoading &&
                            subProjects.length === 0 &&
                            hasSubProjects && (
                                <div className="px-4 py-8 text-sm text-gray-500">
                                    {t('common.loading', 'Loading…')}
                                </div>
                            )}

                        {/* MODE 1: One column per sub-project */}
                        {activePreset.mode === 'by_subproject' &&
                            subProjectColumns.map((col) => {
                                const hiddenOnMobile =
                                    mobileColId && mobileColId !== col.id;
                                if (col.collapsed) {
                                    return (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() =>
                                                toggleCollapseColumn(col.id)
                                            }
                                            title={col.title}
                                            className="hidden md:flex h-80 w-10 shrink-0 flex-col items-center justify-between rounded-xl border border-gray-200/80 bg-gray-50/90 py-3 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400"
                                        >
                                            <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
                                            <span className="[writing-mode:vertical-rl] rotate-180 truncate text-xs font-semibold">
                                                {col.title}
                                            </span>
                                            <span className="text-[11px] tabular-nums">
                                                {col.tasks.length}
                                            </span>
                                        </button>
                                    );
                                }
                                const handoff = col.project?.handoff_state;
                                return (
                                    <section
                                        key={col.id}
                                        data-testid={`subproject-col-${col.projectUid}`}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setDragOverCol(col.id);
                                        }}
                                        onDragLeave={() => setDragOverCol(null)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            void handleDropOnSubProjectColumn(
                                                col.projectUid
                                            );
                                        }}
                                        className={`${
                                            hiddenOnMobile ? 'hidden md:flex' : 'flex'
                                        } w-full md:w-80 md:max-h-[calc(100vh-6rem)] shrink-0 flex-col rounded-xl border p-2.5 transition ${
                                            dragOverCol === col.id
                                                ? 'border-blue-400 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/30'
                                                : 'border-gray-200/80 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40'
                                        }`}
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-1.5 px-0.5">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    col.project &&
                                                    setDrawerProjectUid(
                                                        col.project.uid
                                                    )
                                                }
                                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                            >
                                                {col.project?.color && (
                                                    <span
                                                        className="h-2 w-2 shrink-0 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                col.project
                                                                    .color,
                                                        }}
                                                    />
                                                )}
                                                <span className="truncate text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400">
                                                    {col.title}
                                                </span>
                                                <span
                                                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                                        col.isOverWip
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200'
                                                            : 'bg-gray-200/80 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                                    }`}
                                                >
                                                    {col.tasks.length}
                                                    {col.wipLimit
                                                        ? `/${col.wipLimit}`
                                                        : ''}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggleCollapseColumn(col.id)
                                                }
                                                aria-label={t(
                                                    'projectBoard.collapseColumn',
                                                    'Collapse column'
                                                )}
                                                className="hidden md:inline-flex rounded p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-800"
                                            >
                                                <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        {activePreset.cardFields.handoff &&
                                            handoff && (
                                                <HandoffSummary
                                                    handoff={handoff}
                                                    t={t}
                                                    className="mb-2"
                                                />
                                            )}

                                        <div className="min-h-0 flex-1 space-y-1.5 md:overflow-y-auto">
                                            {col.tasks.map((tk) =>
                                                renderTaskCard(tk, false)
                                            )}
                                        </div>

                                        {!readOnly && (
                                            <div className="mt-2 pt-1">
                                                {addingColId === col.id ? (
                                                    <form
                                                        onSubmit={async (e) => {
                                                            e.preventDefault();
                                                            const trimmed =
                                                                quickTaskName.trim();
                                                            if (!trimmed) return;
                                                            await handleQuickAddInProject(
                                                                col.projectUid,
                                                                trimmed
                                                            );
                                                            setQuickTaskName('');
                                                            setAddingColId(null);
                                                        }}
                                                        className="space-y-1.5"
                                                    >
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            value={quickTaskName}
                                                            onChange={(e) =>
                                                                setQuickTaskName(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder={t(
                                                                'projectBoard.quickAddPlaceholder',
                                                                'Add a task…'
                                                            )}
                                                            className="w-full rounded-lg border border-blue-400 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none dark:bg-gray-900 dark:text-gray-100"
                                                        />
                                                        <div className="flex justify-end gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setAddingColId(
                                                                        null
                                                                    );
                                                                    setQuickTaskName(
                                                                        ''
                                                                    );
                                                                }}
                                                                className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
                                                            >
                                                                {t(
                                                                    'common.cancel',
                                                                    'Cancel'
                                                                )}
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                                                            >
                                                                {t(
                                                                    'common.add',
                                                                    'Add'
                                                                )}
                                                            </button>
                                                        </div>
                                                    </form>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAddingColId(
                                                                col.id
                                                            );
                                                            setQuickTaskName('');
                                                        }}
                                                        className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                                    >
                                                        <PlusIcon className="h-3.5 w-3.5" />
                                                        {t(
                                                            'projectBoard.addTask',
                                                            'Add task'
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                );
                            })}

                        {/* MODE 2: Portfolio (sub-projects as cards) */}
                        {activePreset.mode === 'portfolio' &&
                            portfolioColumns.map((col) => {
                                const title = columnTitleFor(
                                    col.id,
                                    'portfolio'
                                );
                                const hiddenOnMobile =
                                    mobileColId && mobileColId !== col.id;
                                if (col.collapsed) {
                                    return (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() =>
                                                toggleCollapseColumn(col.id)
                                            }
                                            title={title}
                                            className="hidden md:flex h-80 w-10 shrink-0 flex-col items-center justify-between rounded-xl border border-gray-200/80 bg-gray-50/90 py-3 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400"
                                        >
                                            <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
                                            <span className="[writing-mode:vertical-rl] rotate-180 truncate text-xs font-semibold">
                                                {title}
                                            </span>
                                            <span className="text-[11px] tabular-nums">
                                                {col.projects.length}
                                            </span>
                                        </button>
                                    );
                                }
                                return (
                                    <section
                                        key={col.id}
                                        data-testid={`portfolio-col-${col.id}`}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setDragOverCol(col.id);
                                        }}
                                        onDragLeave={() => setDragOverCol(null)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            void handleDropOnPortfolioColumn(
                                                col.id,
                                                col.groupBy
                                            );
                                        }}
                                        className={`${
                                            hiddenOnMobile ? 'hidden md:flex' : 'flex'
                                        } w-full md:w-80 md:max-h-[calc(100vh-6rem)] shrink-0 flex-col rounded-xl border p-2.5 transition ${
                                            dragOverCol === col.id
                                                ? 'border-blue-400 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/30'
                                                : col.isOverWip
                                                  ? 'border-red-300/90 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/15'
                                                  : 'border-gray-200/80 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40'
                                        }`}
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                                                        col.groupBy === 'status'
                                                            ? getProjectStatusTint(
                                                                  col.id as ProjectStatus
                                                              )
                                                            : 'text-gray-800 dark:text-gray-200'
                                                    }`}
                                                >
                                                    {title}
                                                </span>
                                                <span
                                                    data-testid={`wip-badge-${col.id}`}
                                                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                                        col.isOverWip
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-200'
                                                            : 'bg-gray-200/80 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                                    }`}
                                                >
                                                    {col.projects.length}
                                                    {col.wipLimit
                                                        ? `/${col.wipLimit}`
                                                        : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggleCollapseColumn(col.id)
                                                }
                                                aria-label={t(
                                                    'projectBoard.collapseColumn',
                                                    'Collapse column'
                                                )}
                                                className="hidden md:inline-flex rounded p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-800"
                                            >
                                                <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        <div className="min-h-0 flex-1 space-y-2 md:overflow-y-auto">
                                            {col.projects.map(
                                                renderPortfolioCard
                                            )}
                                        </div>
                                    </section>
                                );
                            })}

                        {/* MODE 3: Aggregated tasks by status / priority / tag */}
                        {activePreset.mode === 'tasks' &&
                            taskGroupColumns.map((col) => {
                                const title = columnTitleFor(
                                    col.id,
                                    'tasks',
                                    col.title
                                );
                                const hiddenOnMobile =
                                    mobileColId && mobileColId !== col.id;
                                if (col.collapsed) {
                                    return (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() =>
                                                toggleCollapseColumn(col.id)
                                            }
                                            title={title}
                                            className="hidden md:flex h-80 w-10 shrink-0 flex-col items-center justify-between rounded-xl border border-gray-200/80 bg-gray-50/90 py-3 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400"
                                        >
                                            <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
                                            <span className="[writing-mode:vertical-rl] rotate-180 truncate text-xs font-semibold">
                                                {title}
                                            </span>
                                            <span className="text-[11px] tabular-nums">
                                                {col.tasks.length}
                                            </span>
                                        </button>
                                    );
                                }
                                return (
                                    <section
                                        key={col.id}
                                        data-testid={`taskgroup-col-${col.id}`}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setDragOverCol(col.id);
                                        }}
                                        onDragLeave={() => setDragOverCol(null)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            void handleDropOnTaskGroupColumn(
                                                col.id,
                                                col.groupBy
                                            );
                                        }}
                                        className={`${
                                            hiddenOnMobile ? 'hidden md:flex' : 'flex'
                                        } w-full md:w-80 md:max-h-[calc(100vh-6rem)] shrink-0 flex-col rounded-xl border p-2.5 transition ${
                                            dragOverCol === col.id
                                                ? 'border-blue-400 bg-blue-50/40 dark:border-blue-600 dark:bg-blue-950/30'
                                                : 'border-gray-200/80 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40'
                                        }`}
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                                                    {title}
                                                </span>
                                                <span
                                                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                                        col.isOverWip
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200'
                                                            : 'bg-gray-200/80 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                                    }`}
                                                >
                                                    {col.tasks.length}
                                                    {col.wipLimit
                                                        ? `/${col.wipLimit}`
                                                        : ''}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggleCollapseColumn(col.id)
                                                }
                                                aria-label={t(
                                                    'projectBoard.collapseColumn',
                                                    'Collapse column'
                                                )}
                                                className="hidden md:inline-flex rounded p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-800"
                                            >
                                                <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        <div className="min-h-0 flex-1 space-y-1.5 md:overflow-y-auto">
                                            {col.tasks.map((tk) =>
                                                renderTaskCard(tk, true)
                                            )}
                                        </div>
                                    </section>
                                );
                            })}
                    </div>
                </>
            )}

            <SubProjectDrawer
                project={drawerProject}
                tasks={drawerTasks}
                onClose={() => setDrawerProjectUid(null)}
                onOpenTask={onOpenTask}
                onToggleTask={handleToggleSubTask}
                onQuickAddTask={handleQuickAddInProject}
                onChangeStatus={handleChangeSubProjectStatus}
                statusLabel={statusLabel}
                readOnly={readOnly}
                t={t}
            />
        </div>
    );
};

export default ProjectControlBoard;
