'use strict';

const {
    MAX_TASKS,
    resolvePeriod,
    weekFacts,
} = require('../../../modules/proposals/core/week');
const { validateWeekAnswer } = require('../../../modules/proposals/core/week');
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
            summary: 'Mardi libre.',
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

    it('caps the summary, reasons, questions and drops ill-formed questions', () => {
        const raw = validateWeekAnswer(base, {
            summary: 'x'.repeat(400),
            questions: [
                { id: 'q1', text: 'one' },
                { id: 'q2', text: 'two' },
                { id: 'q3', text: 'three' },
                { id: 'q4', text: 'four' },
                { id: '', text: 'no id' },
            ],
            changes: [{ task_uid: 'a', op: 'later', reason: 'r'.repeat(300) }],
        });
        expect(raw.summary).toHaveLength(300);
        expect(raw.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
        expect(raw.changes[0].reason).toHaveLength(140);
    });

    it('strips control and invisible characters from text', () => {
        const { summary } = validateWeekAnswer(base, {
            summary: 'ok‮evil\u0007​ done',
            changes: [],
        });
        expect(summary).toBe('okevil done');
    });
});
