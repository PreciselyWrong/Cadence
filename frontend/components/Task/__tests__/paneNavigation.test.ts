import { neighbourTaskUid } from '../paneNavigation';

describe('neighbourTaskUid', () => {
    const uids = ['a', 'b', 'c'];

    it('gives the next uid for step 1 and the previous for step -1', () => {
        expect(neighbourTaskUid(uids, 'a', 1)).toBe('b');
        expect(neighbourTaskUid(uids, 'c', -1)).toBe('b');
    });

    it('gives nothing past either end of the list', () => {
        expect(neighbourTaskUid(uids, 'c', 1)).toBeNull();
        expect(neighbourTaskUid(uids, 'a', -1)).toBeNull();
    });

    it('opens the first uid with step 1 when the open task is not listed', () => {
        expect(neighbourTaskUid(uids, 'missing', 1)).toBe('a');
    });

    it('gives nothing with step -1 when the open task is not listed', () => {
        expect(neighbourTaskUid(uids, 'missing', -1)).toBeNull();
    });

    it('gives nothing for an empty list', () => {
        expect(neighbourTaskUid([], 'a', 1)).toBeNull();
    });

    it('ignores repeated uids so a task shown twice is not a neighbour of itself', () => {
        expect(neighbourTaskUid(['a', 'b', 'b', 'c'], 'a', 1)).toBe('b');
        expect(neighbourTaskUid(['a', 'b', 'a', 'c'], 'b', 1)).toBe('c');
        expect(neighbourTaskUid(['a', 'a', 'b'], 'b', -1)).toBe('a');
    });
});
