import {
    descriptionPreview,
    readShowTaskDescription,
    writeShowTaskDescription,
} from '../taskRowDisplay';

describe('task row description', () => {
    beforeEach(() => window.localStorage.clear());

    it('is off by default and remembers the choice on this device', () => {
        expect(readShowTaskDescription()).toBe(false);

        writeShowTaskDescription(true);
        expect(readShowTaskDescription()).toBe(true);

        writeShowTaskDescription(false);
        expect(readShowTaskDescription()).toBe(false);
    });

    it('previews the first two text lines of a note without markdown marks', () => {
        const note = '# Plan\n\n- call the bank\n- send the form\n- ignored';

        expect(descriptionPreview(note)).toBe('Plan\ncall the bank');
    });

    it('returns nothing for a blank note', () => {
        expect(descriptionPreview('  \n ')).toBeNull();
        expect(descriptionPreview(undefined)).toBeNull();
    });
});
