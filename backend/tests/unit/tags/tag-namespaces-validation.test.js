const { validateTagName } = require('../../../modules/tags/validation');
const legacy = require('../../../modules/tags/tagsService');
const { ValidationError } = require('../../../shared/errors');

describe('tag namespace names', () => {
    it('accepts paths of any depth and trims each segment', () => {
        expect(validateTagName('perso/sport/course')).toBe(
            'perso/sport/course'
        );
        expect(validateTagName(' a / b ')).toBe('a/b');
        expect(validateTagName('a')).toBe('a');
    });

    it.each([
        ['leading slash', '/a'],
        ['trailing slash', 'a/'],
        ['double slash', 'a//b'],
        ['blank segment', 'a/ /b'],
        ['only a slash', '/'],
    ])('rejects an empty segment (%s)', (_label, name) => {
        expect(() => validateTagName(name)).toThrow(ValidationError);
    });

    it('rejects a segment longer than 50 characters', () => {
        expect(() => validateTagName(`a/${'x'.repeat(51)}`)).toThrow(
            ValidationError
        );
        expect(validateTagName(`a/${'x'.repeat(50)}`)).toBe(
            `a/${'x'.repeat(50)}`
        );
    });

    it('rejects a full path longer than 200 characters', () => {
        const segment = 'x'.repeat(50);
        const path = [segment, segment, segment, segment, 'y'].join('/');
        expect(path.length).toBeGreaterThan(200);
        expect(() => validateTagName(path)).toThrow(ValidationError);
    });

    it('still rejects forbidden characters inside a segment', () => {
        expect(() => validateTagName('perso/sp#rt')).toThrow(ValidationError);
    });

    it('keeps the {valid, name|error} shape for existing callers', () => {
        expect(legacy.validateTagName(' a/b ')).toEqual({
            valid: true,
            name: 'a/b',
        });
        expect(legacy.validateTagName('a//b')).toEqual({
            valid: false,
            error: expect.any(String),
        });
        expect(legacy.validateTagName('x#y').valid).toBe(false);
    });
});
