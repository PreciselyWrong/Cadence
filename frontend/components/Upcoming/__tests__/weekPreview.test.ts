import {
    placeOfTask,
    placeOfDecision,
    decisionOfPlace,
    previewMoves,
    samePlace,
} from '../weekPreview';
import type {
    WeekChange,
    WeekFacts,
    WeekTaskFact,
} from '../../../utils/proposalsService';

// Thursday 19 November 2026; the period runs to Wednesday 25.
const facts = (tasks: WeekTaskFact[], planned: Record<string, string[]> = {}) =>
    ({
        today: '2026-11-19',
        period: { start: '2026-11-19', end: '2026-11-25' },
        days: Object.entries(planned).map(([date, uids]) => ({
            date,
            events: [],
            planned: uids,
            load_minutes: 0,
        })),
        tasks,
    }) as WeekFacts;

const task = (uid: string, fields: Partial<WeekTaskFact> = {}) =>
    ({ uid, name: `Task ${uid}`, ...fields }) as WeekTaskFact;

describe('placeOfTask', () => {
    const f = facts([], { '2026-11-20': ['planned'] });
    it.each([
        [
            'planned on a day',
            task('planned', { due: '2026-11-24' }),
            { kind: 'day', date: '2026-11-20' },
        ],
        [
            'overdue',
            task('late', { due: '2026-11-10', overdue: true }),
            { kind: 'overdue' },
        ],
        [
            'due in the period',
            task('due', { due: '2026-11-22T00:00:00Z' }),
            { kind: 'day', date: '2026-11-22' },
        ],
        [
            'this week',
            task('w', { week_of: '2026-11-16' }),
            { kind: 'horizon', key: 'week' },
        ],
        [
            'next week',
            task('n', { week_of: '2026-11-23' }),
            { kind: 'horizon', key: 'next_week' },
        ],
        [
            'this month',
            task('m', { month_of: '2026-11-01' }),
            { kind: 'horizon', key: 'this_month' },
        ],
        [
            'next month',
            task('nm', { month_of: '2026-12-01' }),
            { kind: 'horizon', key: 'next_month' },
        ],
        [
            'someday',
            task('s', { someday: true }),
            { kind: 'horizon', key: 'someday' },
        ],
        ['the inbox', task('i', { inbox: true }), { kind: 'inbox' }],
        ['nowhere', task('x'), { kind: 'none' }],
    ])('places a task %s', (_name, t, place) => {
        expect(placeOfTask(t, f)).toEqual(place);
    });
});

describe('places and decisions', () => {
    it('reads each decision as a place, and a place back as a decision', () => {
        expect(placeOfDecision({ op: 'plan_day', date: '2026-11-21' })).toEqual(
            {
                kind: 'day',
                date: '2026-11-21',
            }
        );
        expect(placeOfDecision({ op: 'later' })).toEqual({
            kind: 'horizon',
            key: 'someday',
        });
        expect(placeOfDecision({ op: 'done' })).toEqual({ kind: 'done' });
        expect(placeOfDecision({ op: 'keep' })).toBeNull();
        expect(decisionOfPlace({ kind: 'horizon', key: 'next_month' })).toEqual(
            {
                op: 'next_month',
            }
        );
        expect(decisionOfPlace({ kind: 'day', date: '2026-11-21' })).toEqual({
            op: 'plan_day',
            date: '2026-11-21',
        });
        expect(decisionOfPlace({ kind: 'inbox' })).toBeNull();
        expect(samePlace({ kind: 'done' }, { kind: 'done' })).toBe(true);
    });
});

describe('previewMoves', () => {
    const f = facts(
        [
            task('a', { estimate_min: 60 }),
            task('b', { week_of: '2026-11-16' }),
            task('c', { inbox: true }),
            task('d', { due: '2026-11-21' }),
        ],
        { '2026-11-19': ['a'] }
    );
    const rows: WeekChange[] = [
        {
            task_uid: 'a',
            op: 'plan_day',
            date: '2026-11-21',
            reason: 'Samedi libre',
        },
        { task_uid: 'b', op: 'plan_day', date: '2026-11-20', reason: '' },
        { task_uid: 'c', op: 'next_month', reason: 'Rien ne presse' },
        { task_uid: 'd', op: 'keep', reason: '' },
    ];

    it('gives each decided task its place before and after, and leaves kept ones out', () => {
        const moves = previewMoves(f, rows, new Map());
        expect(moves.map((m) => [m.uid, m.from, m.to])).toEqual([
            [
                'a',
                { kind: 'day', date: '2026-11-19' },
                { kind: 'day', date: '2026-11-21' },
            ],
            [
                'b',
                { kind: 'horizon', key: 'week' },
                { kind: 'day', date: '2026-11-20' },
            ],
            ['c', { kind: 'inbox' }, { kind: 'horizon', key: 'next_month' }],
        ]);
        expect(moves[0]).toMatchObject({
            minutes: 60,
            reason: 'Samedi libre',
            mine: false,
        });
        expect(moves[1].minutes).toBe(30);
    });

    it('follows the user decision, marks it, and drops a task sent back to keep', () => {
        const moves = previewMoves(
            f,
            rows,
            new Map([
                ['a', { op: 'done' as const }],
                ['b', { op: 'keep' as const }],
                ['d', { op: 'this_week' as const }],
            ])
        );
        expect(moves.map((m) => [m.uid, m.to, m.mine])).toEqual([
            ['a', { kind: 'done' }, true],
            ['c', { kind: 'horizon', key: 'next_month' }, false],
            ['d', { kind: 'horizon', key: 'week' }, true],
        ]);
    });
});
