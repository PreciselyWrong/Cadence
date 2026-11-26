const { applyLegacyEnv } = require('../../../config/env-compat');

describe('applyLegacyEnv', () => {
    it('copies a legacy TUDUDI_ variable to its CADENCE_ name', () => {
        const env = { TUDUDI_SESSION_SECRET: 'old' };
        const found = applyLegacyEnv(env);
        expect(env.CADENCE_SESSION_SECRET).toBe('old');
        expect(found).toEqual(['TUDUDI_SESSION_SECRET']);
    });

    it('lets a non-empty CADENCE_ variable win over the legacy one', () => {
        const env = { TUDUDI_TRUST_PROXY: 'false', CADENCE_TRUST_PROXY: '1' };
        const found = applyLegacyEnv(env);
        expect(env.CADENCE_TRUST_PROXY).toBe('1');
        expect(found).toEqual(['TUDUDI_TRUST_PROXY']);
    });

    it('overrides an empty CADENCE_ variable with the legacy value', () => {
        const env = { TUDUDI_UPLOAD_PATH: '/data/up', CADENCE_UPLOAD_PATH: '' };
        applyLegacyEnv(env);
        expect(env.CADENCE_UPLOAD_PATH).toBe('/data/up');
    });

    it('ignores empty legacy values and unrelated variables', () => {
        const env = { TUDUDI_USER_EMAIL: '', PATH: '/bin' };
        const found = applyLegacyEnv(env);
        expect(found).toEqual([]);
        expect(env.CADENCE_USER_EMAIL).toBeUndefined();
        expect(env.PATH).toBe('/bin');
    });

    it('returns the sorted legacy names and never mutates legacy keys', () => {
        const env = { TUDUDI_B: 'b', TUDUDI_A: 'a' };
        expect(applyLegacyEnv(env)).toEqual(['TUDUDI_A', 'TUDUDI_B']);
        expect(env.TUDUDI_A).toBe('a');
    });
});
