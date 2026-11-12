import { useCallback, useState } from 'react';

// Projects whose sub-projects are folded in the sidebar. Kept on this device
// only, like the open sections of the sidebar.
const STORAGE_KEY = 'sidebarFoldedProjects';

const readStored = (): Set<string> => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        return new Set(
            Array.isArray(saved)
                ? saved.filter((uid) => typeof uid === 'string')
                : []
        );
    } catch {
        return new Set();
    }
};

export const useFoldedProjects = (): [
    ReadonlySet<string>,
    (uid: string) => void,
] => {
    const [folded, setFolded] = useState(readStored);

    const toggle = useCallback((uid: string) => {
        setFolded((current) => {
            const next = new Set(current);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
            } catch {
                // Storage can be unavailable (private mode); the fold still
                // works for this session.
            }
            return next;
        });
    }, []);

    return [folded, toggle];
};
