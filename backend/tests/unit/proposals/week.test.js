'use strict';

const {
    MAX_TASKS,
    resolvePeriod,
    weekFacts,
} = require('../../../modules/proposals/core/week');
const {
    validateWeekAnswer,
    weekDecisionsOf,
    checkWeekDecisions,
} = require('../../../modules/proposals/core/week');
const { ValidationError } = require('../../../shared/errors');
const { validateAnswer } = require('../../../modules/proposals/core/answer');

const TODAY = '2026-11-16';
const PERIOD = { start: '2026-11-16', end: '2026-11-22' };
const WEEK = '2026-11-16';

const task = (uid, fields = {}) => ({
    uid,
    name: `Task ${uid}`,
    due: null,
    project: null,
    priority: null,
    estimate_min: null,
    week_of: null,
    in_view: false,
    someday: false,
    recurring: false,
    subtask: false,
    ...fields,
});

const facts = (tasks, plans = new Map(), events = []) =>
    weekFacts({
        today: TODAY,
        period: PERIOD,
        weekStart: WEEK,
        tasks,
        plans,
        events,
    });

describe('resolvePeriod', () => {
    it('defaults to seven days from today', () => {
        expect(resolvePeriod({ today: TODAY })).toEqual({
            start: '2026-11-16',
            end: '2026-11-22',
        });
    });

    it('accepts a period of up to 14 days', () => {
        expect(
            resolvePeriod({
                today: TODAY,
                start: '2026-11-16',
                end: '2026-11-29',
            })
        ).toMatchObject({ end: '2026-11-29' });
    });

    it('refuses a period longer than 14 days', () => {
        expect(() =>
            resolvePeriod({
                today: TODAY,
                start: '2026-11-16',
                end: '2026-11-30',
            })
        ).toThrow('at most 14 days');
    });

    it('refuses an end before the start and impossible dates', () => {
        expect(() =>
            resolvePeriod({
                today: TODAY,
                start: '2026-11-16',
                end: '2026-11-15',
            })
        ).toThrow('must not be before start');
        expect(() =>
            resolvePeriod({ today: TODAY, start: '2026-02-31' })
        ).toThrow('start must be YYYY-MM-DD');
    });
});

describe('weekFacts', () => {
    it('keeps overdue, due, decided, in-view and planned tasks, and nothing else', () => {
        const tasks = [
            task('overdue', { due: '2026-11-10' }),
            task('due', { due: '2026-11-18' }),
            task('decided', { week_of: WEEK }),
            task('view', { in_view: true }),
            task('planned'),
            task('far', { due: '2026-12-30' }),
        ];
        const plans = new Map([
            ['2026-11-17', [{ task_uid: 'planned', duration_minutes: 30 }]],
        ]);
        const { tasks: shown } = facts(tasks, plans);
        expect(shown.map((t) => t.uid)).toEqual([
            'overdue',
            'due',
            'planned',
            'decided',
            'view',
        ]);
    });

    it('never sends recurring tasks or subtasks', () => {
        const { tasks: shown } = facts([
            task('routine', { due: '2026-11-18', recurring: true }),
            task('step', { due: '2026-11-18', subtask: true }),
            task('plain', { due: '2026-11-18' }),
        ]);
        expect(shown.map((t) => t.uid)).toEqual(['plain']);
    });

    it('caps the task list and puts the overdue first', () => {
        const many = Array.from({ length: MAX_TASKS + 5 }, (_, i) =>
            task(`t${String(i).padStart(2, '0')}`, { due: '2026-11-20' })
        );
        many.push(task('late', { due: '2026-11-01' }));
        const { tasks: shown } = facts(many);
        expect(shown).toHaveLength(MAX_TASKS);
        expect(shown[0]).toMatchObject({ uid: 'late', overdue: true });
    });

    it('builds each day with its events, planned tasks and load', () => {
        const tasks = [
            task('a', {
                due: '2026-11-17',
                project: 'Maison',
                priority: 'high',
            }),
        ];
        const plans = new Map([
            [
                '2026-11-17',
                [
                    { task_uid: 'a', duration_minutes: 45 },
                    { task_uid: 'gone', duration_minutes: 15 },
                ],
            ],
        ]);
        const events = [
            { title: 'Dentiste', date: '2026-11-17', start: 'a', end: 'b' },
        ];
        const result = facts(tasks, plans, events);
        expect(result.days).toHaveLength(7);
        expect(result.days[1]).toEqual({
            date: '2026-11-17',
            events: [{ title: 'Dentiste', start: 'a', end: 'b' }],
            planned: ['a'],
            load_minutes: 60,
        });
        expect(result.tasks[0]).toEqual({
            uid: 'a',
            name: 'Task a',
            due: '2026-11-17',
            project: 'Maison',
            priority: 'high',
            week_of: undefined,
        });
    });
});

describe('validateWeekAnswer', () => {
    const base = weekFacts({
        today: TODAY,
        period: PERIOD,
        weekStart: WEEK,
        tasks: [
            task('a', { due: '2026-11-17' }),
            task('b', { due: '2026-11-18' }),
        ],
        plans: new Map(),
        events: [],
    });

    it('keeps valid changes and drops the rest', () => {
        const { answer } = validateAnswer('week', base, {
            headline: 'Mardi libre',
            questions: [{ id: 'q1', text: 'Mardi ?', choices: ['Oui', 'Non'] }],
            changes: [
                {
                    task_uid: 'a',
                    op: 'plan_day',
                    date: '2026-11-19',
                    reason: 'libre',
                },
                { task_uid: 'ghost', op: 'later', reason: 'unknown uid' },
                {
                    task_uid: 'b',
                    op: 'plan_day',
                    date: '2026-12-01',
                    reason: 'outside',
                },
                { task_uid: 'b', op: 'plan_day', reason: 'no date' },
                { task_uid: 'b', op: 'explode', reason: 'bad op' },
                { task_uid: 'b', op: 'later', reason: 'ok' },
                { task_uid: 'b', op: 'drop', reason: 'duplicate' },
            ],
        });
        expect(answer.changes).toEqual([
            {
                task_uid: 'a',
                op: 'plan_day',
                reason: 'libre',
                date: '2026-11-19',
            },
            { task_uid: 'b', op: 'later', reason: 'ok' },
        ]);
        expect(answer.questions).toEqual([
            { id: 'q1', text: 'Mardi ?', choices: ['Oui', 'Non'] },
        ]);
    });

    it('caps reasons at 100 characters, questions at three and drops ill-formed ones', () => {
        const raw = validateWeekAnswer(base, {
            questions: [
                { id: 'q1', text: 'one' },
                { id: 'q2', text: 'two' },
                { id: 'q3', text: 'three' },
                { id: 'q4', text: 'four' },
                { id: '', text: 'no id' },
            ],
            changes: [{ task_uid: 'a', op: 'later', reason: 'r'.repeat(300) }],
        });
        expect(raw.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
        expect(raw.changes[0].reason).toHaveLength(100);
    });

    it('strips control and invisible characters from text', () => {
        const { answer } = validateAnswer('week', base, {
            headline: 'ok‮evil\u0007​ done',
            changes: [],
        });
        expect(answer.headline).toBe('okevil done');
    });
});

describe('task goal and area', () => {
    it('carries the goal and the area of a task when they are linked', () => {
        const { tasks } = weekFacts({
            today: TODAY,
            period: PERIOD,
            weekStart: WEEK,
            tasks: [
                task('g', {
                    due: '2026-11-17',
                    goal: 'Courir un semi',
                    area: 'Santé',
                }),
                task('n', { due: '2026-11-17', goal: null, area: null }),
            ],
            plans: new Map(),
            events: [],
        });
        expect(tasks[0]).toMatchObject({
            goal: 'Courir un semi',
            area: 'Santé',
        });
        expect(tasks[1]).not.toHaveProperty('goal');
        expect(tasks[1]).not.toHaveProperty('area');
    });
});

describe('checkWeekDecisions', () => {
    const decisionFacts = weekFacts({
        today: TODAY,
        period: PERIOD,
        weekStart: WEEK,
        tasks: [
            task('a', { due: '2026-11-17' }),
            task('b', { due: '2026-11-18' }),
        ],
        plans: new Map(),
        events: [],
    });
    // The window is the period and the 30 days after its end.
    const LAST_DAY = '2026-12-22';

    it('takes the operation the user chose, even one the agent did not propose', () => {
        expect(
            checkWeekDecisions(decisionFacts, [
                { task_uid: 'a', op: 'later' },
                { task_uid: 'b', op: 'plan_day', date: '2026-11-20' },
            ])
        ).toEqual([
            { task_uid: 'a', op: 'later' },
            { task_uid: 'b', op: 'plan_day', date: '2026-11-20' },
        ]);
    });

    it('accepts keep, and a due date up to 30 days after the period', () => {
        expect(
            checkWeekDecisions(decisionFacts, [
                { task_uid: 'a', op: 'keep' },
                { task_uid: 'b', op: 'due', date: LAST_DAY },
            ])
        ).toEqual([
            { task_uid: 'a', op: 'keep' },
            { task_uid: 'b', op: 'due', date: LAST_DAY },
        ]);
    });

    it('drops the date of an operation that takes none', () => {
        expect(
            checkWeekDecisions(decisionFacts, [
                { task_uid: 'a', op: 'drop', date: '2026-11-20' },
            ])
        ).toEqual([{ task_uid: 'a', op: 'drop' }]);
    });

    it.each([
        ['a task outside the facts', [{ task_uid: 'zz', op: 'later' }]],
        ['an unknown operation', [{ task_uid: 'a', op: 'explode' }]],
        [
            'the same task twice',
            [
                { task_uid: 'a', op: 'later' },
                { task_uid: 'a', op: 'drop' },
            ],
        ],
        ['plan_day without a date', [{ task_uid: 'a', op: 'plan_day' }]],
        [
            'a date after the window',
            [{ task_uid: 'a', op: 'due', date: '2026-12-23' }],
        ],
        [
            'a date before the period',
            [{ task_uid: 'a', op: 'plan_day', date: '2026-11-15' }],
        ],
        [
            'a date that is not a day',
            [{ task_uid: 'a', op: 'due', date: '2026-02-30' }],
        ],
        ['a decision that is not an object', ['a']],
    ])('refuses %s', (_label, decisions) => {
        expect(() => checkWeekDecisions(decisionFacts, decisions)).toThrow(
            ValidationError
        );
    });
});

describe('weekDecisionsOf', () => {
    const decisionFacts = weekFacts({
        today: TODAY,
        period: PERIOD,
        weekStart: WEEK,
        tasks: [task('a', { due: '2026-11-17' })],
        plans: new Map(),
        events: [],
    });
    const answer = {
        changes: [
            { task_uid: 'a', op: 'plan_day', date: '2026-11-17', reason: 'r' },
        ],
    };

    it('keeps the decisions list when one is sent', () => {
        expect(
            weekDecisionsOf(decisionFacts, answer, {
                decisions: [{ task_uid: 'a', op: 'later' }],
            })
        ).toEqual([{ task_uid: 'a', op: 'later' }]);
    });

    it('turns the legacy task_uids into the agent operations', () => {
        expect(
            weekDecisionsOf(decisionFacts, answer, { task_uids: ['a'] })
        ).toEqual([{ task_uid: 'a', op: 'plan_day', date: '2026-11-17' }]);
    });

    it('refuses a legacy uid the agent did not propose, and a body with neither list', () => {
        expect(() =>
            weekDecisionsOf(decisionFacts, answer, { task_uids: ['b'] })
        ).toThrow(ValidationError);
        expect(() => weekDecisionsOf(decisionFacts, answer, {})).toThrow(
            ValidationError
        );
    });
});

describe('checkWeekNotes', () => {
    const noteFacts = { tasks: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }] };
    const { checkWeekNotes } = require('../../../modules/proposals/core/week');

    it('trims each note and keeps the task uid and text', () => {
        expect(
            checkWeekNotes(
                noteFacts,
                [{ task_uid: 'a', text: '  seconde passe  ' }],
                new Set()
            )
        ).toEqual([{ task_uid: 'a', text: 'seconde passe' }]);
    });

    it('refuses a note on a task that is not in the facts', () => {
        expect(() =>
            checkWeekNotes(noteFacts, [{ task_uid: 'z', text: 'x' }], new Set())
        ).toThrow('not in this proposal');
    });

    it('refuses a task decided and noted at once, and two notes on one task', () => {
        expect(() =>
            checkWeekNotes(
                noteFacts,
                [{ task_uid: 'a', text: 'x' }],
                new Set(['a'])
            )
        ).toThrow('both decided and noted');
        expect(() =>
            checkWeekNotes(
                noteFacts,
                [
                    { task_uid: 'a', text: 'x' },
                    { task_uid: 'a', text: 'y' },
                ],
                new Set()
            )
        ).toThrow('two notes');
    });

    it('refuses an empty note and one over 500 characters', () => {
        expect(() =>
            checkWeekNotes(
                noteFacts,
                [{ task_uid: 'a', text: '   ' }],
                new Set()
            )
        ).toThrow('1 to 500 characters');
        expect(() =>
            checkWeekNotes(
                noteFacts,
                [{ task_uid: 'a', text: 'x'.repeat(501) }],
                new Set()
            )
        ).toThrow('1 to 500 characters');
        expect(
            checkWeekNotes(
                noteFacts,
                [{ task_uid: 'a', text: 'x'.repeat(500) }],
                new Set()
            )
        ).toHaveLength(1);
    });

    it('refuses a notes value that is not a list', () => {
        expect(() => checkWeekNotes(noteFacts, 'x', new Set())).toThrow(
            'notes must be a list'
        );
    });
});

describe('restrictWeekFacts', () => {
    const {
        restrictWeekFacts,
    } = require('../../../modules/proposals/core/week');

    it('keeps the period, days and context, and only the noted tasks', () => {
        const restricted = restrictWeekFacts(
            {
                period: PERIOD,
                today: TODAY,
                days: [
                    {
                        date: '2026-11-17',
                        events: [{ title: 'Rdv' }],
                        planned: ['a', 'b'],
                        load_minutes: 45,
                    },
                ],
                tasks: [{ uid: 'a' }, { uid: 'b' }],
                goals: [{ uid: 'g1' }],
            },
            ['b']
        );
        expect(restricted.tasks).toEqual([{ uid: 'b' }]);
        expect(restricted.days[0]).toEqual({
            date: '2026-11-17',
            events: [{ title: 'Rdv' }],
            planned: ['b'],
            load_minutes: 45,
        });
        expect(restricted.period).toEqual(PERIOD);
        expect(restricted.goals).toEqual([{ uid: 'g1' }]);
    });

    it('lets a round-two answer change only the restricted tasks', () => {
        const restricted = restrictWeekFacts(
            {
                period: PERIOD,
                days: [],
                tasks: [{ uid: 'a' }, { uid: 'b' }],
            },
            ['b']
        );
        const answer = {
            headline: 'Deux',
            changes: [
                { task_uid: 'a', op: 'later', reason: 'autre' },
                { task_uid: 'b', op: 'later', reason: 'noté' },
            ],
        };
        expect(validateWeekAnswer(restricted, answer).changes).toEqual([
            { task_uid: 'b', op: 'later', reason: 'noté' },
        ]);
    });
});
