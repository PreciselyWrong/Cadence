import { useCallback, useState } from 'react';

// Collapsed group headers in minimal lists, keyed by list (path and query)
// and then by group. Storage is per browser; any failure falls back to
// expanded groups.
const STORAGE_KEY = 'tududi.collapsedTaskGroups';

type CollapsedMap = Record<string, string[]>;

const readAll = (): CollapsedMap => {
    try {
        const parsed = JSON.parse(
            window.localStorage.getItem(STORAGE_KEY) || '{}'
        );
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const writeAll = (value: CollapsedMap): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
        // Storage is unavailable (private window, blocked site data).
    }
};

export const useCollapsedGroups = (listKey: string) => {
    const [collapsed, setCollapsed] = useState<string[]>(
        () => readAll()[listKey] ?? []
    );

    const isCollapsed = useCallback(
        (groupKey: string) => collapsed.includes(groupKey),
        [collapsed]
    );

    const toggle = useCallback(
        (groupKey: string) => {
            const next = collapsed.includes(groupKey)
                ? collapsed.filter((key) => key !== groupKey)
                : [...collapsed, groupKey];
            setCollapsed(next);
            writeAll({ ...readAll(), [listKey]: next });
        },
        [collapsed, listKey]
    );

    return { isCollapsed, toggle };
};

export default useCollapsedGroups;
