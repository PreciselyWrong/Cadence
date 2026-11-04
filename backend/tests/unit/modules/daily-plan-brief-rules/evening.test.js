'use strict';

const {
    buildEvening,
} = require('../../../../modules/daily-plan/brief/rules/evening');
const { TODAY, settingsWith, task, input } = require('./fixtures');

const NOW = '2026-11-04T17:30:00.000Z';
const TOMORROW = '2026-11-05';

// Closed at 10:00 Paris time on the given day.
const closed = (uid, day = TODAY, name = `Fait ${uid}`) => ({
    uid,
    name,
    note: null,
    completed_at: `${day}T09:00:00.000Z`,
});

const review = (overrides = {}, morningBrief = null) =>
    buildEvening(input(overrides), settingsWith(), morningBrief, NOW);

describe('buildEvening', () => {
    it('lists the tasks completed today, newest first, capped at ten', () => {
        const closedTasks = [
            closed('old', '2026-11-03'),
            ...Array.from({ length: 12 }, (_, i) => ({
                uid: `done-${String(i).padStart(2, '0')}`,
                name: `Fait ${i}`,
                note: null,
                completed_at: `${TODAY}T${String(8 + (i % 9)).padStart(2, '0')}:00:00.000Z`,
            })),
        ];
        const result = review({ closedTasks });

        expect(result.done).toHaveLength(10);
        expect(result.done).not.toContain('old');
        expect(result.counters.done).toBe(12);
        const times = result.done.map(
            (uid) => closedTasks.find((c) => c.uid === uid).completed_at
        );
        expect(times).toEqual([...times].sort().reverse());
    });

    it('keeps the morning tonight items that are still open, in their order', () => {
        const tasks = [
            task({ uid: 'a', name: 'Alpha', due_date: TODAY }),
            task({ uid: 'b', name: 'Bravo', due_date: TODAY }),
        ];
        const morning = {
            tonight: [
                { task_uid: 'b', reason: 'x', minutes: 20 },
                { task_uid: 'gone', reason: 'x', minutes: 10 },
                { task_uid: 'a', reason: 'x', minutes: 30 },
            ],
        };
        const result = review({ tasks }, morning);

        expect(result.tonight).toEqual([
            { task_uid: 'b', minutes: 20 },
            { task_uid: 'a', minutes: 30 },
        ]);
        expect(result.counters.tonight_minutes).toBe(50);
        expect(result.slipped).toEqual([]);
    });

    it('has an empty tonight list when no morning brief exists, and slips what is due or planned today', () => {
        const tasks = [
            task({ uid: 'due', name: 'Due', due_date: TODAY }),
            task({ uid: 'planned', name: 'Planned', planned_on: [TODAY] }),
            task({ uid: 'later', name: 'Later', due_date: TOMORROW }),
        ];
        const result = review({ tasks }, null);

        expect(result.tonight).toEqual([]);
        expect(result.slipped.map((item) => item.task_uid)).toEqual([
            'due',
            'planned',
        ]);
        expect(result.slipped[0].reason).toContain('Due aujourd’hui');
        expect(result.slipped[1].reason).toContain('Prévue aujourd’hui');
    });

    it('also slips the open tasks overdue from earlier days, oldest first', () => {
        const tasks = [
            task({ uid: 'today', name: 'Today', due_date: TODAY }),
            task({ uid: 'monday', name: 'Monday', due_date: '2026-11-02' }),
            task({ uid: 'october', name: 'October', due_date: '2026-10-28' }),
        ];
        const result = review({ tasks }, null);

        expect(result.slipped.map((item) => item.task_uid)).toEqual([
            'october',
            'monday',
            'today',
        ]);
        expect(result.slipped[0].reason).toContain('28 octobre');
        expect(result.counters.slipped).toBe(3);
        expect(result.carry_over).toEqual(['october', 'monday', 'today']);
    });

    it('never lists a tonight task as slipped', () => {
        const tasks = [task({ uid: 'a', name: 'Alpha', due_date: TODAY })];
        const morning = {
            tonight: [{ task_uid: 'a', reason: 'x', minutes: 30 }],
        };
        const result = review({ tasks }, morning);

        expect(result.slipped).toEqual([]);
    });

    it('proposes for tomorrow the slipped tasks, then the tonight tasks', () => {
        const tasks = [
            task({ uid: 'due', name: 'Due', due_date: TODAY }),
            task({ uid: 'picked', name: 'Picked', due_date: TODAY }),
        ];
        const morning = {
            tonight: [{ task_uid: 'picked', reason: 'x', minutes: 30 }],
        };
        const result = review({ tasks }, morning);

        expect(result.carry_over).toEqual(['due', 'picked']);
    });

    it('builds tomorrow as one timeline day with its tasks and load', () => {
        const tasks = [
            task({
                uid: 'tomo',
                name: 'Demain',
                due_date: TOMORROW,
                estimated_minutes: 45,
            }),
        ];
        const result = review({ tasks });

        expect(result.tomorrow.date).toBe(TOMORROW);
        expect(result.tomorrow.task_uids).toEqual(['tomo']);
        expect(result.tomorrow.load.planned_minutes).toBe(45);
        expect(result.tomorrow.load.hypothesis).toBe(true);
    });

    it('reads the evening capacity of today for the counters', () => {
        const settings = settingsWith({
            capacity: {
                evening: { 3: { start: '18:00', end: '22:00', minutes: 120 } },
            },
        });
        const result = buildEvening(input({}), settings, null, NOW);

        expect(result.counters.capacity_minutes).toBe(120);
    });

    it('writes a verdict from the counters in French', () => {
        const tasks = [task({ uid: 'due', name: 'Due', due_date: TODAY })];
        const result = review({ tasks, closedTasks: [closed('x')] }, null);

        expect(result.verdict).toEqual({
            text: '1 tâche terminée aujourd’hui, 1 glisse vers demain.',
            by: 'rules',
        });
    });

    it('says nothing is left when the day is empty', () => {
        expect(review({}).verdict.text).toBe('Rien à reprendre ce soir.');
    });

    it('speaks the four chapters with spelled numbers and no digits', () => {
        const tasks = [
            task({
                uid: 'due',
                name: 'Relire le plan',
                due_date: TODAY,
                estimated_minutes: 90,
            }),
        ];
        const result = review(
            { tasks, closedTasks: [closed('x', TODAY, 'Envoyer la note')] },
            null
        );
        const ids = result.audio_script.chapters.map((chapter) => chapter.id);

        expect(ids).toEqual(['intro', 'done', 'tomorrow']);
        const spoken = result.audio_script.chapters
            .map((c) => c.text)
            .join(' ');
        expect(spoken).not.toMatch(/\d/);
        expect(spoken).toContain('Envoyer la note');
    });
});
