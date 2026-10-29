import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';
import { useStore } from '../store/useStore';
import type { MinimalSidebarSettings } from './minimalSidebar';

// Saves part of the minimal sidebar settings and keeps the store in step
// with what the server stored.
export const saveMinimalSidebarSettings = async (
    patch: Partial<{
        smartLists: MinimalSidebarSettings['smartLists'];
        rail: MinimalSidebarSettings['rail'];
        sectionBadges: MinimalSidebarSettings['sectionBadges'];
    }>
): Promise<void> => {
    const response = await fetch(getApiPath('profile/sidebar-settings'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': await getCsrfToken(),
            Accept: 'application/json',
        },
        body: JSON.stringify(patch),
    });
    if (!response.ok) {
        throw new Error(`Saving the sidebar failed (${response.status})`);
    }
    const result = await response.json();
    useStore
        .getState()
        .userSettingsStore.setSidebarMinimal(result.sidebar_settings);
};

export const saveSidebarWidthPercent = async (
    widthPercent: number
): Promise<void> => {
    const response = await fetch(getApiPath('profile/sidebar-settings'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': await getCsrfToken(),
            Accept: 'application/json',
        },
        body: JSON.stringify({ widthPercent }),
    });
    if (!response.ok) {
        throw new Error(`Saving the sidebar width failed (${response.status})`);
    }
};
