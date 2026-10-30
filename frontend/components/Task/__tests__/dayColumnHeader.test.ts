import { dayColumnHeader } from '../GroupedTaskList';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fb?: string) => fb ?? _key }),
}));
jest.mock('../TaskItem', () => ({ __esModule: true, default: () => null }));

const task = (due_date?: string) => ({ id: 1, name: 'x', due_date }) as Task;

describe('dayColumnHeader', () => {
    it('uses one long date format from the first dated task', () => {
        expect(
            dayColumnHeader('Sunday, November 1', [task('2026-11-01')], 'en')
        ).toEqual({
            title: 'Sunday, November 1',
        });
        expect(
            dayColumnHeader('Dimanche, novembre 1', [task('2026-11-01')], 'fr')
                .title
        ).toBe('dimanche 1 novembre');
    });

    it('keeps the backend name as a hint for today', () => {
        const now = new Date();
        const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const header = dayColumnHeader('Today', [task(iso)], 'en');
        expect(header.hint).toBe('Today');
    });

    it('falls back to the group name without a date', () => {
        expect(dayColumnHeader('No Due Date', [task(undefined)], 'en')).toEqual(
            {
                title: 'No Due Date',
            }
        );
    });
});
