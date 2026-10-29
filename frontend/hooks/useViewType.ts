import { useCallback, useEffect, useState } from 'react';
import {
    ViewType,
    fetchProfile,
    updateUiSettings,
} from '../utils/profileService';

export const VIEW_TYPES: ViewType[] = ['list', 'board', 'calendar'];

export const isViewType = (value: unknown): value is ViewType =>
    typeof value === 'string' && (VIEW_TYPES as string[]).includes(value);

// The list, board or calendar choice for one view (`view:<uid>`,
// `tag:<name>`, `project:<uid>` or `tasks`), saved in
// ui_settings.viewTypes. `loaded` turns true once the saved choice is read.
export const useViewType = (key: string) => {
    const [viewType, setType] = useState<ViewType>('list');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoaded(false);
        fetchProfile()
            .then((profile) => {
                if (cancelled) return;
                const saved = profile.ui_settings?.viewTypes?.[key];
                setType(isViewType(saved) ? saved : 'list');
            })
            .catch(() => {
                // Without a saved choice the list is shown
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [key]);

    const setViewType = useCallback(
        (next: ViewType) => {
            setType(next);
            updateUiSettings({ viewTypes: { [key]: next } }).catch(() => {
                // The choice still applies for this visit
            });
        },
        [key]
    );

    return { viewType, setViewType, loaded };
};
