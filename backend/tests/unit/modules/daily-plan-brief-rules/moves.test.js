'use strict';

const {
    proposalKey,
    moveProposals,
} = require('../../../../modules/daily-plan/brief/rules/moves');
const { TODAY, settingsWith, task, event, input } = require('./fixtures');

// Wednesday 2026-11-04 evening: 60 minutes. Thursday: 60 minutes too.
const CAPACITY = {
    capacity: {
        evening: {
            3: { start: '18:00', end: '22:00', minutes: 60 },
            4: { start: '18:00', end: '22:00', minutes: 60 },
        },
    },
};

const CAPACITY_120 = settingsWith({
    capacity: {
        evening: {
            3: { start: '18:00', end: '22:00', minutes: 120 },
            4: { start: '18:00', end: '22:00', minutes: 120 },
        },
    },
});

describe('moveProposals', () => {
    it('proposes the first later day for an overdue task', () => {
        const tasks = [
            task({
                uid: 'late',
                name: 'Relancer le devis fictif',
                due_date: '2026-11-01',
            }),
        ];
        const [move] = moveProposals(input({ tasks }), settingsWith());
        expect(move).toEqual({
            proposal_key: 'move:late:2026-11-01:2026-11-04',
            task_uid: 'late',
            from: '2026-11-01',
            to: TODAY,
            reason: 'En retard depuis le 1 novembre.',
            reason_code: 'overdue',
        });
    });

    it('skips a day that is overloaded', () => {
        const tasks = [
            task({
                uid: 'late',
                due_date: '2026-11-01',
                estimated_minutes: 50,
            }),
        ];
        const events = [
            event({ date: '2026-11-04', start_minute: 1140, end_minute: 1200 }),
        ];
        const [move] = moveProposals(
            input({ tasks, events }),
            settingsWith(CAPACITY)
        );
        // Today is 60 minutes of evening, one event of 60 minutes takes it all.
        expect(move.to).toBe('2026-11-05');
    });

    it('skips a date refused before for that task', () => {
        const tasks = [task({ uid: 'late', due_date: '2026-11-01' })];
        const decisions = [
            {
                kind: 'move',
                target_ref: 'late',
                decision: 'refused',
                fingerprint: proposalKey('late', '2026-11-01', TODAY),
                proposal: { to: TODAY },
            },
        ];
        const [move] = moveProposals(
            input({ tasks, decisions }),
            settingsWith()
        );
        expect(move.to).toBe('2026-11-05');
    });

    it('skips a proposal the user ignored, by fingerprint', () => {
        const tasks = [task({ uid: 'late', due_date: '2026-11-01' })];
        const decisions = [
            {
                kind: 'move',
                target_ref: 'late',
                decision: 'ignored',
                fingerprint: proposalKey('late', '2026-11-01', TODAY),
                proposal: { to: TODAY },
            },
        ];
        const [move] = moveProposals(
            input({ tasks, decisions }),
            settingsWith()
        );
        expect(move.to).toBe('2026-11-05');
    });

    it('moves tasks off an overloaded day, lowest priority first, only as many as needed', () => {
        const overloaded = [
            task({
                uid: 'keep',
                name: 'Garder',
                due_date: TODAY,
                estimated_minutes: 30,
                priority: 2,
            }),
            task({
                uid: 'leave',
                name: 'Partir',
                due_date: TODAY,
                estimated_minutes: 50,
                priority: 0,
            }),
            task({
                uid: 'extra',
                name: 'Autre',
                due_date: TODAY,
                estimated_minutes: 20,
                priority: 1,
            }),
        ];
        const result = moveProposals(
            input({ tasks: overloaded }),
            settingsWith(CAPACITY)
        );
        expect(result.map((m) => m.task_uid)).toEqual(['leave']);
        expect(result[0]).toMatchObject({ from: TODAY, to: '2026-11-05' });
    });

    it('caps the number of proposals at maxMoves', () => {
        const tasks = [1, 2, 3, 4].map((n) =>
            task({ uid: `late-${n}`, due_date: '2026-10-30' })
        );
        const moves = moveProposals(input({ tasks }), settingsWith());
        expect(moves).toHaveLength(3);
    });

    it('does not propose a day the task is already on', () => {
        const tasks = [
            task({ uid: 'late', due_date: '2026-11-01', planned_on: [TODAY] }),
        ];
        const [move] = moveProposals(input({ tasks }), settingsWith());
        expect(move.to).toBe('2026-11-05');
    });

    it('does not count events against the capacity when making a day fit', () => {
        const tasks = [
            task({
                uid: 'big',
                due_date: TODAY,
                estimated_minutes: 100,
            }),
            task({
                uid: 'small',
                due_date: TODAY,
                estimated_minutes: 40,
                priority: 2,
            }),
        ];
        const events = [event({ start_minute: 600, end_minute: 900 })];
        const moves = moveProposals(input({ tasks, events }), CAPACITY_120);
        expect(moves.map((m) => m.task_uid)).toEqual(['big']);
    });

    it('keeps track of what it already proposed for a day', () => {
        const overdue = ['a', 'b'].map((uid) =>
            task({
                uid,
                due_date: '2026-11-02',
                estimated_minutes: 80,
            })
        );
        const moves = moveProposals(input({ tasks: overdue }), CAPACITY_120);
        expect(new Set(moves.map((m) => m.to)).size).toBe(2);
    });

    it('marks an overdue reason as repeating the due date', () => {
        const [move] = moveProposals(
            input({ tasks: [task({ due_date: '2026-11-02' })] }),
            CAPACITY_120
        );
        expect(move.reason_code).toBe('overdue');
    });
});
