const {
    withDefaults,
    applySettingsUpdate,
} = require('../../../../modules/plugins/core/settings');

const schema = [
    { key: 'url', type: 'string', label: 'URL', required: true },
    { key: 'secret', type: 'secret', label: 'Secret' },
    { key: 'notes', type: 'boolean', label: 'Notes', default: false },
    { key: 'limit', type: 'number', label: 'Limit', default: 5 },
    {
        key: 'mode',
        type: 'select',
        label: 'Mode',
        options: ['a', 'b'],
        default: 'a',
    },
];

describe('plugin settings', () => {
    it('fills defaults for what is missing', () => {
        expect(withDefaults(schema, { url: 'https://x.test' })).toEqual({
            url: 'https://x.test',
            secret: null,
            notes: false,
            limit: 5,
            mode: 'a',
        });
    });

    it('ignores keys the manifest does not declare', () => {
        const result = applySettingsUpdate(schema, {}, { url: 'u', rogue: 1 });
        expect(result.ok).toBe(true);
        expect(result.values).not.toHaveProperty('rogue');
    });

    it('keeps a secret that the update leaves out, replaces or clears it', () => {
        const current = { url: 'u', secret: 'old' };
        expect(
            applySettingsUpdate(schema, current, { url: 'v' }).values.secret
        ).toBe('old');
        expect(
            applySettingsUpdate(schema, current, { secret: 'new' }).values
                .secret
        ).toBe('new');
        expect(
            applySettingsUpdate(schema, current, { secret: null }).values.secret
        ).toBeUndefined();
    });

    it('does not take the empty string for a new secret', () => {
        const current = { url: 'u', secret: 'old' };
        expect(
            applySettingsUpdate(schema, current, { secret: '' }).values.secret
        ).toBe('old');
    });

    it.each([
        ['a number that is text', { limit: 'abc' }],
        ['a boolean that is text', { notes: 'yes' }],
        ['a select outside its options', { mode: 'z' }],
        ['a string that is a number', { url: 3 }],
        ['a string over 2000 characters', { url: 'x'.repeat(2001) }],
    ])('rejects %s', (_label, input) => {
        const result = applySettingsUpdate(schema, {}, input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/\S/);
    });

    it('reports required fields that are still empty only when asked', () => {
        expect(applySettingsUpdate(schema, {}, {}).missing).toEqual(['url']);
        expect(applySettingsUpdate(schema, {}, { url: 'u' }).missing).toEqual(
            []
        );
    });
});
