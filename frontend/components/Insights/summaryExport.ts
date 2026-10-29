// Pure helpers for the Summary page: periods, grouping and export formats.

export type SummaryGroupBy = 'project' | 'day' | 'status';
export type SummaryPeriod =
    'today' | 'this_week' | 'last_week' | 'this_month' | 'custom';

export interface SummaryTask {
    uid: string;
    name: string;
    status: string;
    completed_at: string | null;
    completed_date: string | null;
    due_date: string | null;
    project: { uid: string; name: string } | null;
    tags: string[];
}

export interface SummaryGroup {
    key: string;
    label: string;
    tasks: SummaryTask[];
}

export interface GroupLabels {
    noProject: string;
    noDate: string;
    status: (status: string) => string;
    day?: (date: string) => string;
}

export interface CsvHeaders {
    name: string;
    status: string;
    project: string;
    completed: string;
    due: string;
    tags: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The calendar day `now` falls on in `timeZone`, as a UTC-midnight Date.
function zonedToday(now: Date, timeZone?: string): Date {
    if (timeZone) {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(now);
            const get = (type: string) =>
                Number(parts.find((p) => p.type === type)?.value);
            return new Date(
                Date.UTC(get('year'), get('month') - 1, get('day'))
            );
        } catch {
            // Unknown timezone: fall back to the browser's local day.
        }
    }
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const utcDateString = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// The start and end day of a period, counted from `now` in the profile
// timezone (the one the backend reads days in). Without a timezone the
// browser's local time is used.
export function periodRange(
    period: Exclude<SummaryPeriod, 'custom'>,
    now: Date = new Date(),
    firstDayOfWeek = 1,
    timeZone?: string
): { start: string; end: string } {
    const today = zonedToday(now, timeZone);
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    if (period === 'today') {
        const s = utcDateString(today);
        return { start: s, end: s };
    }
    if (period === 'this_month') {
        return {
            start: utcDateString(new Date(Date.UTC(y, m, 1))),
            end: utcDateString(new Date(Date.UTC(y, m + 1, 0))),
        };
    }
    const offset = (today.getUTCDay() - firstDayOfWeek + 7) % 7;
    const startDay =
        today.getUTCDate() - offset - (period === 'last_week' ? 7 : 0);
    return {
        start: utcDateString(new Date(Date.UTC(y, m, startDay))),
        end: utcDateString(new Date(Date.UTC(y, m, startDay + 6))),
    };
}

const STATUS_ORDER = [
    'done',
    'in_progress',
    'planned',
    'waiting',
    'not_started',
    'archived',
    'cancelled',
];

// The day a task belongs to: completion day, else its due day.
export function taskDay(task: SummaryTask): string | null {
    return task.completed_date || task.due_date || null;
}

export function groupTasks(
    tasks: SummaryTask[],
    groupBy: SummaryGroupBy,
    labels: GroupLabels
): SummaryGroup[] {
    const map = new Map<string, SummaryGroup>();
    for (const task of tasks) {
        let key: string;
        let label: string;
        if (groupBy === 'project') {
            key = task.project?.uid || '';
            label = task.project?.name || labels.noProject;
        } else if (groupBy === 'day') {
            key = taskDay(task) || '';
            label = key ? (labels.day ? labels.day(key) : key) : labels.noDate;
        } else {
            key = task.status;
            label = labels.status(task.status);
        }
        if (!map.has(key)) map.set(key, { key, label, tasks: [] });
        map.get(key)!.tasks.push(task);
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
        // The empty bucket ("No project", "No date") goes last.
        if (!a.key) return 1;
        if (!b.key) return -1;
        if (groupBy === 'day') return a.key.localeCompare(b.key);
        if (groupBy === 'status')
            return STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key);
        return a.label.localeCompare(b.label);
    });
    return groups;
}

const tagSuffix = (task: SummaryTask) =>
    task.tags.length ? ' ' + task.tags.map((t) => `#${t}`).join(' ') : '';

const escapeMarkdown = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

export function buildMarkdown(title: string, groups: SummaryGroup[]): string {
    const lines: string[] = [`# ${escapeMarkdown(title)}`, ''];
    for (const group of groups) {
        lines.push(`## ${escapeMarkdown(group.label)} (${group.tasks.length})`);
        lines.push('');
        for (const task of group.tasks) {
            const box = task.status === 'done' ? '[x]' : '[ ]';
            lines.push(
                `- ${box} ${escapeMarkdown(task.name)}${tagSuffix(task)}`
            );
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd() + '\n';
}

export function buildText(title: string, groups: SummaryGroup[]): string {
    const lines: string[] = [title, '='.repeat(title.length), ''];
    for (const group of groups) {
        lines.push(`${group.label} (${group.tasks.length})`);
        for (const task of group.tasks) {
            const box = task.status === 'done' ? '[x]' : '[ ]';
            lines.push(`  ${box} ${task.name}${tagSuffix(task)}`);
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd() + '\n';
}

const csvCell = (value: string) => {
    // Guard against spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function buildCsv(
    tasks: SummaryTask[],
    headers: CsvHeaders,
    statusLabel: (status: string) => string = (s) => s
): string {
    const rows = [
        [
            headers.name,
            headers.status,
            headers.project,
            headers.completed,
            headers.due,
            headers.tags,
        ],
        ...tasks.map((t) => [
            t.name,
            statusLabel(t.status),
            t.project?.name || '',
            t.completed_date || '',
            t.due_date || '',
            t.tags.join(', '),
        ]),
    ];
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
