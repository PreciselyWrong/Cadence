import { openAtEndOfDay } from '../BurndownChart';
import { Task } from '../../../entities/Task';

const dayEnd = new Date('2026-11-06T23:59:59');
const task = (fields: Partial<Task>) =>
    ({ created_at: '2026-11-01T10:00:00', status: 0, ...fields }) as Task;

describe('openAtEndOfDay', () => {
    it('counts an open task, and one closed later', () => {
        expect(openAtEndOfDay(task({}), dayEnd)).toBe(true);
        expect(
            openAtEndOfDay(
                task({ status: 2, completed_at: '2026-11-07T09:00:00' }),
                dayEnd
            )
        ).toBe(true);
    });

    it('leaves out a task closed by then, or not yet created', () => {
        expect(
            openAtEndOfDay(
                task({ status: 2, completed_at: '2026-11-05T09:00:00' }),
                dayEnd
            )
        ).toBe(false);
        expect(
            openAtEndOfDay(task({ created_at: '2026-11-08T09:00:00' }), dayEnd)
        ).toBe(false);
    });

    it('never counts a task closed without a known date', () => {
        expect(
            openAtEndOfDay(task({ status: 2, completed_at: null }), dayEnd)
        ).toBe(false);
    });
});
