import { create } from 'zustand';

// Several tasks picked in a list (Ctrl/Cmd click, Shift click for a range)
// for one action on all of them. One selection for the whole app: the
// selection bar in the layout acts on it, a page change clears it.
interface TaskSelectionState {
    uids: string[];
    // The last row clicked without Shift: a Shift click selects from here.
    anchor: string | null;
    toggle: (uid: string) => void;
    selectRange: (uid: string, order: string[]) => void;
    clear: () => void;
}

// The uids between `anchor` and `uid` in the list's order, both included.
// Without an anchor on the page, only `uid`.
export const rangeBetween = (
    order: string[],
    anchor: string | null,
    uid: string
): string[] => {
    const to = order.indexOf(uid);
    const from = anchor ? order.indexOf(anchor) : -1;
    if (to < 0) return [uid];
    if (from < 0) return [uid];
    const [start, end] = from <= to ? [from, to] : [to, from];
    return order.slice(start, end + 1);
};

export const useTaskSelection = create<TaskSelectionState>((set) => ({
    uids: [],
    anchor: null,
    toggle: (uid) =>
        set((state) => ({
            uids: state.uids.includes(uid)
                ? state.uids.filter((item) => item !== uid)
                : [...state.uids, uid],
            anchor: uid,
        })),
    selectRange: (uid, order) =>
        set((state) => {
            const range = rangeBetween(order, state.anchor, uid);
            return {
                uids: [...new Set([...state.uids, ...range])],
                anchor: state.anchor ?? uid,
            };
        }),
    clear: () => set({ uids: [], anchor: null }),
}));

// The uids of the task rows shown on the page, in reading order, once each.
export const visibleTaskRowUids = (): string[] => [
    ...new Set(
        Array.from(
            document.querySelectorAll<HTMLElement>(
                '[data-task-row][data-task-uid]'
            )
        )
            .filter((row) => row.offsetParent !== null)
            .map((row) => row.dataset.taskUid as string)
    ),
];
