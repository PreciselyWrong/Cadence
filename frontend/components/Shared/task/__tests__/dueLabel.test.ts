import { dueDayLabel, isDueLate } from '../dueLabel';

const t = (_key: string, fallback: string) => fallback;

describe('dueDayLabel', () => {
    it('names today, tomorrow and yesterday in sentence case', () => {
        expect(dueDayLabel('2026-11-12', '2026-11-12', 'en', t)).toBe('Today');
        expect(dueDayLabel('2026-11-13', '2026-11-12', 'en', t)).toBe(
            'Tomorrow'
        );
        expect(dueDayLabel('2026-11-11T00:00', '2026-11-12', 'en', t)).toBe(
            'Yesterday'
        );
    });

    it('gives a short weekday date otherwise', () => {
        expect(dueDayLabel('2026-12-01', '2026-11-12', 'en-GB', t)).toBe(
            'Tue 1 Dec'
        );
    });
});

describe('isDueLate', () => {
    it('is late only before today and while open', () => {
        expect(isDueLate('2026-11-11', '2026-11-12', false)).toBe(true);
        expect(isDueLate('2026-11-12', '2026-11-12', false)).toBe(false);
        expect(isDueLate('2026-11-11', '2026-11-12', true)).toBe(false);
        expect(isDueLate(null, '2026-11-12', false)).toBe(false);
    });
});
