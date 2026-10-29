const hlc = require('../../modules/sync/hlc');

describe('sync hybrid logical clock', () => {
    it('carries a full counter into the milliseconds', () => {
        const future = Date.now() + 60_000;
        hlc.observe(`${String(future).padStart(13, '0')}-9999-devA`);

        const next = hlc.now();

        expect(hlc.parse(next)).toEqual({
            ms: future + 1,
            counter: 0,
            node: 'server',
        });
        expect(next > `${String(future).padStart(13, '0')}-9999-devA`).toBe(
            true
        );
    });
});
