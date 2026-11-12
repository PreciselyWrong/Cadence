import type { Task } from '../../../entities/Task';
import {
    cardTaskKeys,
    CardLike,
    dayLoad,
    groupCards,
    sortCards,
    subtasksWithoutCard,
    Translate,
} from '../groupCards';

const t: Translate = (_key, fallback) => fallback;

const card = (
    name: string,
    fields: {
        start?: number | null;
        dueMinute?: number | null;
        priority?: string;
        project?: string | null;
        tag?: string | null;
    } = {}
): CardLike => {
    const task = {
        uid: name,
        name,
        status: 0,
        priority: fields.priority,
        Project:
            fields.project === undefined || fields.project === null
                ? undefined
                : { name: fields.project },
        tags:
            fields.tag === undefined || fields.tag === null
                ? []
                : [{ name: fields.tag }],
    } as unknown as Task;
    return {
        task,
        start: fields.start ?? null,
        dueMinute: fields.dueMinute ?? null,
    };
};

const names = (cards: CardLike[]): string[] => cards.map((c) => c.task.name);

describe('sortCards', () => {
    it("keeps the given order for 'plan'", () => {
        const cards = [card('b'), card('a'), card('c')];

        expect(names(sortCards(cards, 'plan'))).toEqual(['b', 'a', 'c']);
    });

    it("sorts 'time' by slot start, then due time, untimed last", () => {
        const cards = [
            card('untimed'),
            card('due 10h', { dueMinute: 600 }),
            card('slot 14h', { start: 840 }),
            card('slot 9h due 15h', { start: 540, dueMinute: 900 }),
            card('slot 9h due 8h', { start: 540, dueMinute: 480 }),
            card('slot 9h', { start: 540 }),
        ];

        expect(names(sortCards(cards, 'time'))).toEqual([
            'slot 9h due 8h',
            'slot 9h due 15h',
            'slot 9h',
            'slot 14h',
            'due 10h',
            'untimed',
        ]);
    });

    it("sorts 'priority' high, medium, low, then none", () => {
        const cards = [
            card('none'),
            card('low', { priority: 'low' }),
            card('high', { priority: 'high' }),
            card('medium', { priority: 'medium' }),
        ];

        expect(names(sortCards(cards, 'priority'))).toEqual([
            'high',
            'medium',
            'low',
            'none',
        ]);
    });

    it("sorts 'name' alphabetically without case sensitivity", () => {
        const cards = [card('banana'), card('Apple'), card('cherry')];

        expect(names(sortCards(cards, 'name'))).toEqual([
            'Apple',
            'banana',
            'cherry',
        ]);
    });

    it("sorts 'project' by project name, no project last", () => {
        const cards = [
            card('no project'),
            card('zeta task', { project: 'Zeta' }),
            card('alpha task', { project: 'Alpha' }),
        ];

        expect(names(sortCards(cards, 'project'))).toEqual([
            'alpha task',
            'zeta task',
            'no project',
        ]);
    });

    it('does not reorder the array it receives', () => {
        const cards = [card('b'), card('a')];

        sortCards(cards, 'name');

        expect(names(cards)).toEqual(['b', 'a']);
    });
});

describe('groupCards', () => {
    it("returns one unlabelled group for 'none'", () => {
        const cards = [card('a'), card('b')];

        const groups = groupCards(cards, 'none', t);

        expect(groups).toHaveLength(1);
        expect(names(groups[0].cards)).toEqual(['a', 'b']);
    });

    it('returns no group for an empty list', () => {
        expect(groupCards([], 'project', t)).toEqual([]);
    });

    it("groups by project, sorted by name, 'No project' last", () => {
        const cards = [
            card('none', {}),
            card('beta task', { project: 'Beta' }),
            card('alpha task', { project: 'Alpha' }),
            card('second beta', { project: 'Beta' }),
        ];

        const groups = groupCards(cards, 'project', t);

        expect(groups.map((g) => g.label)).toEqual([
            'Alpha',
            'Beta',
            'No project',
        ]);
        expect(names(groups[1].cards)).toEqual(['beta task', 'second beta']);
    });

    it('labels the missing project with the translated fallback', () => {
        const translate = jest.fn((_key: string, fallback: string) => fallback);

        groupCards([card('a')], 'project', translate);

        expect(translate).toHaveBeenCalledWith(
            'upcoming.noProject',
            'No project'
        );
    });

    it("groups by first tag, sorted by name, 'No tag' last", () => {
        const cards = [
            card('untagged'),
            card('work one', { tag: 'work' }),
            card('home one', { tag: 'home' }),
            card('work two', { tag: 'work' }),
        ];

        const groups = groupCards(cards, 'tag', t);

        expect(groups.map((g) => g.label)).toEqual([
            '#home',
            '#work',
            'No tag',
        ]);
        expect(names(groups[1].cards)).toEqual(['work one', 'work two']);
    });

    it('groups by priority in fixed order, with translated labels', () => {
        const cards = [
            card('none'),
            card('low', { priority: 'low' }),
            card('high', { priority: 'high' }),
            card('medium', { priority: 'medium' }),
        ];
        const translate = jest.fn((_key: string, fallback: string) => fallback);

        const groups = groupCards(cards, 'priority', translate);

        expect(groups.map((g) => g.label)).toEqual([
            'High',
            'Medium',
            'Low',
            'No priority',
        ]);
        expect(translate).toHaveBeenCalledWith(
            'upcoming.priority.high',
            'High'
        );
        expect(translate).toHaveBeenCalledWith(
            'upcoming.priority.none',
            'No priority'
        );
    });

    it('omits empty priority groups', () => {
        const groups = groupCards(
            [card('high', { priority: 'high' }), card('none')],
            'priority',
            t
        );

        expect(groups.map((g) => g.key)).toEqual([
            'priority:high',
            'priority:none',
        ]);
    });

    it('keeps the order of the cards inside each group', () => {
        const cards = [
            card('second', { project: 'A' }),
            card('first', { project: 'B' }),
            card('third', { project: 'A' }),
        ];

        const groups = groupCards(cards, 'project', t);

        expect(names(groups[0].cards)).toEqual(['second', 'third']);
    });
});

// A subtask whose parent is another card of the same list.
const subtaskCard = (name: string, parent: string): CardLike => ({
    task: {
        uid: name,
        name,
        status: 0,
        parent_task: { id: 1, uid: parent, name: `Parent ${parent}` },
    } as unknown as Task,
    start: null,
    dueMinute: null,
});

describe('dayLoad', () => {
    it('sums the durations of the open lines only', () => {
        expect(
            dayLoad([
                { duration: 60, done: false },
                { duration: 30, done: true },
                { duration: 45, done: false },
            ])
        ).toBe(105);
    });

    it('is zero for a day without open lines', () => {
        expect(dayLoad([])).toBe(0);
        expect(dayLoad([{ duration: 30, done: true }])).toBe(0);
    });
});

describe('subtasksWithoutCard', () => {
    it('drops the subtasks that have a card of their own in the list', () => {
        const subtasks = [
            { uid: 's1', name: 's1' },
            { uid: 's2', name: 's2' },
        ] as Task[];

        expect(
            subtasksWithoutCard(subtasks, new Set(['s2'])).map((s) => s.name)
        ).toEqual(['s1']);
    });

    it('keeps every subtask when none has a card', () => {
        const subtasks = [{ uid: 's1', name: 's1' }] as Task[];

        expect(subtasksWithoutCard(subtasks, new Set())).toHaveLength(1);
    });
});

describe('cardTaskKeys', () => {
    it('collects the uid of each card task', () => {
        expect(cardTaskKeys([card('a'), card('b')])).toEqual(
            new Set(['a', 'b'])
        );
    });
});

describe('subtask cards and projects', () => {
    it("groups a subtask under its parent's project when the parent has a card", () => {
        const cards = [
            card('parent', { project: 'Work' }),
            subtaskCard('child', 'parent'),
        ];

        const groups = groupCards(cards, 'project', t);

        expect(groups.map((g) => g.label)).toEqual(['Work']);
        expect(names(groups[0].cards)).toEqual(['parent', 'child']);
    });

    it('keeps the own project of a subtask whose parent is not in the list', () => {
        const child = subtaskCard('child', 'elsewhere');
        child.task = { ...child.task, Project: { name: 'Home' } } as Task;

        const groups = groupCards([child], 'project', t);

        expect(groups.map((g) => g.label)).toEqual(['Home']);
    });

    it("sorts a subtask by its parent's project", () => {
        const cards = [
            card('zeta', { project: 'Zeta' }),
            card('alpha', { project: 'Alpha' }),
            subtaskCard('child', 'alpha'),
        ];

        expect(names(sortCards(cards, 'project'))).toEqual([
            'alpha',
            'child',
            'zeta',
        ]);
    });
});
