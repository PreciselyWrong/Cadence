import {
    answerRecurringScope,
    askRecurringScope,
    deleteTaskWithScope,
    isRecurringTask,
    moveTaskDue,
    needsRecurringScope,
    RECURRING_SCOPE_CANCELLED,
    saveTaskEdit,
    useRecurringScopeStore,
} from '../recurringScope';
import {
    deleteTaskOccurrence,
    editTaskOccurrence,
    updateTask,
} from '../tasksService';
import { Task } from '../../entities/Task';

jest.mock('../tasksService', () => ({
    editTaskOccurrence: jest.fn(),
    deleteTaskOccurrence: jest.fn(),
    updateTask: jest.fn(),
}));

const mockedEdit = editTaskOccurrence as jest.MockedFunction<
    typeof editTaskOccurrence
>;
const mockedDelete = deleteTaskOccurrence as jest.MockedFunction<
    typeof deleteTaskOccurrence
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
        status: 'not_started',
        ...overrides,
    }) as unknown as Task;

// Lets a save reach its prompt before the test answers it.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recurringScope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUpdate.mockResolvedValue({ uid: 'parent-uid' } as Task);
        mockedEdit.mockResolvedValue({
            task: { uid: 'parent-uid' } as Task,
            edited: { uid: 'parent-uid' } as Task,
        });
    });

    afterEach(() => {
        answerRecurringScope(null);
    });

    it('treats a task without a repeat rule or with habit mode as not recurring', () => {
        expect(isRecurringTask({ recurrence_type: 'none' })).toBe(false);
        expect(isRecurringTask({ recurrence_type: undefined })).toBe(false);
        expect(
            isRecurringTask({ recurrence_type: 'daily', habit_mode: true })
        ).toBe(false);
        expect(isRecurringTask({ recurrence_type: 'daily' })).toBe(true);
    });

    it('asks for edits of the occurrence, not for completion or series fields', () => {
        const task = recurring();
        expect(needsRecurringScope(task, { name: 'New' })).toBe(true);
        expect(needsRecurringScope(task, { estimated_minutes: 30 })).toBe(true);
        expect(needsRecurringScope(task, { status: 'done' })).toBe(false);
        expect(needsRecurringScope(task, { recurrence_interval: 2 })).toBe(
            false
        );
        expect(needsRecurringScope(task, { today: true })).toBe(false);
        expect(
            needsRecurringScope(recurring({ recurrence_type: 'none' }), {
                name: 'New',
            })
        ).toBe(false);
    });

    it('saves a non-recurring task directly without asking', async () => {
        await saveTaskEdit(recurring({ recurrence_type: 'none' }), {
            name: 'Once',
        });

        expect(mockedUpdate).toHaveBeenCalledWith('parent-uid', {
            name: 'Once',
        });
        expect(useRecurringScopeStore.getState().pending).toBeNull();
        expect(mockedEdit).not.toHaveBeenCalled();
    });

    it('asks once and sends every field of the save with the chosen scope', async () => {
        const pending = saveTaskEdit(recurring(), {
            name: 'Water the cactus',
            estimated_minutes: 20,
        });
        await flush();
        expect(useRecurringScopeStore.getState().pending?.kind).toBe('edit');

        answerRecurringScope('following');
        await pending;

        expect(mockedEdit).toHaveBeenCalledTimes(1);
        expect(mockedEdit).toHaveBeenCalledWith('parent-uid', {
            scope: 'following',
            occurrence_date: '2026-11-01',
            changes: { name: 'Water the cactus', estimated_minutes: 20 },
        });
        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('resolves with the split-off task and announces it to open lists', async () => {
        mockedEdit.mockResolvedValue({
            task: { uid: 'parent-uid' } as Task,
            edited: { uid: 'copy-uid' } as Task,
        });
        const created = jest.fn();
        window.addEventListener('taskCreated', created);

        const pending = saveTaskEdit(recurring(), { name: 'Once' });
        await flush();
        answerRecurringScope('this');
        const edited = await pending;

        window.removeEventListener('taskCreated', created);
        expect(edited.uid).toBe('copy-uid');
        expect(created).toHaveBeenCalledTimes(1);
        expect((created.mock.calls[0][0] as CustomEvent).detail).toEqual({
            uid: 'copy-uid',
        });
    });

    it('rejects with the cancel sentinel and makes no request when the prompt is dismissed', async () => {
        const pending = saveTaskEdit(recurring(), { name: 'Nope' });
        await flush();

        answerRecurringScope(null);

        await expect(pending).rejects.toThrow(RECURRING_SCOPE_CANCELLED);
        expect(mockedEdit).not.toHaveBeenCalled();
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

        answerRecurringScope('this');
        await pending;

        expect(mockedEdit).toHaveBeenCalledWith('parent-uid', {
            scope: 'this',
            occurrence_date: '2026-11-15',
            changes: { due_date: '2026-11-17' },
        });
    });

    it('asks when only the time changes on the same day', async () => {
        const pending = moveTaskDue(recurring(), {
            due_date: '2026-11-01',
            due_time: '08:00',
        });
        await flush();
        answerRecurringScope('this');
        await pending;

        expect(mockedEdit).toHaveBeenCalledWith('parent-uid', {
            scope: 'this',
            occurrence_date: '2026-11-01',
            changes: { due_date: '2026-11-01', due_time: '08:00' },
        });
    });

    it('saves an unchanged due date or a cleared one without asking', async () => {
        await moveTaskDue(recurring(), { due_date: '2026-11-01' });
        await moveTaskDue(recurring(), { due_date: null });

        expect(mockedEdit).not.toHaveBeenCalled();
        expect(mockedUpdate).toHaveBeenCalledTimes(2);
    });

    describe('deleting', () => {
        it('deletes the series through the caller for all occurrences', async () => {
            const deleteAll = jest.fn().mockResolvedValue(undefined);

            const pending = deleteTaskWithScope(recurring(), deleteAll);
            await flush();
            expect(useRecurringScopeStore.getState().pending?.kind).toBe(
                'delete'
            );
            answerRecurringScope('all');

            await expect(pending).resolves.toBeNull();
            expect(deleteAll).toHaveBeenCalled();
            expect(mockedDelete).not.toHaveBeenCalled();
        });

        it('removes one occurrence and resolves with the kept series', async () => {
            mockedDelete.mockResolvedValue({
                task: { uid: 'parent-uid', due_date: '2026-11-08' } as Task,
                deleted: false,
            });
            const deleteAll = jest.fn();

            const pending = deleteTaskWithScope(recurring(), deleteAll);
            await flush();
            answerRecurringScope('this');

            await expect(pending).resolves.toMatchObject({
                due_date: '2026-11-08',
            });
            expect(mockedDelete).toHaveBeenCalledWith('parent-uid', {
                scope: 'this',
                occurrence_date: '2026-11-01',
            });
            expect(deleteAll).not.toHaveBeenCalled();
        });

        it('deletes a one-off task without asking', async () => {
            const deleteAll = jest.fn().mockResolvedValue(undefined);

            await deleteTaskWithScope(
                recurring({ recurrence_type: 'none' }),
                deleteAll
            );

            expect(deleteAll).toHaveBeenCalled();
            expect(useRecurringScopeStore.getState().pending).toBeNull();
        });
    });

    it('resolves an unanswered earlier prompt as cancelled when a new one starts', async () => {
        const first = askRecurringScope();
        const second = askRecurringScope();

        await expect(first).resolves.toBeNull();
        answerRecurringScope('all');
        await expect(second).resolves.toBe('all');
    });
});
