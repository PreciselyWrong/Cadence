import { useStore } from '../../store/useStore';
import { applyUserFeatures } from '../userFeatures';

const settings = () => useStore.getState().userSettingsStore;

describe('applyUserFeatures', () => {
    it('keeps Templates off after a reload when the user turned it off', () => {
        applyUserFeatures({ templates_enabled: false });

        expect(settings().templatesEnabled).toBe(false);
    });

    it('applies the server defaults when a flag is missing', () => {
        applyUserFeatures({});

        expect(settings().templatesEnabled).toBe(true);
        expect(settings().habitsEnabled).toBe(true);
        expect(settings().calendarEnabled).toBe(false);
        expect(settings().eisenhowerEnabled).toBe(false);
        expect(settings().kanbanEnabled).toBe(false);
    });
});
