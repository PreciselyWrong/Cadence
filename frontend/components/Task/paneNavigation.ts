// The task the j and k keys open from the floating pane: the neighbour of the
// open task in the order the page shows its rows. Repeated uids (a task shown
// twice on a page) count once, so a task is never its own neighbour.
export const neighbourTaskUid = (
    uids: string[],
    current: string,
    step: 1 | -1
): string | null => {
    const ordered = Array.from(new Set(uids));
    const index = ordered.indexOf(current);
    if (index === -1) return step === 1 ? (ordered[0] ?? null) : null;
    return ordered[index + step] ?? null;
};
