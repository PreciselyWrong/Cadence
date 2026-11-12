import { create } from 'zustand';
import { PluginMenuItem, fetchPluginMenu } from '../utils/pluginsService';

interface PluginMenuState {
    items: PluginMenuItem[];
    // False until the first load has settled, so a page can wait for it
    loaded: boolean;
    load: () => Promise<void>;
}

// Sidebar entries of the running plugins (docs/46-plugins.md). Loaded once
// the user is signed in, and again after a plugin is turned on, off or
// removed.
export const usePluginMenuStore = create<PluginMenuState>((set) => ({
    items: [],
    loaded: false,
    load: async () => {
        try {
            const { items } = await fetchPluginMenu();
            set({ items, loaded: true });
        } catch {
            // The sidebar works without plugin entries; keep the last list.
            set({ loaded: true });
        }
    },
}));
