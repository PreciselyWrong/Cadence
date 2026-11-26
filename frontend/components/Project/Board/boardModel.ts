import {
    BoardTreeSubProject,
    Project,
    ProjectHandoffState,
    ProjectStatus,
} from '../../../entities/Project';
import { Task } from '../../../entities/Task';
import { TODO_MD_SECTIONS } from '../../../utils/todoMd';
import { ProjectSection } from '../../../utils/projectSectionsService';

export type BoardViewMode = 'by_subproject' | 'portfolio' | 'tasks';
export type PortfolioGroupBy = 'status' | 'priority' | 'tag';
export type TaskGroupBy = 'section' | 'status' | 'priority' | 'tag';
export type SwimlaneBy = 'none' | 'status' | 'priority' | 'subproject';
export type CardDensity = 'compact' | 'normal' | 'detailed';

export interface CardFields {
    handoff: boolean;
    nextAction: boolean;
    progress: boolean;
    tags: boolean;
    dueDate: boolean;
    sourceBadge: boolean;
}

export const DEFAULT_CARD_FIELDS: CardFields = {
    handoff: true,
    nextAction: true,
    progress: true,
    tags: true,
    dueDate: true,
    sourceBadge: true,
};

// Linear and most portfolio guides review project health every two weeks.
export const DEFAULT_STALE_DAYS = 14;

export interface BoardPreset {
    id: string;
    name: string;
    mode: BoardViewMode;
    portfolioGroupBy: PortfolioGroupBy;
    taskGroupBy: TaskGroupBy;
    swimlaneBy: SwimlaneBy;
    includeSubProjects: boolean;
    projectStatuses: ProjectStatus[];
    onlyTodoMd: boolean;
    recentDays: number | null;
    selectedTags: string[];
    hideEmptyColumns: boolean;
    showInboxColumn: boolean;
    wipLimits: Record<string, number>;
    collapsedColumns: string[];
    density: CardDensity;
    // A current state older than this many days reads as stale; 0 = never.
    staleDays: number;
    cardFields: CardFields;
}

// Bumped when the built-in views change, so saved boards pick them up.
// 2: two views (tasks by project, projects) instead of four.
export const BOARD_CONFIG_VERSION = 2;

export interface ProjectBoardConfig {
    version: number;
    activePresetId: string;
    includeSubProjects: boolean;
    hideSubProjectsList: boolean;
    presets: BoardPreset[];
}

export const PORTFOLIO_STATUS_ORDER: ProjectStatus[] = [
    'in_progress',
    'planned',
    'waiting',
    'not_started',
    'paused',
    'done',
];

export const TASK_STATUS_ORDER = [
    'not_started',
    'planned',
    'in_progress',
    'waiting',
    'done',
] as const;

export type TaskStatusKey = (typeof TASK_STATUS_ORDER)[number];

export const PRIORITY_ORDER = ['high', 'medium', 'low', 'none'] as const;
export type PriorityKey = (typeof PRIORITY_ORDER)[number];

export const normalizeTaskStatus = (
    status: Task['status']
): TaskStatusKey | 'other' => {
    if (status === 0 || status === 'not_started') return 'not_started';
    if (status === 6 || status === 'planned') return 'planned';
    if (status === 1 || status === 'in_progress') return 'in_progress';
    if (status === 4 || status === 'waiting') return 'waiting';
    if (status === 2 || status === 'done') return 'done';
    return 'other';
};

export const taskStatusToCode = (key: TaskStatusKey): number => {
    switch (key) {
        case 'not_started':
            return 0;
        case 'in_progress':
            return 1;
        case 'done':
            return 2;
        case 'waiting':
            return 4;
        case 'planned':
            return 6;
    }
};

export const normalizePriority = (
    priority: number | string | null | undefined
): PriorityKey => {
    if (priority === 2 || priority === 'high') return 'high';
    if (priority === 1 || priority === 'medium') return 'medium';
    if (priority === 0 || priority === 'low') return 'low';
    return 'none';
};

export const priorityKeyToValue = (key: PriorityKey): number | null => {
    if (key === 'high') return 2;
    if (key === 'medium') return 1;
    if (key === 'low') return 0;
    return null;
};

export const defaultPresetsForProject = (
    hasSubProjects: boolean
): BoardPreset[] => {
    if (!hasSubProjects) {
        return [
            {
                id: 'sections',
                name: 'Sections',
                mode: 'tasks',
                portfolioGroupBy: 'status',
                taskGroupBy: 'section',
                swimlaneBy: 'none',
                includeSubProjects: false,
                projectStatuses: [],
                onlyTodoMd: false,
                recentDays: null,
                selectedTags: [],
                hideEmptyColumns: false,
                showInboxColumn: false,
                wipLimits: {},
                collapsedColumns: [],
                density: 'normal',
                staleDays: DEFAULT_STALE_DAYS,
                cardFields: { ...DEFAULT_CARD_FIELDS },
            },
            {
                id: 'by-status',
                name: 'Status',
                mode: 'tasks',
                portfolioGroupBy: 'status',
                taskGroupBy: 'status',
                swimlaneBy: 'none',
                includeSubProjects: false,
                projectStatuses: [],
                onlyTodoMd: false,
                recentDays: null,
                selectedTags: [],
                hideEmptyColumns: false,
                showInboxColumn: false,
                wipLimits: { in_progress: 3 },
                collapsedColumns: ['done'],
                density: 'normal',
                staleDays: DEFAULT_STALE_DAYS,
                cardFields: { ...DEFAULT_CARD_FIELDS },
            },
        ];
    }

    return [
        {
            id: 'active-projects',
            name: 'Tâches par projet',
            mode: 'by_subproject',
            portfolioGroupBy: 'status',
            taskGroupBy: 'status',
            swimlaneBy: 'none',
            includeSubProjects: true,
            projectStatuses: ['in_progress'],
            onlyTodoMd: false,
            recentDays: null,
            selectedTags: [],
            hideEmptyColumns: true,
            showInboxColumn: false,
            wipLimits: {},
            collapsedColumns: [],
            density: 'normal',
            staleDays: DEFAULT_STALE_DAYS,
            cardFields: { ...DEFAULT_CARD_FIELDS },
        },
        {
            id: 'portfolio',
            name: 'Projets',
            mode: 'portfolio',
            portfolioGroupBy: 'status',
            taskGroupBy: 'status',
            swimlaneBy: 'none',
            includeSubProjects: true,
            projectStatuses: [],
            onlyTodoMd: false,
            recentDays: null,
            selectedTags: [],
            hideEmptyColumns: false,
            showInboxColumn: false,
            wipLimits: {},
            collapsedColumns: ['done'],
            density: 'normal',
            staleDays: DEFAULT_STALE_DAYS,
            cardFields: { ...DEFAULT_CARD_FIELDS },
        },
    ];
};

export const defaultBoardConfig = (
    hasSubProjects: boolean
): ProjectBoardConfig => {
    const presets = defaultPresetsForProject(hasSubProjects);
    return {
        version: BOARD_CONFIG_VERSION,
        activePresetId: presets[0].id,
        includeSubProjects: hasSubProjects,
        hideSubProjectsList: hasSubProjects,
        presets,
    };
};

export const isOverWip = (count: number, limit?: number): boolean =>
    typeof limit === 'number' && limit > 0 && count > limit;

// Mirrors backend/modules/todo-md/policy.js: tasks synced from a TODO.md file
// cannot be moved to another project from Cadence.
export const canMoveTaskBetweenProjects = (task: Task): boolean =>
    !task.source_key;

export const filterSubProjects = (
    subProjects: BoardTreeSubProject[],
    preset: BoardPreset,
    searchQuery: string
): BoardTreeSubProject[] => {
    const q = searchQuery.trim().toLowerCase();
    const wantedStatuses =
        preset.projectStatuses.length > 0
            ? new Set(preset.projectStatuses)
            : null;
    const wantedTags =
        preset.selectedTags.length > 0
            ? new Set(preset.selectedTags.map((t) => t.toLowerCase()))
            : null;

    return subProjects.filter((p) => {
        if (wantedStatuses && !wantedStatuses.has(p.status)) return false;
        if (preset.onlyTodoMd && p.source_type !== 'todo_md') return false;
        if (wantedTags) {
            const pTags = (p.tags || []).map((t) => t.name.toLowerCase());
            if (!pTags.some((name) => wantedTags.has(name))) return false;
        }
        if (q) {
            const inName = p.name.toLowerCase().includes(q);
            const inHandoff = (p.handoff_state?.next_action || '')
                .toLowerCase()
                .includes(q);
            const inDesc = (p.description || '').toLowerCase().includes(q);
            if (!inName && !inHandoff && !inDesc) return false;
        }
        return true;
    });
};

export const filterTasksForBoard = (
    tasks: Task[],
    preset: BoardPreset,
    searchQuery: string,
    allowedProjectUids: Set<string> | null,
    now = new Date()
): Task[] => {
    const q = searchQuery.trim().toLowerCase();
    const wantedTags =
        preset.selectedTags.length > 0
            ? new Set(preset.selectedTags.map((t) => t.toLowerCase()))
            : null;
    const cutoffMs =
        preset.recentDays && preset.recentDays > 0
            ? now.getTime() - preset.recentDays * 24 * 60 * 60 * 1000
            : null;

    return tasks.filter((task) => {
        if (allowedProjectUids && task.project_uid) {
            if (!allowedProjectUids.has(task.project_uid)) return false;
        }
        if (cutoffMs !== null) {
            const created = task.created_at
                ? new Date(task.created_at).getTime()
                : 0;
            if (!created || created < cutoffMs) return false;
        }
        if (wantedTags) {
            const tTags = (task.tags || []).map((t) => t.name.toLowerCase());
            if (!tTags.some((name) => wantedTags.has(name))) return false;
        }
        if (q) {
            const inName = task.name.toLowerCase().includes(q);
            const inNote = (task.note || '').toLowerCase().includes(q);
            if (!inName && !inNote) return false;
        }
        return true;
    });
};

export interface SubProjectColumn {
    id: string;
    title: string;
    projectUid: string;
    project: BoardTreeSubProject | null;
    isParent: boolean;
    isTodoMd: boolean;
    tasks: Task[];
    wipLimit?: number;
    isOverWip: boolean;
    collapsed: boolean;
}

export const buildSubProjectColumns = (
    parentProject: Project,
    parentTasks: Task[],
    subProjects: BoardTreeSubProject[],
    subTasks: Task[],
    preset: BoardPreset,
    searchQuery: string,
    now = new Date()
): SubProjectColumn[] => {
    const collapsedSet = new Set(preset.collapsedColumns);
    const filteredSubs = filterSubProjects(subProjects, preset, '');
    const allowedUids = new Set<string>(filteredSubs.map((p) => p.uid));
    if (parentProject.uid) allowedUids.add(parentProject.uid);

    const filteredParentTasks = filterTasksForBoard(
        parentTasks.map((t) => ({
            ...t,
            project_uid: t.project_uid || parentProject.uid,
        })),
        preset,
        searchQuery,
        allowedUids,
        now
    );
    const filteredSubTasks = filterTasksForBoard(
        subTasks,
        preset,
        searchQuery,
        allowedUids,
        now
    );

    const tasksByProject = new Map<string, Task[]>();
    for (const task of filteredSubTasks) {
        if (!task.project_uid) continue;
        const list = tasksByProject.get(task.project_uid) || [];
        list.push(task);
        tasksByProject.set(task.project_uid, list);
    }

    const q = searchQuery.trim().toLowerCase();
    const columns: SubProjectColumn[] = [];

    if (
        parentProject.uid &&
        (filteredParentTasks.length > 0 || !preset.hideEmptyColumns)
    ) {
        if (
            !q ||
            filteredParentTasks.length > 0 ||
            parentProject.name.toLowerCase().includes(q)
        ) {
            const limit = preset.wipLimits[parentProject.uid];
            columns.push({
                id: parentProject.uid,
                title: parentProject.name,
                projectUid: parentProject.uid,
                project: null,
                isParent: true,
                isTodoMd: parentProject.source_type === 'todo_md',
                tasks: filteredParentTasks,
                wipLimit: limit,
                isOverWip: isOverWip(filteredParentTasks.length, limit),
                collapsed: collapsedSet.has(parentProject.uid),
            });
        }
    }

    for (const sub of filteredSubs) {
        const list = tasksByProject.get(sub.uid) || [];
        if (preset.hideEmptyColumns && list.length === 0) continue;
        if (q && list.length === 0 && !sub.name.toLowerCase().includes(q)) {
            continue;
        }
        const limit = preset.wipLimits[sub.uid];
        columns.push({
            id: sub.uid,
            title: sub.name,
            projectUid: sub.uid,
            project: sub,
            isParent: false,
            isTodoMd: sub.source_type === 'todo_md',
            tasks: list,
            wipLimit: limit,
            isOverWip: isOverWip(list.length, limit),
            collapsed: collapsedSet.has(sub.uid),
        });
    }

    return columns;
};

export interface PortfolioColumn {
    id: string;
    groupBy: PortfolioGroupBy;
    projects: BoardTreeSubProject[];
    wipLimit?: number;
    isOverWip: boolean;
    collapsed: boolean;
}

export const buildPortfolioColumns = (
    subProjects: BoardTreeSubProject[],
    preset: BoardPreset,
    searchQuery: string
): PortfolioColumn[] => {
    const filtered = filterSubProjects(subProjects, preset, searchQuery);
    const collapsedSet = new Set(preset.collapsedColumns);
    const groupBy = preset.portfolioGroupBy;

    let keys: string[] = [];
    const buckets = new Map<string, BoardTreeSubProject[]>();

    if (groupBy === 'status') {
        keys =
            preset.projectStatuses.length > 0
                ? PORTFOLIO_STATUS_ORDER.filter((s) =>
                      preset.projectStatuses.includes(s)
                  )
                : [...PORTFOLIO_STATUS_ORDER];
        keys.forEach((k) => buckets.set(k, []));
        for (const p of filtered) {
            const key = buckets.has(p.status) ? p.status : 'not_started';
            buckets.get(key)!.push(p);
        }
    } else if (groupBy === 'priority') {
        keys = [...PRIORITY_ORDER];
        keys.forEach((k) => buckets.set(k, []));
        for (const p of filtered) {
            buckets.get(normalizePriority(p.priority))!.push(p);
        }
    } else {
        const tagSet = new Set<string>(preset.selectedTags);
        for (const p of filtered) {
            for (const tag of p.tags || []) tagSet.add(tag.name);
        }
        keys = [...Array.from(tagSet).sort(), '__untagged__'];
        keys.forEach((k) => buckets.set(k, []));
        for (const p of filtered) {
            const pTags = p.tags || [];
            if (pTags.length === 0) {
                buckets.get('__untagged__')!.push(p);
            } else {
                const first = pTags[0].name;
                if (!buckets.has(first)) buckets.set(first, []);
                buckets.get(first)!.push(p);
            }
        }
    }

    return keys
        .map((id) => {
            const projects = buckets.get(id) || [];
            const limit = preset.wipLimits[id];
            return {
                id,
                groupBy,
                projects,
                wipLimit: limit,
                isOverWip: isOverWip(projects.length, limit),
                collapsed: collapsedSet.has(id),
            };
        })
        .filter((col) => !preset.hideEmptyColumns || col.projects.length > 0);
};

export interface TaskGroupColumn {
    id: string;
    title?: string;
    groupBy: TaskGroupBy;
    tasks: Task[];
    wipLimit?: number;
    isOverWip: boolean;
    collapsed: boolean;
}

export const buildTaskGroupColumns = (
    tasks: Task[],
    sections: ProjectSection[],
    preset: BoardPreset,
    searchQuery: string,
    allowedProjectUids: Set<string> | null,
    now = new Date()
): TaskGroupColumn[] => {
    const filtered = filterTasksForBoard(
        tasks,
        preset,
        searchQuery,
        allowedProjectUids,
        now
    );
    const collapsedSet = new Set(preset.collapsedColumns);
    const groupBy = preset.taskGroupBy;
    const buckets = new Map<string, Task[]>();
    let keys: { id: string; title?: string }[] = [];

    if (groupBy === 'section') {
        keys = [
            { id: '' },
            ...sections.map((s) => ({ id: s.uid, title: s.name })),
        ];
        const known = new Set(sections.map((s) => s.uid));
        keys.forEach((k) => buckets.set(k.id, []));
        for (const t of filtered) {
            const key =
                t.section_uid && known.has(t.section_uid) ? t.section_uid : '';
            buckets.get(key)!.push(t);
        }
    } else if (groupBy === 'status') {
        keys = TASK_STATUS_ORDER.map((id) => ({ id }));
        keys.forEach((k) => buckets.set(k.id, []));
        for (const t of filtered) {
            const key = normalizeTaskStatus(t.status);
            if (key !== 'other') buckets.get(key)!.push(t);
        }
    } else if (groupBy === 'priority') {
        keys = PRIORITY_ORDER.map((id) => ({ id }));
        keys.forEach((k) => buckets.set(k.id, []));
        for (const t of filtered) {
            buckets.get(normalizePriority(t.priority))!.push(t);
        }
    } else {
        const tagSet = new Set<string>(preset.selectedTags);
        for (const t of filtered) {
            for (const tag of t.tags || []) tagSet.add(tag.name);
        }
        keys = [
            ...Array.from(tagSet)
                .sort()
                .map((id) => ({ id, title: `#${id}` })),
            { id: '__untagged__' },
        ];
        keys.forEach((k) => buckets.set(k.id, []));
        for (const t of filtered) {
            const tTags = t.tags || [];
            if (tTags.length === 0) {
                buckets.get('__untagged__')!.push(t);
            } else {
                const first = tTags[0].name;
                if (!buckets.has(first)) buckets.set(first, []);
                buckets.get(first)!.push(t);
            }
        }
    }

    return keys
        .map(({ id, title }) => {
            const list = buckets.get(id) || [];
            const limit = preset.wipLimits[id];
            return {
                id,
                title,
                groupBy,
                tasks: list,
                wipLimit: limit,
                isOverWip: isOverWip(list.length, limit),
                collapsed: collapsedSet.has(id),
            };
        })
        .filter((col) => !preset.hideEmptyColumns || col.tasks.length > 0);
};

export type ProjectHealth = 'blocked' | 'stale' | 'ok';

// Health of a project from its "État actuel": blocked when it names a
// blocker, stale when the file has not moved for `staleDays`, else on track.
export const projectHealth = (
    handoff: ProjectHandoffState | null | undefined,
    now: Date,
    staleDays: number
): ProjectHealth | null => {
    if (!handoff) return null;
    if (handoff.blockers) return 'blocked';
    if (staleDays > 0 && handoff.updated_at) {
        const age = now.getTime() - new Date(handoff.updated_at).getTime();
        if (age > staleDays * 86_400_000) return 'stale';
    }
    return 'ok';
};

export interface TaskSectionGroup {
    key: string;
    // null for the tasks that belong to no section of the file.
    label: string | null;
    tasks: Task[];
}

// The tasks of one project in the order of its TODO.md: Now, Next, Ideas,
// then the file's other sections, then the tasks that only live in Cadence;
// each section in the order of its bullets.
export const groupTasksBySourceSection = (
    tasks: Task[]
): TaskSectionGroup[] => {
    const known = TODO_MD_SECTIONS.map((name) => name.toLowerCase());
    const groups = new Map<string, TaskSectionGroup>();
    for (const task of tasks) {
        const label = task.source_section?.trim() || null;
        const key = label ? label.toLowerCase() : '';
        const group = groups.get(key);
        if (group) group.tasks.push(task);
        else groups.set(key, { key, label, tasks: [task] });
    }
    const rank = (group: TaskSectionGroup) => {
        if (!group.label) return Number.MAX_SAFE_INTEGER;
        const index = known.indexOf(group.key);
        return index === -1 ? known.length : index;
    };
    // Inside a section, the bullets keep the file's order; tasks that only
    // live in Cadence follow, in the order they came (stable sort).
    const place = (task: Task) =>
        task.source_position ?? Number.MAX_SAFE_INTEGER;
    for (const group of groups.values()) {
        group.tasks.sort((a, b) => place(a) - place(b));
    }
    return [...groups.values()].sort((a, b) => rank(a) - rank(b));
};
