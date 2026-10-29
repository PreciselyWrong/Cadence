import {
    addDays,
    addMinutes,
    differenceInCalendarDays,
    format,
} from 'date-fns';

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    type: 'task' | 'event';
    color?: string;
    feedUid?: string;
    // Whole-day item, drawn as a bar in the all-day row. `end` is the
    // exclusive midnight after the last day.
    allDay?: boolean;
    // Which field the bottom edge of a timed task block changes: its
    // estimate when the block is due time + estimate, its due time when the
    // block runs from the start time to the due time.
    resize?: 'estimate' | 'due';
    // A later occurrence of a recurring task: shown, but not moved or
    // resized until it becomes the next one.
    readOnly?: boolean;
}

export const DEFAULT_TASK_MINUTES = 60;
// Same bounds as the estimated_minutes column.
export const MIN_TASK_MINUTES = 5;
export const MAX_TASK_MINUTES = 720;
export const RESIZE_STEP_MINUTES = 15;

export interface CalendarTask {
    id: number | string;
    name?: string;
    original_name?: string;
    title?: string;
    due_date?: string | null;
    due_time?: string | null;
    start_date?: string | null;
    start_time?: string | null;
    defer_until?: string | null;
    estimated_minutes?: number | null;
    completed_at?: string | null;
    is_virtual_occurrence?: boolean;
    occurrence_index?: number;
    habit_mode?: boolean;
    priority?: string | number | null;
    Project?: {
        id?: number | string;
        name?: string;
        color?: string | null;
    } | null;
    tags?: { name: string; color?: string | null }[];
}

export type CalendarColorBy = 'default' | 'project' | 'priority' | 'tag';

const PALETTE = [
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#f97316',
    '#84cc16',
    '#06b6d4',
    '#a855f7',
];
const PRIORITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
};
const PRIORITY_NAMES = ['low', 'medium', 'high'];
const NEUTRAL = '#6b7280';
export const HABIT_COLOR = '#8b5cf6';

const paletteColor = (key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++)
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(hash) % PALETTE.length];
};

// Block colour: green once done; otherwise by the chosen key, with the
// project's or tag's own colour when it has one.
export const taskColor = (
    task: CalendarTask,
    colorBy: CalendarColorBy = 'default'
) => {
    if (task.completed_at) return '#22c55e';
    if (colorBy === 'project') {
        const project = task.Project;
        if (!project) return NEUTRAL;
        return (
            project.color || paletteColor(String(project.id ?? project.name))
        );
    }
    if (colorBy === 'priority') {
        const name =
            typeof task.priority === 'number'
                ? PRIORITY_NAMES[task.priority]
                : task.priority || '';
        return PRIORITY_COLORS[name] || NEUTRAL;
    }
    if (colorBy === 'tag') {
        const tag = task.tags?.[0];
        if (!tag) return NEUTRAL;
        return tag.color || paletteColor(tag.name);
    }
    return '#3b82f6';
};

// YYYY-MM-DD plus optional HH:mm, read as local time.
export const localDateTime = (
    day: string | null | undefined,
    time?: string | null
): Date | null => {
    if (!day) return null;
    const [year, month, date] = day.slice(0, 10).split('-').map(Number);
    if (!year || !month || !date) return null;
    const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
    const value = new Date(year, month - 1, date, hours || 0, minutes || 0);
    return isNaN(value.getTime()) ? null : value;
};

export const taskName = (task: CalendarTask) =>
    task.original_name || task.name || task.title || `Task ${task.id}`;

export const clampMinutes = (minutes: number) =>
    Math.min(MAX_TASK_MINUTES, Math.max(MIN_TASK_MINUTES, Math.round(minutes)));

const isSameDay = (a: Date, b: Date) => differenceInCalendarDays(a, b) === 0;

// The block a task's due date draws:
// - due time + start time earlier the same day: start → due;
// - due time otherwise: due → due + estimate (an hour without one);
// - whole-day due: a bar from the start day (if earlier) to the due day.
const dueEvent = (
    task: CalendarTask,
    colorBy: CalendarColorBy = 'default'
): CalendarEvent | null => {
    const color = taskColor(task, colorBy);
    const base = {
        id: `task-${task.id}`,
        title: taskName(task),
        type: 'task' as const,
        color,
    };
    const dueDay = localDateTime(task.due_date);
    if (!dueDay) return null;
    const startDay = localDateTime(task.start_date);

    if (task.due_time) {
        const due = localDateTime(task.due_date, task.due_time)!;
        const start = task.start_time
            ? localDateTime(task.start_date, task.start_time)
            : null;
        if (start && start < due) {
            if (isSameDay(start, due)) {
                return { ...base, start, end: due, resize: 'due' };
            }
            return {
                ...base,
                start: startDay!,
                end: addDays(dueDay, 1),
                allDay: true,
            };
        }
        const minutes = task.estimated_minutes
            ? clampMinutes(task.estimated_minutes)
            : DEFAULT_TASK_MINUTES;
        return {
            ...base,
            start: due,
            end: addMinutes(due, minutes),
            resize: 'estimate',
        };
    }

    const first = startDay && startDay < dueDay ? startDay : dueDay;
    return { ...base, start: first, end: addDays(dueDay, 1), allDay: true };
};

// Strips an event id back to the id of the task it draws.
export const taskIdOf = (eventId: string) =>
    eventId
        .replace(/^task(-defer|-created|-fallback)?-/, '')
        .replace(/-(occ|habit)-\d+$/, '');

export const taskToEvents = (
    task: CalendarTask,
    colorBy: CalendarColorBy = 'default'
): CalendarEvent[] => {
    // A habit's check-in day: a whole-day item in the habit colour.
    if (task.is_virtual_occurrence && task.habit_mode) {
        const day = localDateTime(task.due_date);
        if (!day) return [];
        return [
            {
                id: `task-${task.id}-habit-${task.occurrence_index ?? 0}`,
                title: taskName(task),
                start: day,
                end: addDays(day, 1),
                type: 'task',
                color: HABIT_COLOR,
                allDay: true,
                readOnly: true,
            },
        ];
    }
    if (task.is_virtual_occurrence) {
        const due = dueEvent(task, colorBy);
        if (!due) return [];
        return [
            {
                ...due,
                id: `task-${task.id}-occ-${task.occurrence_index ?? 0}`,
                resize: undefined,
                readOnly: true,
            },
        ];
    }
    const events: CalendarEvent[] = [];
    if (task.defer_until) {
        const deferDate = new Date(task.defer_until);
        if (!isNaN(deferDate.getTime())) {
            events.push({
                id: `task-defer-${task.id}`,
                title: taskName(task),
                start: deferDate,
                end: addMinutes(deferDate, DEFAULT_TASK_MINUTES),
                type: 'task',
                color: task.completed_at ? '#22c55e' : '#f59e0b',
            });
        }
    }
    const due = dueEvent(task, colorBy);
    if (due) events.push(due);
    return events;
};

const dayString = (date: Date) => format(date, 'yyyy-MM-dd');
const timeString = (date: Date) => format(date, 'HH:mm');

// The task fields to save when its block is moved so it starts at
// `newStart`. Durations and whole-day spans are kept.
export const moveUpdate = (
    task: CalendarTask,
    event: CalendarEvent,
    newStart: Date
): Record<string, unknown> => {
    if (event.id.startsWith('task-defer-')) {
        return { defer_until: newStart.toISOString() };
    }
    const shift = newStart.getTime() - event.start.getTime();
    const shifted = (date: Date) => new Date(date.getTime() + shift);

    if (event.allDay) {
        const dayShift = differenceInCalendarDays(newStart, event.start);
        const update: Record<string, unknown> = {
            due_date: dayString(
                addDays(localDateTime(task.due_date)!, dayShift)
            ),
        };
        if (task.due_time) update.due_time = task.due_time;
        if (task.start_date) {
            update.start_date = dayString(
                addDays(localDateTime(task.start_date)!, dayShift)
            );
            if (task.start_time) update.start_time = task.start_time;
        }
        return update;
    }

    if (event.resize === 'due') {
        const start = shifted(event.start);
        const due = shifted(event.end);
        return {
            start_date: dayString(start),
            start_time: timeString(start),
            due_date: dayString(due),
            due_time: timeString(due),
        };
    }
    const due = shifted(event.start);
    return { due_date: dayString(due), due_time: timeString(due) };
};

// Drop targets of the day calendar in the Today page: 15-minute slots, keyed
// by minutes from midnight, and the all-day row.
export const CAL_ALL_DAY_ID = 'cal-allday';
export const slotId = (minute: number) => `cal-slot:${minute}`;
const SLOT_PATTERN = /^cal-slot:(\d+)$/;

// The task fields to save when a list task or calendar block is dropped on
// `overId` in the shown `day`. A slot sets the due time (the server marks the
// task as timed); the all-day row clears it. `event` is the block dragged, if
// any; a timed block moved to a slot keeps its duration. Returns null when
// `overId` is not a calendar target.
export const dropToDueUpdate = (
    task: CalendarTask,
    overId: string,
    day: string,
    event?: CalendarEvent
): Record<string, unknown> | null => {
    if (overId === CAL_ALL_DAY_ID) {
        return { due_date: day, due_time: null };
    }
    const match = SLOT_PATTERN.exec(overId);
    if (!match) return null;
    const minute = Number(match[1]);
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(
        minute % 60
    ).padStart(2, '0')}`;
    if (event && !event.allDay && !event.id.startsWith('task-defer-')) {
        return moveUpdate(task, event, localDateTime(day, time)!);
    }
    return { due_date: day, due_time: time };
};

// The task fields to save when the bottom edge of its block is dragged to
// `newEnd`.
export const resizeUpdate = (
    event: CalendarEvent,
    newEnd: Date
): Record<string, unknown> => {
    const minutes = clampMinutes(
        (newEnd.getTime() - event.start.getTime()) / 60000
    );
    if (event.resize === 'due') {
        const due = addMinutes(event.start, minutes);
        return { due_date: dayString(due), due_time: timeString(due) };
    }
    return { estimated_minutes: minutes };
};

// Days of `days` an event covers; timed events cover their start day.
export const coversDay = (event: CalendarEvent, day: Date) => {
    if (!event.allDay) return isSameDay(event.start, day);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    return event.start <= dayStart && dayStart < event.end;
};

// Gives each whole-day bar of the week starting `weekStart` a row, lowest
// free first, so a bar sits on the same row on every day it covers.
export const layoutAllDayWeek = (
    events: CalendarEvent[],
    weekStart: Date
): Map<string, number> => {
    const weekEnd = addDays(weekStart, 7);
    const bars = events
        .filter((e) => e.allDay && e.start < weekEnd && e.end > weekStart)
        .sort(
            (a, b) =>
                a.start.getTime() - b.start.getTime() ||
                b.end.getTime() - a.end.getTime()
        );
    const rowEnds: Date[] = [];
    const rows = new Map<string, number>();
    bars.forEach((bar) => {
        let row = rowEnds.findIndex((end) => end <= bar.start);
        if (row === -1) row = rowEnds.length;
        rowEnds[row] = bar.end;
        rows.set(bar.id, row);
    });
    return rows;
};
