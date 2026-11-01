const { isValidUid, extractUidFromSlug } = require('../../../utils/slug-utils');

// Rows created offline on Android carry a UUID uid; the server makes 15-char
// uids. Both are real uids and must be found by the REST and MCP routes.
const UUID = '3f2a9c1e-7b4d-4e8a-9f01-2c3d4e5f6a7b';

describe('slug-utils', () => {
    describe('isValidUid', () => {
        it('accepts a server uid', () => {
            expect(isValidUid('abcd1234efghijk')).toBe(true);
        });

        it('accepts a UUID made by a client', () => {
            expect(isValidUid(UUID)).toBe(true);
            expect(isValidUid(UUID.toUpperCase())).toBe(true);
        });

        it('rejects anything else', () => {
            expect(isValidUid('invalid-uid')).toBe(false);
            expect(isValidUid(`${UUID}-x`)).toBe(false);
            expect(isValidUid('')).toBe(false);
            expect(isValidUid(undefined)).toBe(false);
        });
    });

    describe('extractUidFromSlug', () => {
        it('reads a server uid before its slug', () => {
            expect(extractUidFromSlug('abcd1234efghijk-clean-the-yard')).toBe(
                'abcd1234efghijk'
            );
        });

        it('reads a whole UUID, alone or before its slug', () => {
            expect(extractUidFromSlug(UUID)).toBe(UUID);
            expect(extractUidFromSlug(`${UUID}-clean-the-yard`)).toBe(UUID);
        });
    });
});
