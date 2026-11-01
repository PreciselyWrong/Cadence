import type { CaptureTarget } from './captureText';

// The "/" menu of the capture box: typing "/" at the start of a word lists
// the tokens the box understands (#tag, +project, @person, ~area, a due
// date, a repeat). Picking one either opens that token's list of values or
// inserts the token's text, so nobody has to remember the syntax.

export type SlashStage =
    | 'root'
    | 'tag'
    | 'project'
    | 'person'
    | 'area'
    | 'priority'
    | 'date'
    | 'repeat';

export type SlashTrigger = '/' | '~' | '#' | '+' | '!';

export interface SlashMenuState {
    // Index of the "/", "~", "#", "+" or "!" in the text
    start: number;
    stage: SlashStage;
    trigger: SlashTrigger;
}

export type SlashIcon =
    | 'tag'
    | 'project'
    | 'person'
    | 'area'
    | 'priority'
    | 'date'
    | 'repeat'
    | 'create';

// A name with what the lists show and sort by. Plain strings stand for a
// name with nothing else known.
export interface SlashEntry {
    name: string;
    color?: string;
    // How often a tag is used; the most used come first
    usage?: number;
}
export type SlashName = string | SlashEntry;

export interface SlashItem {
    key: string;
    // What the user reads
    label: string;
    // The syntax or phrase the item stands for, shown under the label
    description?: string;
    icon: SlashIcon;
    // A colour dot shown beside the label
    color?: string;
    // Text that replaces "/query" when the item is picked
    insert?: string;
    // The list the item opens instead of inserting anything
    opens?: SlashStage;
    // Set for a tag, project or area: the box keeps it as a badge
    pick?: { kind: 'tag' | 'project' | 'area'; name: string };
}

export interface SlashLabels {
    tag: string;
    project: string;
    person: string;
    area: string;
    date: string;
    repeat: string;
    today: string;
    tomorrow: string;
    nextMonday: string;
    inAWeek: string;
    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
    everyDay: string;
    everyWeekday: string;
    everyWeek: string;
    everyMonth: string;
    create: (token: string) => string;
}

export interface SlashContext {
    target: CaptureTarget;
    labels: SlashLabels;
    tags: SlashName[];
    projects: SlashName[];
    areas: SlashName[];
    people: SlashName[];
}

const MAX_ITEMS = 8;
// A nested tag is its path, so "/" is part of the name
const TAG_NAME = /^[A-Za-z0-9_/-]+$/;
const TRIGGER_STAGE: Record<string, SlashStage> = {
    '/': 'root',
    '~': 'area',
    '#': 'tag',
    '+': 'project',
    '!': 'priority',
};

// Where a "/" typed at the cursor starts a menu: at the very start of the
// text or after whitespace, so URLs, "and/or" and "1/2" are left alone.
// A "~", "#", "+" or "!" there opens the list of areas, tags, projects or
// priorities straight away.
export const slashTriggerAt = (
    text: string,
    cursor: number
): SlashMenuState | null => {
    const char = text.charAt(cursor - 1);
    if (cursor < 1 || !(char in TRIGGER_STAGE)) return null;
    const before = cursor - 2;
    if (before >= 0 && !/\s/.test(text.charAt(before))) return null;
    return {
        start: cursor - 1,
        stage: TRIGGER_STAGE[char],
        trigger: char as SlashTrigger,
    };
};

// The text typed after the "/", or null when the menu no longer applies
// (the "/" was deleted, the caret left it, or the root list was given a
// space, which means the user is just writing).
export const slashQuery = (
    text: string,
    cursor: number,
    menu: SlashMenuState
): string | null => {
    if (text.charAt(menu.start) !== menu.trigger || cursor <= menu.start) {
        return null;
    }
    const query = text.slice(menu.start + 1, cursor);
    if (/\n/.test(query)) return null;
    if (menu.stage === 'root' && /\s/.test(query)) return null;
    if (menu.trigger === '!') {
        // Only !1 to !3 are priorities; once one is complete there is
        // nothing left to pick.
        return /^[0-9]?$/.test(query) && !/^[123]$/.test(query) ? query : null;
    }
    if (menu.trigger === '#' || menu.trigger === '+') {
        // The word ends at a space, unless a quote opened a longer name
        if (query.startsWith('"')) {
            const name = query.slice(1);
            return name.includes('"') ? null : name;
        }
        if (/\s/.test(query)) return null;
    }
    return query;
};

const quoted = (name: string) => (/\s/.test(name) ? `"${name}"` : name);

const fold = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const matches = (name: string, query: string) =>
    fold(name).includes(fold(query.trim()));

const entryOf = (name: SlashName): SlashEntry =>
    typeof name === 'string' ? { name } : name;

// 0: the name starts with the query, 1: a word or path segment of it does,
// 2: it is somewhere inside.
const rankOf = (name: string, query: string): number => {
    const wanted = fold(query.trim());
    if (!wanted) return 0;
    const folded = fold(name);
    if (folded.startsWith(wanted)) return 0;
    return folded.split(/[\s/_-]+/).some((part) => part.startsWith(wanted))
        ? 1
        : 2;
};

// Tags, projects and areas picked from a list are kept as badges, not text
const pickOf = (
    stage: 'tag' | 'project' | 'person' | 'area',
    name: string
): SlashItem['pick'] =>
    stage === 'person' ? undefined : { kind: stage, name };

const valueItems = (
    stage: 'tag' | 'project' | 'person' | 'area',
    prefix: string,
    names: SlashName[],
    query: string,
    labels: SlashLabels,
    canCreate: boolean
): SlashItem[] => {
    const entries = names.map(entryOf);
    const usable =
        stage === 'tag'
            ? entries.filter((e) => TAG_NAME.test(e.name))
            : entries;
    const items: SlashItem[] = usable
        .filter((entry) => matches(entry.name, query))
        .sort(
            (a, b) =>
                rankOf(a.name, query) - rankOf(b.name, query) ||
                (b.usage ?? 0) - (a.usage ?? 0) ||
                a.name.localeCompare(b.name, undefined, {
                    sensitivity: 'base',
                })
        )
        .slice(0, MAX_ITEMS)
        .map((entry) => ({
            key: `${stage}:${entry.name}`,
            label: entry.name,
            icon: stage,
            color: entry.color,
            insert: `${prefix}${stage === 'tag' ? entry.name : quoted(entry.name)}`,
            pick: pickOf(stage, entry.name),
        }));

    const wanted = query.trim();
    const exists = usable.some(
        (entry) => entry.name.toLowerCase() === wanted.toLowerCase()
    );
    const valid = stage === 'tag' ? TAG_NAME.test(wanted) : wanted !== '';
    if (canCreate && wanted && valid && !exists) {
        const token = `${prefix}${stage === 'tag' ? wanted : quoted(wanted)}`;
        items.push({
            key: `${stage}:new`,
            label: labels.create(token),
            icon: 'create',
            insert: token,
            pick: pickOf(stage, wanted),
        });
    }
    return items;
};

// !1 is high, !2 medium, !3 low, as the box reads them
const PRIORITY_COLORS = {
    '1': '#ef4444',
    '2': '#f59e0b',
    '3': '#3b82f6',
};

const priorityItems = (query: string, labels: SlashLabels): SlashItem[] =>
    (
        [
            ['1', labels.priorityHigh],
            ['2', labels.priorityMedium],
            ['3', labels.priorityLow],
        ] as const
    )
        .filter(([digit]) => digit.startsWith(query.trim()))
        .map(([digit, label]) => ({
            key: `priority:${digit}`,
            label,
            description: `!${digit}`,
            icon: 'priority' as const,
            color: PRIORITY_COLORS[digit],
            insert: `!${digit}`,
        }));

// Which tokens make sense for what is being added. An Inbox item keeps the
// text as typed and reads the tokens when it is converted, so it gets all.
const rootFor = (target: CaptureTarget, labels: SlashLabels): SlashItem[] => {
    const all: Array<
        [Exclude<SlashStage, 'root'>, string, string, CaptureTarget[]]
    > = [
        ['tag', labels.tag, '#tag', ['inbox', 'task', 'note', 'project']],
        ['project', labels.project, '+project', ['inbox', 'task', 'note']],
        ['person', labels.person, '@name', ['inbox', 'task']],
        ['area', labels.area, '~area', ['inbox', 'task', 'project']],
        ['date', labels.date, 'tomorrow', ['inbox', 'task', 'project']],
        ['repeat', labels.repeat, 'every week', ['inbox', 'task']],
    ];
    return all
        .filter(([, , , targets]) => targets.includes(target))
        .map(([stage, label, description]) => ({
            key: `root:${stage}`,
            label,
            description,
            icon: stage,
            opens: stage,
        }));
};

// Ready-made phrases the due date and recurrence parsers understand
const phraseItems = (
    icon: 'date' | 'repeat',
    phrases: Array<[string, string, string]>,
    query: string
): SlashItem[] =>
    phrases
        .filter(([, label]) => matches(label, query))
        .map(([key, label, insert]) => ({
            key: `${icon}:${key}`,
            label,
            description: insert,
            icon,
            insert,
        }));

export const slashItems = (
    stage: SlashStage,
    query: string,
    ctx: SlashContext
): SlashItem[] => {
    const { labels } = ctx;
    switch (stage) {
        case 'root': {
            const items = rootFor(ctx.target, labels);
            return query
                ? items.filter((item) => matches(item.label, query))
                : items;
        }
        case 'tag':
            return valueItems('tag', '#', ctx.tags, query, labels, true);
        case 'project':
            // A project is not filed under another project
            if (ctx.target === 'project') return [];
            return valueItems(
                'project',
                '+',
                ctx.projects,
                query,
                labels,
                true
            );
        case 'person':
            return valueItems('person', '@', ctx.people, query, labels, false);
        case 'area':
            // Notes have no area, so a "~" there is just a character
            return ctx.target === 'note'
                ? []
                : valueItems('area', '~', ctx.areas, query, labels, false);
        case 'priority':
            // Notes and projects have no !1-!3 priority
            return ctx.target === 'task' || ctx.target === 'inbox'
                ? priorityItems(query, labels)
                : [];
        case 'date':
            return phraseItems(
                'date',
                [
                    ['today', labels.today, 'today'],
                    ['tomorrow', labels.tomorrow, 'tomorrow'],
                    ['monday', labels.nextMonday, 'next monday'],
                    ['week', labels.inAWeek, 'in 1 week'],
                ],
                query
            );
        case 'repeat':
            return phraseItems(
                'repeat',
                [
                    ['day', labels.everyDay, 'every day'],
                    ['weekday', labels.everyWeekday, 'every weekday'],
                    ['week', labels.everyWeek, 'every week'],
                    ['month', labels.everyMonth, 'every month'],
                ],
                query
            );
    }
};

// Removes "/query" (or "~query") without inserting anything, for items that
// become badges instead of text. A space left on both sides is collapsed.
export const removeSlashRange = (
    text: string,
    menu: SlashMenuState,
    end: number
): { text: string; cursor: number } => {
    let head = text.slice(0, menu.start);
    const tail = text.slice(end);
    if (/\s$/.test(head) && /^\s/.test(tail)) head = head.slice(0, -1);
    return { text: head + tail, cursor: head.length };
};

// What picking an item does to the text. `text`/`cursor` describe the box
// with "/query" still in it; `end` is the caret, after the query.
export const applySlashItem = (
    text: string,
    menu: SlashMenuState,
    end: number,
    item: SlashItem
): { text: string; cursor: number; next: SlashMenuState | null } => {
    const head = text.slice(0, menu.start);
    const tail = text.slice(end);

    if (item.opens) {
        // Keep a bare "/" so what is typed next filters the new list
        const next = head + '/' + tail;
        return {
            text: next,
            cursor: menu.start + 1,
            next: { start: menu.start, stage: item.opens, trigger: '/' },
        };
    }

    const insert = `${item.insert ?? ''} `;
    // Do not double the space when the text already goes on with one
    const rest = /^\s/.test(tail) ? tail.replace(/^\s/, '') : tail;
    return {
        text: head + insert + rest,
        cursor: head.length + insert.length,
        next: null,
    };
};
