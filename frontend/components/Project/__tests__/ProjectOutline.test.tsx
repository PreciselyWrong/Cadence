import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectOutline from '../ProjectOutline';
import { Task } from '../../../entities/Task';
import {
    createTask,
    fetchSubtasks,
    toggleTaskCompletion,
    updateTask,
} from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));

jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
    updateTask: jest.fn(),
    fetchSubtasks: jest.fn(),
    toggleTaskCompletion: jest.fn(),
}));

const mockCreate = createTask as jest.Mock;
const mockUpdate = updateTask as jest.Mock;
const mockSubtasks = fetchSubtasks as jest.Mock;
const mockToggle = toggleTaskCompletion as jest.Mock;

const task = (id: number, name: string, extra: Partial<Task> = {}) =>
    ({ id, uid: `t${id}`, name, status: 'not_started', ...extra }) as Task;

const tasks = (): Task[] => [
    task(1, 'Plan trip', {
        subtasks: [
            task(11, 'Book train', { parent_task_id: 1, order: 1 }),
            task(12, 'Book hotel', { parent_task_id: 1, order: 2 }),
        ],
    }),
    task(2, 'Pack bags'),
    task(3, 'Water plants'),
];

const setup = (
    extra: Partial<React.ComponentProps<typeof ProjectOutline>> = {}
) => {
    const props = {
        tasks: tasks(),
        projectUid: 'p1',
        onReorder: jest.fn().mockResolvedValue(undefined),
        onReload: jest.fn().mockResolvedValue(undefined),
        ...extra,
    };
    render(<ProjectOutline {...props} />);
    return props;
};

const row = (name: string) => screen.getByDisplayValue(name);

describe('ProjectOutline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdate.mockResolvedValue({});
        mockToggle.mockResolvedValue({});
    });

    it('shows tasks with their subtasks one level in', () => {
        setup();

        expect(row('Plan trip').closest('li')).toHaveAttribute(
            'aria-level',
            '1'
        );
        expect(row('Book train').closest('li')).toHaveAttribute(
            'aria-level',
            '2'
        );
        expect(row('Pack bags').closest('li')).toHaveAttribute(
            'aria-level',
            '1'
        );
    });

    it('Enter opens a new sibling below; Enter again creates it there', async () => {
        mockCreate.mockResolvedValue(task(4, 'Buy snacks'));
        const props = setup();

        fireEvent.keyDown(row('Pack bags'), { key: 'Enter' });
        const draft = screen.getByTestId('outline-draft');
        expect(draft).toHaveFocus();
        fireEvent.change(draft, { target: { value: 'Buy snacks' } });
        fireEvent.keyDown(draft, { key: 'Enter' });

        await waitFor(() =>
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Buy snacks',
                    project_uid: 'p1',
                    parent_task_id: null,
                })
            )
        );
        await waitFor(() =>
            expect(props.onReorder).toHaveBeenCalledWith([
                't1',
                't2',
                't4',
                't3',
            ])
        );
        expect(props.onReload).toHaveBeenCalled();
    });

    it('Enter on a subtask creates a subtask of the same parent', async () => {
        mockCreate.mockResolvedValue(
            task(13, 'Pay deposit', { parent_task_id: 1 })
        );
        setup();

        fireEvent.keyDown(row('Book hotel'), { key: 'Enter' });
        const draft = screen.getByTestId('outline-draft');
        fireEvent.change(draft, { target: { value: 'Pay deposit' } });
        fireEvent.keyDown(draft, { key: 'Enter' });

        await waitFor(() =>
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Pay deposit',
                    parent_task_id: 1,
                })
            )
        );
    });

    it('Tab makes a task a subtask of the one above', async () => {
        const props = setup();

        fireEvent.keyDown(row('Pack bags'), { key: 'Tab' });

        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('t2', { parent_task_id: 1 })
        );
        expect(props.onReload).toHaveBeenCalled();
    });

    it('Tab leaves a task that has subtasks where it is', () => {
        setup({
            tasks: [task(2, 'Pack bags'), ...tasks().filter((t) => t.id === 1)],
        });

        fireEvent.keyDown(row('Plan trip'), { key: 'Tab' });

        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('Shift+Tab lifts a subtask out, right after its parent', async () => {
        const props = setup();

        fireEvent.keyDown(row('Book hotel'), { key: 'Tab', shiftKey: true });

        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('t12', {
                parent_task_id: null,
            })
        );
        await waitFor(() =>
            expect(props.onReorder).toHaveBeenCalledWith([
                't1',
                't12',
                't2',
                't3',
            ])
        );
    });

    it('Alt+Down moves a task below the next one', async () => {
        const props = setup();

        fireEvent.keyDown(row('Pack bags'), { key: 'ArrowDown', altKey: true });

        await waitFor(() =>
            expect(props.onReorder).toHaveBeenCalledWith(['t1', 't3', 't2'])
        );
    });

    it('Alt+Up moves a subtask above its sibling, keeping every subtask', async () => {
        mockSubtasks.mockResolvedValue([
            task(11, 'Book train'),
            task(12, 'Book hotel'),
            task(14, 'Done earlier', { status: 'done' }),
        ]);
        setup();

        fireEvent.keyDown(row('Book hotel'), { key: 'ArrowUp', altKey: true });

        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('t1', {
                subtasks: [{ id: 12 }, { id: 11 }, { id: 14 }],
            })
        );
    });

    it('ticks a task done from its checkbox', async () => {
        setup();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Pack bags' }));

        await waitFor(() =>
            expect(mockToggle).toHaveBeenCalledWith(
                't2',
                expect.objectContaining({ uid: 't2' })
            )
        );
    });

    it('saves a renamed task when leaving the line', async () => {
        setup();

        const input = row('Water plants');
        fireEvent.change(input, { target: { value: 'Water the plants' } });
        fireEvent.blur(input);

        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('t3', {
                name: 'Water the plants',
            })
        );
    });

    it('Escape drops an empty draft', () => {
        setup();

        fireEvent.keyDown(row('Pack bags'), { key: 'Enter' });
        fireEvent.keyDown(screen.getByTestId('outline-draft'), {
            key: 'Escape',
        });

        expect(screen.queryByTestId('outline-draft')).toBeNull();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('only allows ticking and adding when the structure is locked', () => {
        setup({ structureLocked: true });

        fireEvent.keyDown(row('Pack bags'), { key: 'Tab' });
        fireEvent.keyDown(row('Pack bags'), { key: 'ArrowDown', altKey: true });

        expect(mockUpdate).not.toHaveBeenCalled();
        expect(row('Pack bags')).toHaveAttribute('readonly');
    });
});
