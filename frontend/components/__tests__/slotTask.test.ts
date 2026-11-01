import { slotTaskInput } from '../Calendar/slotTask';

describe('slotTaskInput', () => {
    it('makes a not-started task due on the clicked day and hour', () => {
        expect(slotTaskInput('  Call dentist ', new Date(2026, 10, 3, 14))).toEqual(
            {
                name: 'Call dentist',
                due_date: '2026-11-03',
                due_time: '14:00',
                status: 0,
                completed_at: null,
            }
        );
    });

    it('pads single-digit hours', () => {
        expect(slotTaskInput('Gym', new Date(2026, 0, 9, 7)).due_time).toBe(
            '07:00'
        );
    });
});
