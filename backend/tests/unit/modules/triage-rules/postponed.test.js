'use strict';

const {
    postponedCards,
} = require('../../../../modules/triage/core/rules/postponed');
const { settingsWith, task, input } = require('./fixtures');

describe('postponedCards', () => {
    const tasks = [task({ uid: 'task-a', name: 'Ranger le garage fictif' })];

    it('proposes dropping it once the threshold is reached', () => {
        const [card] = postponedCards(
            input({
                tasks,
                postponements: {
                    'task-a': {
                        recent_count: 3,
                        last_planned_for: '2026-11-02',
                    },
                },
            }),
            settingsWith()
        );
        expect(card).toMatchObject({
            type: 'postponed',
            task_uids: ['task-a'],
            question: null,
        });
        expect(card.text).toBe('Reportée 3 fois récemment : l’abandonner ?');
    });

    it('stays silent below the threshold', () => {
        expect(
            postponedCards(
                input({
                    tasks,
                    postponements: { 'task-a': { recent_count: 2 } },
                }),
                settingsWith()
            )
        ).toEqual([]);
    });

    it('uses the threshold from settings', () => {
        expect(
            postponedCards(
                input({
                    tasks,
                    postponements: { 'task-a': { recent_count: 2 } },
                }),
                settingsWith({ thresholds: { postponements: 2 } })
            )
        ).toHaveLength(1);
    });
});
