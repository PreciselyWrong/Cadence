import { create } from 'zustand';
import {
    PluginMenuItem,
    PluginPageAction,
    fetchPluginMenu,
} from '../utils/pluginsService';

interface PluginMenuState {
    items: PluginMenuItem[];
    // Buttons the same plugins add to page headers
    actions: PluginPageAction[];
    // False until the first load has settled, so a page can wait for it
    loaded: boolean;
    load: () => Promise<void>;
}

// Sidebar entries of the running plugins (docs/46-plugins.md). Loaded once
// the user is signed in, and again after a plugin is turned on, off or
// removed.
export const usePluginMenuStore = create<PluginMenuState>((set) => ({
    items: [],
    actions: [],
    loaded: false,
    load: async () => {
        try {
            const { items, actions = [] } = await fetchPluginMenu();
            set({ items, actions, loaded: true });
        } catch {
            // The sidebar works without plugin entries; keep the last list.
            set({ loaded: true });
        }
    },
}));
