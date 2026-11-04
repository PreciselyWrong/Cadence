'use strict';

const {
    defaultSettings,
    normalizeAgentSettings,
    validateAgentSettings,
} = require('../../../../modules/agents/settings');

const validRule = (overrides = {}) => ({
    id: 'rule-newsletters',
    match: { from: 'news@example.test', label: 'Newsletter', type: 'mail' },
    instruction: 'Propose archiving after reading.',
    mode: 'propose',
    ...overrides,
});

describe('agent settings defaults', () => {
    it('uses the documented defaults when nothing is stored', () => {
        expect(defaultSettings()).toEqual({
            baseUrl: '',
            timeoutSeconds: 120,
            profiles: { mail: '', drafting: '' },
            triageRules: [],
        });
        expect(normalizeAgentSettings(undefined)).toEqual(defaultSettings());
        expect(normalizeAgentSettings('not an object')).toEqual(
            defaultSettings()
        );
    });

    it('returns a fresh object each time', () => {
        const first = defaultSettings();
        first.profiles.mail = 'changed';
        expect(defaultSettings().profiles.mail).toBe('');
    });
});

describe('normalizeAgentSettings (stored values)', () => {
    it('keeps valid fields and resets only the invalid ones', () => {
        const normalized = normalizeAgentSettings({
            baseUrl: 'javascript:alert(1)',
            timeoutSeconds: 45,
            profiles: { mail: 'Mail Profile!' },
            triageRules: 'nope',
        });

        expect(normalized.baseUrl).toBe('');
        expect(normalized.timeoutSeconds).toBe(45);
        expect(normalized.profiles).toEqual({ mail: '', drafting: '' });
        expect(normalized.triageRules).toEqual([]);
    });
});

describe('validateAgentSettings (writes)', () => {
    const base = () => defaultSettings();

    it('accepts a complete valid object and trims the base URL', () => {
        const validated = validateAgentSettings({
            ...base(),
            baseUrl: ' https://agents.example.test/hermes/ ',
            profiles: { mail: 'mail-main', drafting: 'drafts_1' },
            triageRules: [validRule()],
        });

        expect(validated.baseUrl).toBe('https://agents.example.test/hermes');
        expect(validated.profiles).toEqual({
            mail: 'mail-main',
            drafting: 'drafts_1',
        });
        expect(validated.triageRules).toHaveLength(1);
    });

    it('accepts an empty base URL and a loopback or private host', () => {
        expect(validateAgentSettings(base()).baseUrl).toBe('');
        expect(
            validateAgentSettings({
                ...base(),
                baseUrl: 'http://127.0.0.1:9000',
            }).baseUrl
        ).toBe('http://127.0.0.1:9000');
        expect(
            validateAgentSettings({ ...base(), baseUrl: 'http://10.0.0.20' })
                .baseUrl
        ).toBe('http://10.0.0.20');
    });

    it.each([
        ['a non-http scheme', 'ftp://agents.example.test'],
        ['credentials in the URL', 'https://user:secret@agents.example.test'],
        ['a query string', 'https://agents.example.test/?token=abc'],
        ['a link-local address', 'http://169.254.169.254'],
        ['a link-local IPv6 address', 'http://[fe80::1]'],
        ['a metadata host name', 'http://metadata.google.internal'],
        ['a malformed URL', 'http://'],
    ])('refuses a base URL with %s', (_label, baseUrl) => {
        expect(() => validateAgentSettings({ ...base(), baseUrl })).toThrow(
            /baseUrl/
        );
    });

    it('refuses a base URL longer than 300 characters', () => {
        const baseUrl = `https://agents.example.test/${'a'.repeat(300)}`;
        expect(() => validateAgentSettings({ ...base(), baseUrl })).toThrow(
            /at most 300/
        );
    });

    it.each([9, 601, 120.5, '60s'])(
        'refuses timeoutSeconds %p outside 10-600 integers',
        (timeoutSeconds) => {
            expect(() =>
                validateAgentSettings({ ...base(), timeoutSeconds })
            ).toThrow(/timeoutSeconds/);
        }
    );

    it.each(['Mail', '-mail', 'mail profile', 'a'.repeat(41)])(
        'refuses the profile name %p',
        (name) => {
            expect(() =>
                validateAgentSettings({
                    ...base(),
                    profiles: { mail: name },
                })
            ).toThrow(/profile name/);
        }
    );

    it('refuses unknown profile keys and unknown top-level settings', () => {
        expect(() =>
            validateAgentSettings({
                ...base(),
                profiles: { sending: 'x' },
            })
        ).toThrow(/Unknown profile key/);
        expect(() => validateAgentSettings({ ...base(), extra: true })).toThrow(
            /Unknown setting/
        );
    });

    it('refuses more than 50 triage rules', () => {
        const triageRules = Array.from({ length: 51 }, (_, index) =>
            validRule({ id: `rule-${index}` })
        );
        expect(() => validateAgentSettings({ ...base(), triageRules })).toThrow(
            /at most 50/
        );
    });

    it('validates each triage rule shape and caps', () => {
        expect(() =>
            validateAgentSettings({
                ...base(),
                triageRules: [validRule({ mode: 'send' })],
            })
        ).toThrow(/mode/);
        expect(() =>
            validateAgentSettings({
                ...base(),
                triageRules: [validRule({ id: '' })],
            })
        ).toThrow(/id/);
        expect(() =>
            validateAgentSettings({
                ...base(),
                triageRules: [validRule({ instruction: 'x'.repeat(501) })],
            })
        ).toThrow(/instruction/);
        expect(() =>
            validateAgentSettings({
                ...base(),
                triageRules: [
                    validRule({
                        match: { from: 'f'.repeat(201), label: '', type: '' },
                    }),
                ],
            })
        ).toThrow(/match.from/);
    });
});
