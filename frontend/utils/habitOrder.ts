import type { CadenceHabit } from './cadenceHabitsService';

// Moves a habit one place up (-1) or down (+1) within its group. `items` is
// the group in display order; the group is renumbered 0..n so that equal
// sort_order values cannot make a swap invisible. Returns only the rows
// whose sort_order changes.
export const moveHabitPatches = (
    items: CadenceHabit[],
    uid: string,
    delta: -1 | 1
): { uid: string; sort_order: number }[] => {
    const from = items.findIndex((item) => item.uid === uid);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return [];

    const order = [...items];
    [order[from], order[to]] = [order[to], order[from]];

    return order.flatMap((item, index) =>
        item.sort_order === index ? [] : [{ uid: item.uid, sort_order: index }]
    );
};
