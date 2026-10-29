import { useStore } from '../store/useStore';
import type { SectionBadgeId } from '../utils/minimalSidebar';
import { useIsMinimal } from './useUiDensity';

// Whether a sidebar section shows its item count. Dense always does; Minimal
// follows the count badge switch saved in the Profile sidebar tab.
export const useSidebarSectionBadge = (id: SectionBadgeId): boolean => {
    const isMinimal = useIsMinimal();
    const enabled = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.sectionBadges[id]
    );
    return !isMinimal || enabled;
};
