import { Task } from '../../entities/Task';
import {
    EisenhowerMatrixConfig,
    MatrixPriority,
    MatrixRule,
} from '../../utils/profileService';

export const DEFAULT_MATRIX_ID = 'default';
export const MAX_MATRICES = 10;
export const URGENT_TAG = 'urgent';

export const emptyRule = (): MatrixRule => ({
    priorities: [],
    due: { type: 'any' },
    tags: [],
    projects: [],
});

// The built-in matrix: important = medium/high priority, urgent = the
// 'urgent' tag. With first-match placement the later quadrants only need
// the looser half of each rule.
export const DEFAULT_MATRIX: EisenhowerMatrixConfig = {
    id: DEFAULT_MATRIX_ID,
    name: '',
    quadrants: [
        {
            name: 'do_now',
            rule: {
                ...emptyRule(),
                priorities: ['medium', 'high'],
                tags: [URGENT_TAG],
            },
        },
        {
            name: 'schedule',
            rule: { ...emptyRule(), priorities: ['medium', 'high'] },
        },
        { name: 'delegate', rule: { ...emptyRule(), tags: [URGENT_TAG] } },
        { name: 'eliminate', rule: emptyRule() },
    ],
};

const PRIORITY_BY_NUMBER: MatrixPriority[] = ['low', 'medium', 'high'];

export const taskPriority = (task: Task): MatrixPriority => {
    const p = task.priority;
    if (p === null || p === undefined) return 'none';
    if (typeof p === 'number') return PRIORITY_BY_NUMBER[p] ?? 'none';
    return PRIORITY_BY_NUMBER.includes(p as MatrixPriority)
        ? (p as MatrixPriority)
        : 'none';
};

const toDay = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// The task's due day as YYYY-MM-DD in local time, or null.
const dueDay = (task: Task): string | null => {
    const raw = task.due_date;
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
    return toDay(parsed);
};

export interface MatchContext {
    now?: Date;
    // Maps a task to its project uid when the task row lacks Project.uid.
    projectUid?: (task: Task) => string | undefined;
}

export const matchesRule = (
    task: Task,
    rule: MatrixRule,
    ctx: MatchContext = {}
): boolean => {
    if (
        rule.priorities.length > 0 &&
        !rule.priorities.includes(taskPriority(task))
    ) {
        return false;
    }

    const due = dueDay(task);
    const now = ctx.now ?? new Date();
    const today = toDay(now);
    switch (rule.due.type) {
        case 'overdue':
            if (!due || due >= today) return false;
            break;
        case 'today':
            if (due !== today) return false;
            break;
        case 'within': {
            // Due on or before N days from today; overdue tasks count too.
            const limit = new Date(now);
            limit.setDate(limit.getDate() + (rule.due.days ?? 7));
            if (!due || due > toDay(limit)) return false;
            break;
        }
        case 'none':
            if (due) return false;
            break;
        default:
            break;
    }

    if (rule.tags.length > 0) {
        const names = (task.tags || []).map((tag) => tag.name.toLowerCase());
        if (!rule.tags.some((tag) => names.includes(tag.toLowerCase()))) {
            return false;
        }
    }

    if (rule.projects.length > 0) {
        const uid = task.Project?.uid ?? ctx.projectUid?.(task);
        if (!uid || !rule.projects.includes(uid)) return false;
    }

    return true;
};

// Places each task in the first quadrant whose rule it matches; tasks that
// match none are left out. Returns one list per quadrant.
export const assignToQuadrants = (
    tasks: Task[],
    matrix: EisenhowerMatrixConfig,
    ctx: MatchContext = {}
): Task[][] => {
    const buckets: Task[][] = matrix.quadrants.map(() => []);
    tasks.forEach((task) => {
        const index = matrix.quadrants.findIndex((q) =>
            matchesRule(task, q.rule, ctx)
        );
        if (index >= 0) buckets[index].push(task);
    });
    return buckets;
};

export const newMatrixId = (): string =>
    `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
