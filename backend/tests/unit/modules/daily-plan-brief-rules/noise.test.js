'use strict';

const {
    noisyCardTypes,
} = require('../../../../modules/daily-plan/brief/rules/noise');
const { settingsWith } = require('./fixtures');

const settings = settingsWith({
    alerts: { noise: { minVotes: 3, ratio: 0.7 } },
});

describe('noisyCardTypes', () => {
    it('drops a card type with enough votes and a noise ratio at the threshold', () => {
        const noisy = noisyCardTypes(
            {
                conflict: { useful: 1, noise: 6 },
                overload: { useful: 0, noise: 3 },
            },
            settings
        );
        expect([...noisy].sort()).toEqual(['conflict', 'overload']);
    });

    it('keeps a card type below the ratio', () => {
        const noisy = noisyCardTypes(
            { conflict: { useful: 2, noise: 4 } },
            settings
        );
        expect(noisy.size).toBe(0);
    });

    it('keeps a card type with too few votes, however noisy', () => {
        const noisy = noisyCardTypes(
            { conflict: { useful: 0, noise: 2 } },
            settings
        );
        expect(noisy.size).toBe(0);
    });

    it('handles missing stats and a card type without votes', () => {
        expect(noisyCardTypes(undefined, settings).size).toBe(0);
        expect(
            noisyCardTypes({ conflict: { useful: 0, noise: 0 } }, settings).size
        ).toBe(0);
    });
});
