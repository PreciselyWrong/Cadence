import { extractUidFromSlug } from '../slugUtils';

const UUID = '3f2a9c1e-7b4d-4e8a-9f01-2c3d4e5f6a7b';

describe('extractUidFromSlug', () => {
    it('reads a server uid before its slug', () => {
        expect(extractUidFromSlug('abcd1234efghijk-clean-the-yard')).toBe(
            'abcd1234efghijk'
        );
    });

    it('reads a whole UUID from a row created on Android', () => {
        expect(extractUidFromSlug(UUID)).toBe(UUID);
        expect(extractUidFromSlug(`${UUID}-clean-the-yard`)).toBe(UUID);
    });
});
