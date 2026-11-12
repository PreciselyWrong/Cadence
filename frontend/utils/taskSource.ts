import { Task } from '../entities/Task';

// Where a task came from, for its badge. A plain web task has none.
export type TaskSourceKind =
    'gmail' | 'telegram' | 'mcp' | 'android' | 'desktop' | 'link' | 'todo_md';

export interface TaskSource {
    kind: TaskSourceKind;
    label: string;
    url?: string;
}

const KINDS: readonly TaskSourceKind[] = [
    'gmail',
    'telegram',
    'mcp',
    'android',
    'desktop',
    'link',
    'todo_md',
];

const LABELS: Record<TaskSourceKind, string> = {
    gmail: 'Gmail',
    telegram: 'Telegram',
    mcp: 'MCP',
    android: 'Android',
    desktop: 'Desktop',
    link: 'Link',
    todo_md: 'TODO.md',
};

// Only web addresses open from a badge; anything else is not a link.
const webUrl = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:'
            ? value
            : undefined;
    } catch {
        return undefined;
    }
};

export const taskSource = (
    task?: Pick<Task, 'source' | 'source_url' | 'source_key'> | null
): TaskSource | null => {
    if (!task) return null;
    if (task.source_key) {
        return { kind: 'todo_md', label: LABELS.todo_md };
    }
    const kind = KINDS.find((candidate) => candidate === task.source);
    if (!kind) return null;
    const url = webUrl(task.source_url);
    return { kind, label: LABELS[kind], ...(url ? { url } : {}) };
};
