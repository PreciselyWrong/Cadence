import { useStore } from '../store/useStore';
import type { UiDensity } from '../store/useStore';

export const useUiDensity = (): UiDensity =>
    useStore((state) => state.userSettingsStore.uiDensity);

export const useIsMinimal = (): boolean => useUiDensity() === 'minimal';
