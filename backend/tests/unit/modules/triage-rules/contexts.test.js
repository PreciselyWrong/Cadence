'use strict';

const {
    isSilenced,
} = require('../../../../modules/triage/core/rules/contexts');

describe('isSilenced', () => {
    const contexts = [
        { scope: 'task', target_ref: 'task-a', text: 'Déjà fait ailleurs' },
        {
            scope: 'series',
            target_ref: 'series:feed-a:weekly',
            text: 'Salle partagée',
        },
    ];

    it('silences a target that has a context of the same scope', () => {
        expect(isSilenced({ scope: 'task', ref: 'task-a' }, contexts)).toBe(
            true
        );
        expect(
            isSilenced(
                { scope: 'series', ref: 'series:feed-a:weekly' },
                contexts
            )
        ).toBe(true);
    });

    it('does not silence another scope or another ref', () => {
        expect(isSilenced({ scope: 'event', ref: 'task-a' }, contexts)).toBe(
            false
        );
        expect(isSilenced({ scope: 'task', ref: 'task-b' }, contexts)).toBe(
            false
        );
    });

    it('is false without contexts or target', () => {
        expect(isSilenced({ scope: 'task', ref: 'task-a' }, [])).toBe(false);
        expect(isSilenced(null, contexts)).toBe(false);
    });
});
