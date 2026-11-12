// Which outline items a viewer folded, per note or task, in this browser
// only. Keys come from outline.itemKeys (item text + rank). Storage may be
// missing or full (private windows): folds then last for the visit.

const PREFIX = 'cadence.outlineFolds.';
const MAX_KEYS = 300;

export function loadFolds(scope: string): string[] {
    try {
        const raw = window.localStorage.getItem(PREFIX + scope);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((k): k is string => typeof k === 'string')
            : [];
    } catch {
        return [];
    }
}

export function saveFolds(scope: string, keys: string[]): void {
    try {
        if (keys.length === 0) {
            window.localStorage.removeItem(PREFIX + scope);
        } else {
            window.localStorage.setItem(
                PREFIX + scope,
                JSON.stringify(keys.slice(0, MAX_KEYS))
            );
        }
    } catch {
        // Storage refused: the folds stay for this visit only.
    }
}
