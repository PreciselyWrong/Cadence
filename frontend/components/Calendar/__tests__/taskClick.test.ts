import { taskClickAction } from '../taskClick';
import { CalendarTask, taskToEvents } from '../taskEvents';

const plain: CalendarTask & { uid: string } = {
    id: 7,
    uid: 'plain-uid',
    name: 'Plain task',
    due_date: '2026-11-12',
    due_time: '10:00',
};

const recurring = {
    id: 8,
    uid: 'recurring-uid',
    name: 'Weekly review',
    due_date: '2026-11-15T00:00:00',
    due_time: '09:00',
    is_virtual_occurrence: true,
    occurrence_index: 2,
};

const tasks = [plain, recurring];
const eventOf = (task: unknown) => taskToEvents(task as CalendarTask)[0];

describe('taskClickAction', () => {
    it('opens a task in the sheet on the day its block is drawn', () => {
        expect(taskClickAction(eventOf(plain), tasks, null)).toEqual({
            kind: 'sheet',
            uid: 'plain-uid',
            date: '2026-11-12',
        });
    });

    it('closes the sheet when its own block is clicked again', () => {
        expect(taskClickAction(eventOf(plain), tasks, 'plain-uid')).toEqual({
            kind: 'close',
            uid: 'plain-uid',
        });
    });

    it('switches to another task when a different block is clicked', () => {
        expect(taskClickAction(eventOf(plain), tasks, 'other')).toMatchObject({
            kind: 'sheet',
            uid: 'plain-uid',
        });
    });

    it('opens a later occurrence in the occurrence dialog, on its own day', () => {
        expect(
            taskClickAction(eventOf(recurring), tasks, 'recurring-uid')
        ).toEqual({
            kind: 'occurrence',
            uid: 'recurring-uid',
            date: '2026-11-15',
        });
    });

    it('does nothing for an event that is not a task', () => {
        const event = { ...eventOf(plain), type: 'event' as const };
        expect(taskClickAction(event, tasks, null)).toBeNull();
    });

    it('does nothing for a task without a uid', () => {
        const noUid = { id: 9, due_date: '2026-11-12', due_time: '10:00' };
        expect(taskClickAction(eventOf(noUid), [noUid], null)).toBeNull();
    });
});
