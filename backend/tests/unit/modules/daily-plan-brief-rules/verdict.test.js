'use strict';

const {
    verdictText,
} = require('../../../../modules/daily-plan/brief/rules/verdict');

const base = {
    due_today: 0,
    overdue: 0,
    tonight_minutes: 0,
    capacity_minutes: null,
    conflicts: 0,
    replies: 0,
};

describe('verdictText', () => {
    it('says nothing urgent when all counters are zero', () => {
        expect(verdictText(base)).toBe('Rien d’urgent aujourd’hui.');
    });

    it('joins the counters into one French sentence', () => {
        expect(
            verdictText({
                ...base,
                overdue: 2,
                due_today: 1,
                conflicts: 1,
                tonight_minutes: 90,
            })
        ).toBe(
            '2 tâches en retard, 1 tâche due aujourd’hui, 1 conflit d’agenda, 90 min à caser ce soir.'
        );
    });

    it('uses the singular for one reply', () => {
        expect(verdictText({ ...base, replies: 1 })).toBe(
            '1 réponse en attente.'
        );
    });
});
