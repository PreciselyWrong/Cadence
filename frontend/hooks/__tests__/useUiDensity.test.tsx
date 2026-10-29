import { renderHook, act } from '@testing-library/react';
import { useUiDensity, useIsMinimal } from '../useUiDensity';
import { useStore } from '../../store/useStore';

const setUiDensity = (density: 'minimal' | 'dense') =>
    act(() => {
        useStore.getState().userSettingsStore.setUiDensity(density);
    });

describe('useUiDensity', () => {
    afterEach(() => setUiDensity('minimal'));

    it('defaults to minimal', () => {
        const { result } = renderHook(() => useUiDensity());

        expect(result.current).toBe('minimal');
        expect(renderHook(() => useIsMinimal()).result.current).toBe(true);
    });

    it('follows the density saved in the store', () => {
        setUiDensity('dense');

        const { result } = renderHook(() => useUiDensity());
        expect(result.current).toBe('dense');
        expect(renderHook(() => useIsMinimal()).result.current).toBe(false);
    });
});
