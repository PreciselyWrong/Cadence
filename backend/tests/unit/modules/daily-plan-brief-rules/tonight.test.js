'use strict';

const {
    tonightPicks,
} = require('../../../../modules/daily-plan/brief/rules/tonight');
const { dayLoad } = require('../../../../modules/daily-plan/brief/rules/load');
const { TODAY, settingsWith, task, input } = require('./fixtures');

const evening = (minutes) => ({
    capacity: { evening: { 3: { start: '18:00', end: '22:00', minutes } } },
});

const picksFor = (tasks, settings = settingsWith(), capacityMinutes = null) => {
    const data = input({ tasks });
    const load = dayLoad(data, settings, TODAY);
    return tonightPicks(data, settings, {
        ...load,
        capacity_minutes: capacityMinutes,
    });
};

describe('tonightPicks', () => {
    it('orders by the default priorities: consequence, blocking, money, planned', () => {
        const tasks = [
            task({
                uid: 'project',
                name: 'Projet',
                project_name: 'Maison fictive',
            }),
            task({
                uid: 'money',
                name: 'Facture',
                money: true,
                due_date: '2026-11-20',
            }),
            task({ uid: 'blocking', name: 'Bloquant', blocks_uids: ['x'] }),
            task({ uid: 'due', name: 'Demain', due_date: '2026-11-05' }),
        ];
        expect(picksFor(tasks).map((p) => p.task_uid)).toEqual([
            'due',
            'blocking',
            'money',
        ]);
    });

    it('follows the priority order from settings', () => {
        const tasks = [
            task({ uid: 'due', due_date: '2026-11-05' }),
            task({ uid: 'blocking', blocks_uids: ['x'] }),
        ];
        const settings = settingsWith({
            priorities: [
                'blocking',
                'consequence',
                'money_deadline',
                'planned_load',
            ],
        });
        expect(picksFor(tasks, settings).map((p) => p.task_uid)).toEqual([
            'blocking',
            'due',
        ]);
    });

    it('does not pick a task only because it belongs to a project', () => {
        const tasks = [task({ uid: 'p', project_name: 'Maison fictive' })];
        expect(picksFor(tasks)).toEqual([]);
    });

    it('keeps only what fits the capacity, skipping what does not', () => {
        const tasks = [
            task({ uid: 'a', due_date: '2026-11-05', estimated_minutes: 50 }),
            task({ uid: 'b', blocks_uids: ['x'], estimated_minutes: 40 }),
            task({ uid: 'c', planned_on: [TODAY], estimated_minutes: 10 }),
        ];
        const settings = settingsWith(evening(60));
        const picks = picksFor(tasks, settings, 60);
        expect(picks.map((p) => p.task_uid)).toEqual(['a', 'c']);
        expect(picks.reduce((s, p) => s + p.minutes, 0)).toBe(60);
    });

    it('defaults to 30 minutes for a task without estimate', () => {
        const [pick] = picksFor([task({ due_date: '2026-11-05' })]);
        expect(pick.minutes).toBe(30);
    });

    it('states the reason in French', () => {
        const [pick] = picksFor([task({ due_date: TODAY })]);
        expect(pick.reason).toBe('Due aujourd’hui');
    });

    it('tells clients which reasons only repeat the due date', () => {
        const code = (fields) => picksFor([task(fields)])[0].reason_code;
        expect(code({ due_date: '2026-11-01' })).toBe('overdue');
        expect(code({ due_date: TODAY })).toBe('due_today');
        expect(code({ due_date: '2026-11-05' })).toBe('due_tomorrow');
        expect(code({ blocks_uids: ['x'] })).toBe('blocking');
        expect(code({ planned_on: [TODAY] })).toBe('planned');
        expect(code({ money: true, due_date: '2026-11-20' })).toBe('money');
    });

    it('names a money deadline without repeating its date', () => {
        const [pick] = picksFor([
            task({ money: true, due_date: '2026-11-20' }),
        ]);
        expect(pick.reason).toBe('Échéance d’argent');
    });

    it('ignores waiting tasks and tasks with no criterion', () => {
        const tasks = [
            task({ uid: 'waiting', due_date: '2026-11-05', status: 'waiting' }),
            task({ uid: 'plain' }),
        ];
        expect(picksFor(tasks)).toEqual([]);
    });

    it('is limited to maxTonight', () => {
        const tasks = [1, 2, 3, 4].map((n) =>
            task({ uid: `t${n}`, due_date: '2026-11-05' })
        );
        expect(picksFor(tasks)).toHaveLength(3);
    });
});
