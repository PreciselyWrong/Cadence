import { capitalizeFirst, weekdayTitle } from '../dayLabel';

describe('day label', () => {
    it('raises the first letter only', () => {
        expect(capitalizeFirst('samedi')).toBe('Samedi');
        expect(capitalizeFirst('jeu. 12 nov.')).toBe('Jeu. 12 nov.');
        expect(capitalizeFirst('Today')).toBe('Today');
        expect(capitalizeFirst('')).toBe('');
    });

    it('follows the locale (Turkish dotted i)', () => {
        expect(capitalizeFirst('istanbul', 'tr')).toBe('İstanbul');
    });

    it('titles a French weekday', () => {
        // 2026-11-14 is a Saturday.
        expect(weekdayTitle(new Date(2026, 10, 14), 'fr')).toBe('Samedi');
        expect(weekdayTitle(new Date(2026, 10, 14), 'en')).toBe('Saturday');
    });
});
