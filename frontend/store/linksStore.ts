import React from 'react';
import { create } from 'zustand';
import { Link } from '../entities/Link';
import {
    deleteLink,
    fetchLinks,
    LinkChanges,
    updateLink,
} from '../utils/linksService';

// Saved links, shared by the Links page and the review. Loaded once,
// reloaded while the server still reads a page.
interface LinksState {
    links: Link[];
    loaded: boolean;
    error: boolean;
    load: (force?: boolean) => Promise<void>;
    save: (uid: string, changes: LinkChanges) => Promise<Link>;
    remove: (uid: string) => Promise<void>;
    // A link just created (from the inbox): first in the list.
    add: (link: Link) => void;
}

let inflight: Promise<void> | null = null;

export const useLinksStore = create<LinksState>((set, get) => ({
    links: [],
    loaded: false,
    error: false,
    load: async (force = false) => {
        if (get().loaded && !force) return;
        if (inflight) return inflight;
        inflight = fetchLinks()
            .then((links) => set({ links, loaded: true, error: false }))
            .catch(() => set({ loaded: true, error: true }))
            .finally(() => {
                inflight = null;
            });
        return inflight;
    },
    save: async (uid, changes) => {
        const previous = get().links;
        // Shown at once; put back if the server refuses.
        set({
            links: previous.map((l) =>
                l.uid === uid
                    ? {
                          ...l,
                          ...('note' in changes
                              ? { note: changes.note ?? null }
                              : {}),
                          ...(changes.status ? { status: changes.status } : {}),
                      }
                    : l
            ),
        });
        try {
            const saved = await updateLink(uid, changes);
            set({
                links: get().links.map((l) => (l.uid === uid ? saved : l)),
            });
            return saved;
        } catch (error) {
            set({ links: previous });
            throw error;
        }
    },
    add: (link) =>
        set({
            links: [link, ...get().links.filter((l) => l.uid !== link.uid)],
        }),
    remove: async (uid) => {
        const previous = get().links;
        set({ links: previous.filter((l) => l.uid !== uid) });
        try {
            await deleteLink(uid);
        } catch (error) {
            set({ links: previous });
            throw error;
        }
    },
}));

const POLL_MS = 4000;
const POLL_ROUNDS = 8;

// Reloads a few times while the server still fetches page details, or
// after `refreshKey` changes (a new capture): links appear without a reload.
export const useLinksRefresh = (refreshKey?: string) => {
    const load = useLinksStore((s) => s.load);
    const pending = useLinksStore((s) =>
        s.links.some((l) => l.fetch_status === 'pending')
    );
    const [round, setRound] = React.useState(0);
    const lastKey = React.useRef(refreshKey);

    React.useEffect(() => {
        void load();
    }, [load]);

    React.useEffect(() => {
        if (refreshKey === undefined || refreshKey === lastKey.current) return;
        lastKey.current = refreshKey;
        setRound(0);
        const timer = setTimeout(() => void load(true), 1500);
        return () => clearTimeout(timer);
    }, [refreshKey, load]);

    React.useEffect(() => {
        if (!pending || round >= POLL_ROUNDS) return;
        const timer = setTimeout(() => {
            setRound((r) => r + 1);
            void load(true);
        }, POLL_MS);
        return () => clearTimeout(timer);
    }, [pending, round, load]);
};
