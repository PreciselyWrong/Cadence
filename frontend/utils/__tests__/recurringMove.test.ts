import {
    answerRecurringMove,
    askRecurringMoveScope,
    isRecurringTask,
    moveTaskDue,
    RECURRING_MOVE_CANCELLED,
    useRecurringMoveStore,
} from '../recurringMove';
import { moveTaskOccurrence, updateTask } from '../tasksService';
import { Task } from '../../entities/Task';

jest.mock('../tasksService', () => ({
    moveTaskOccurrence: jest.fn(),
    updateTask: jest.fn(),
}));

const mockedMove = moveTaskOccurrence as jest.MockedFunction<
    typeof moveTaskOccurrence
>;
const mockedUpdate = updateTask as jest.MockedFunction<typeof updateTask>;

const recurring = (overrides: Partial<Task> = {}) =>
    ({
        id: 7,
        uid: 'parent-uid',
        name: 'Water plants',
        due_date: '2026-11-01',
        recurrence_type: 'weekly',
        habit_mode: false,
        ...overrides,
    }) as unknown as Task;

// Lets moveTaskDue reach its prompt before the test answers it.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recurringMove', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUpdate.mockResolvedValue({ uid: 'parent-uid' } as Task);
        mockedMove.mockResolvedValue({
            task: { uid: 'parent-uid' } as Task,
            moved: null,
        });
    });

    afterEach(() => {
        answerRecurringMove(null);
    });

    it('treats a task without a repeat rule or with habit mode as not recurring', () => {
        expect(isRecurringTask({ recurrence_type: 'none' })).toBe(false);
        expect(isRecurringTask({ recurrence_type: undefined })).toBe(false);
        expect(
            isRecurringTask({ recurrence_type: 'daily', habit_mode: true })
        ).toBe(false);
        expect(isRecurringTask({ recurrence_type: 'daily' })).toBe(true);
    });

    it('saves a non-recurring task directly without asking', async () => {
        const task = recurring({ recurrence_type: 'none' });

        await moveTaskDue(task, { due_date: '2026-11-05' });

        expect(mockedUpdate).toHaveBeenCalledWith('parent-uid', {
            due_date: '2026-11-05',
            due_time: undefined,
        });
        expect(useRecurringMoveStore.getState().pending).toBeNull();
        expect(mockedMove).not.toHaveBeenCalled();
    });

    it('moves this and following occurrences when the user picks following', async () => {
        const pending = moveTaskDue(recurring(), { due_date: '2026-11-05' });
        await flush();
        expect(useRecurringMoveStore.getState().pending).not.toBeNull();

        answerRecurringMove('following');
        await pending;

        expect(mockedMove).toHaveBeenCalledWith('parent-uid', {
            scope: 'following',
            occurrence_date: '2026-11-01',
            due_date: '2026-11-05',
        });
        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('announces the task split off the series so open lists show it', async () => {
        mockedMove.mockResolvedValue({
            task: { uid: 'parent-uid' } as Task,
            moved: { uid: 'copy-uid' } as Task,
        });
        const created = jest.fn();
        window.addEventListener('taskCreated', created);

        const pending = moveTaskDue(recurring(), { due_date: '2026-11-05' });
        await flush();
        answerRecurringMove('this');
        await pending;

        window.removeEventListener('taskCreated', created);
        expect(created).toHaveBeenCalledTimes(1);
        expect((created.mock.calls[0][0] as CustomEvent).detail).toEqual({
            uid: 'copy-uid',
        });
    });

    it('rejects with the cancel sentinel and makes no request when the prompt is dismissed', async () => {
        const pending = moveTaskDue(recurring(), { due_date: '2026-11-05' });
        await flush();

        answerRecurringMove(null);

        await expect(pending).rejects.toThrow(RECURRING_MOVE_CANCELLED);
        expect(mockedMove).not.toHaveBeenCalled();
        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('uses the virtual occurrence own day as occurrence_date', async () => {
        const occurrence = recurring({
            is_virtual_occurrence: true,
            occurrence_index: 2,
            due_date: '2026-11-15',
        });
        const pending = moveTaskDue(occurrence, { due_date: '2026-11-17' });
        await flush();

        answerRecurringMove('this');
        await pending;

        expect(mockedMove).toHaveBeenCalledWith('parent-uid', {
            scope: 'this',
            occurrence_date: '2026-11-15',
            due_date: '2026-11-17',
        });
    });

    it('sends the time to the task that now holds the moved occurrence', async () => {
        mockedMove.mockResolvedValue({
            task: { uid: 'parent-uid' } as Task,
            moved: { uid: 'new-uid' } as Task,
        });
        const pending = moveTaskDue(recurring(), {
            due_date: '2026-11-05',
            due_time: '09:30',
        });
        await flush();

        answerRecurringMove('this');
        await pending;

        expect(mockedUpdate).toHaveBeenCalledWith('new-uid', {
            due_time: '09:30',
        });
    });

    it('skips the prompt when only the time changes on the same day', async () => {
        await moveTaskDue(recurring(), {
            due_date: '2026-11-01',
            due_time: '08:00',
        });

        expect(mockedUpdate).toHaveBeenCalledWith('parent-uid', {
            due_date: '2026-11-01',
            due_time: '08:00',
        });
        expect(mockedMove).not.toHaveBeenCalled();
    });

    it('resolves an unanswered earlier prompt as cancelled when a new one starts', async () => {
        const first = askRecurringMoveScope();
        const second = askRecurringMoveScope();

        await expect(first).resolves.toBeNull();
        answerRecurringMove('all');
        await expect(second).resolves.toBe('all');
    });
});
