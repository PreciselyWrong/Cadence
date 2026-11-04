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
    it('orders by the default priorities: consequence, blocking, money, planned, project', () => {
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
            task({ uid: 'project', project_name: 'Maison fictive' }),
        ];
        const settings = settingsWith({
            priorities: [
                'long_term',
                'consequence',
                'blocking',
                'money_deadline',
                'planned_load',
            ],
        });
        expect(picksFor(tasks, settings).map((p) => p.task_uid)).toEqual([
            'project',
            'due',
        ]);
    });

    it('keeps only what fits the evening capacity, skipping what does not', () => {
        const tasks = [
            task({ uid: 'a', due_date: '2026-11-05', estimated_minutes: 50 }),
            task({ uid: 'b', blocks_uids: ['x'], estimated_minutes: 40 }),
            task({
                uid: 'c',
                project_name: 'Maison fictive',
                estimated_minutes: 10,
            }),
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
