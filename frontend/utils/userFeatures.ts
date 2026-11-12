import { useStore } from '../store/useStore';

// The user's feature switches (Profile > Features), as the profile returns
// them. A missing flag takes the server default: Habits and Templates on,
// the others off.
export interface UserFeatures {
    eisenhower_enabled?: boolean;
    kanban_enabled?: boolean;
    habits_enabled?: boolean;
    calendar_enabled?: boolean;
    templates_enabled?: boolean;
}

export const applyUserFeatures = (features: UserFeatures = {}): void => {
    const store = useStore.getState().userSettingsStore;
    store.setEisenhowerEnabled(features.eisenhower_enabled === true);
    store.setKanbanEnabled(features.kanban_enabled === true);
    store.setHabitsEnabled(features.habits_enabled !== false);
    store.setCalendarEnabled(features.calendar_enabled === true);
    store.setTemplatesEnabled(features.templates_enabled !== false);
};
