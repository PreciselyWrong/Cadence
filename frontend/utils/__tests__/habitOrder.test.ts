import { moveHabitPatches } from '../habitOrder';
import type { CadenceHabit } from '../cadenceHabitsService';

const habit = (uid: string, sort_order: number) =>
    ({ uid, sort_order }) as CadenceHabit;

describe('moveHabitPatches', () => {
    // Items are in display order; their sort_order values may repeat.
    const items = [habit('a', 0), habit('b', 0), habit('c', 5)];

    it('swaps a habit with the one above, renumbering the group', () => {
        expect(moveHabitPatches(items, 'b', -1)).toEqual([
            { uid: 'a', sort_order: 1 },
            { uid: 'c', sort_order: 2 },
        ]);
    });

    it('moves a habit down past its neighbour', () => {
        expect(moveHabitPatches(items, 'b', 1)).toEqual([
            { uid: 'c', sort_order: 1 },
            { uid: 'b', sort_order: 2 },
        ]);
    });

    it('returns nothing past either end of the group', () => {
        expect(moveHabitPatches(items, 'a', -1)).toEqual([]);
        expect(moveHabitPatches(items, 'c', 1)).toEqual([]);
    });

    it('returns nothing for a habit outside the group', () => {
        expect(moveHabitPatches(items, 'zzz', 1)).toEqual([]);
    });
});
