const { normalizeIcon } = require('../../../utils/icon-validation');
const { ValidationError } = require('../../../shared/errors');

describe('normalizeIcon', () => {
    it.each([
        ['home', 'home'],
        ['smoke-free', 'smoke-free'],
        ['bike2', 'bike2'],
        ['a'.repeat(40), 'a'.repeat(40)],
    ])('accepts %s', (input, expected) => {
        expect(normalizeIcon(input)).toBe(expected);
    });

    it.each([null, '', undefined])('clears to null for %p', (input) => {
        expect(normalizeIcon(input)).toBeNull();
    });

    it.each([
        ['uppercase', 'Home'],
        ['punctuation', 'Home!'],
        ['41 characters', 'a'.repeat(41)],
        ['leading dash', '-home'],
        ['trailing dash', 'home-'],
        ['double dash', 'smoke--free'],
        ['space', 'smoke free'],
        ['not a string', 42],
    ])('rejects %s', (_label, input) => {
        expect(() => normalizeIcon(input)).toThrow(ValidationError);
    });
});
