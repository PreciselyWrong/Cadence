import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MinimalContextMenu from '../TaskRow/MinimalContextMenu';
import { Task } from '../../../entities/Task';
import { Project } from '../../../entities/Project';
import * as tasksService from '../../../utils/tasksService';
import {
    getTodayDateString,
    getTomorrowDateString,
} from '../../../utils/dateUtils';
import { TASK_UPDATED_EVENT } from '../../../contexts/TaskPaneContext';
import { NextActionContext } from '../../../contexts/NextActionContext';
import { useTaskPanel } from '../../../store/taskPanelStore';

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(),
    duplicateTask: jest.fn(),
}));

const mockShowUndoToast = jest.fn();

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: mockShowUndoToast,
    }),
}));

jest.mock('../../../store/useStore', () => {
    const state: any = {};
    const useStore: any = (selector: any) => selector(state);
    useStore.getState = () => state;
    return { useStore };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

const projects = [
    { id: 1, uid: 'p1', name: 'Work' },
    { id: 2, uid: 'p2', name: 'Home' },
] as unknown as Project[];

const baseTask = (overrides: Partial<Task> = {}): Task =>
    ({
        id: 7,
        uid: 'task-7',
        name: 'Write report',
        status: 'not_started',
        priority: 'low',
        due_date: null,
        due_time: null,
        due_has_time: false,
        project_id: 1,
        pinned: false,
        subtasks: [],
        ...overrides,
    }) as unknown as Task;

const renderMenu = (
    task: Task = baseTask(),
    extra: Partial<React.ComponentProps<typeof MinimalContextMenu>> = {}
) => {
    const props = {
        x: 100,
        y: 120,
        task,
        projects,
        onTaskUpdate: jest.fn().mockResolvedValue(undefined),
        onDelete: jest.fn(),
        onClose: jest.fn(),
        ...extra,
    };
    const utils = render(<MinimalContextMenu {...props} />);
    return { ...utils, props };
};

const savedPatch = () =>
    (tasksService.updateTask as jest.Mock).mock.calls[0][1];

describe('MinimalContextMenu', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (tasksService.updateTask as jest.Mock).mockImplementation(
            async (_uid: string, patch: Partial<Task>) => ({
                ...baseTask(),
                ...patch,
            })
        );
    });

    it('lists priority, date, project, pin and delete actions', () => {
        renderMenu();

        const menu = screen.getByRole('menu');
        expect(menu).toBeInTheDocument();
        for (const label of ['None', 'Low', 'Medium', 'High']) {
            expect(
                screen.getByRole('menuitemradio', { name: label })
            ).toBeTruthy();
        }
        for (const label of [
            'Today',
            'Tomorrow',
            'Next week',
            'Clear date',
            'No project',
            'Work',
            'Home',
            'Pin',
            'Delete',
        ]) {
            expect(screen.getByRole('menuitem', { name: label })).toBeTruthy();
        }
    });

    it('shows Unpin for a pinned task', () => {
        renderMenu(baseTask({ pinned: true }));

        expect(
            screen.getByRole('menuitem', { name: 'Unpin' })
        ).toBeInTheDocument();
    });

    it('sets the priority and reports the saved task to the row', async () => {
        const listener = jest.fn();
        window.addEventListener(TASK_UPDATED_EVENT, listener);
        const { props } = renderMenu();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitemradio', { name: 'High' })
            );
        });

        expect(tasksService.updateTask).toHaveBeenCalledWith('task-7', {
            priority: 'high',
        });
        expect(props.onClose).toHaveBeenCalled();
        expect(props.onTaskUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'task-7', priority: 'high' })
        );
        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener(TASK_UPDATED_EVENT, listener);
    });

    it('clears the priority with None', async () => {
        renderMenu();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitemradio', { name: 'None' })
            );
        });

        expect(savedPatch()).toEqual({ priority: null });
    });

    it('sets the due date to today and tomorrow', async () => {
        const first = renderMenu();
        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Today' }));
        });
        expect(savedPatch()).toEqual({
            due_date: getTodayDateString(),
            due_time: null,
        });
        first.unmount();

        (tasksService.updateTask as jest.Mock).mockClear();
        renderMenu();
        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow' }));
        });
        expect(savedPatch()).toEqual({
            due_date: getTomorrowDateString(),
            due_time: null,
        });
    });

    it('offers an undo after a date change that puts the old date back', async () => {
        renderMenu(baseTask({ due_date: '2026-01-05', due_time: '09:30' }));

        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow' }));
        });
        expect(mockShowUndoToast).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.any(Function)
        );
        (tasksService.updateTask as jest.Mock).mockClear();

        const onUndo = mockShowUndoToast.mock.calls.at(-1)?.[1];
        await act(async () => {
            onUndo();
        });
        expect(savedPatch()).toEqual({
            due_date: '2026-01-05',
            due_time: '09:30',
        });
    });

    it('offers an undo after a project change that puts the old project back', async () => {
        renderMenu();

        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Home' }));
        });
        (tasksService.updateTask as jest.Mock).mockClear();

        const onUndo = mockShowUndoToast.mock.calls.at(-1)?.[1];
        await act(async () => {
            onUndo();
        });
        expect(savedPatch()).toEqual({ project_id: 1 });
    });

    it('offers no undo when the change was not saved', async () => {
        (tasksService.updateTask as jest.Mock).mockRejectedValue(
            new Error('offline')
        );
        mockShowUndoToast.mockClear();
        renderMenu();

        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow' }));
        });
        expect(mockShowUndoToast).not.toHaveBeenCalled();
    });

    it('duplicates the task and opens the copy', async () => {
        (tasksService.duplicateTask as jest.Mock).mockResolvedValue({
            ...baseTask(),
            id: 99,
            uid: 'copy-uid-99',
        });
        const { props } = renderMenu();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'Duplicate' })
            );
        });

        expect(props.onClose).toHaveBeenCalled();
        expect(tasksService.duplicateTask).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'task-7', name: 'Write report' })
        );
        expect(useTaskPanel.getState().uid).toBe('copy-uid-99');
    });

    it('does not offer to duplicate a task from a TODO.md file', () => {
        renderMenu(baseTask({ source_key: 'todo:abc' } as Partial<Task>));

        expect(
            screen.queryByRole('menuitem', { name: 'Duplicate' })
        ).not.toBeInTheDocument();
    });

    it('sets the due date to the next Monday for Next week', async () => {
        renderMenu();

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'Next week' })
            );
        });

        const { due_date: dueDate } = savedPatch();
        expect(new Date(`${dueDate}T12:00:00`).getDay()).toBe(1);
        expect(dueDate > getTodayDateString()).toBe(true);
    });

    it('clears the due date', async () => {
        renderMenu(baseTask({ due_date: getTodayDateString() }));

        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'Clear date' })
            );
        });

        expect(savedPatch()).toEqual({ due_date: null, due_time: null });
    });

    it('moves the task to a project and back to no project', async () => {
        const first = renderMenu();

        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Home' }));
        });
        expect(savedPatch()).toEqual({ project_id: 2 });
        first.unmount();

        (tasksService.updateTask as jest.Mock).mockClear();
        renderMenu();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'No project' })
            );
        });
        expect(savedPatch()).toEqual({ project_id: null });
    });

    it('pins an unpinned task', async () => {
        renderMenu();

        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));
        });

        expect(savedPatch()).toEqual({ pinned: true });
    });

    it('asks the row to delete the task and closes', () => {
        const { props } = renderMenu();

        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

        expect(props.onDelete).toHaveBeenCalledTimes(1);
        expect(props.onClose).toHaveBeenCalled();
        expect(tasksService.updateTask).not.toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const { props } = renderMenu();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(props.onClose).toHaveBeenCalled();
    });

    it('closes on a press outside the menu but not inside it', () => {
        const { props } = renderMenu();

        fireEvent.mouseDown(screen.getByRole('menu'));
        expect(props.onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(document.body);
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('stays inside the viewport', () => {
        const originalWidth = window.innerWidth;
        const originalHeight = window.innerHeight;
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 200,
        });
        const rect = jest
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockReturnValue({
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 160,
                bottom: 120,
                width: 160,
                height: 120,
                toJSON: () => ({}),
            } as DOMRect);

        renderMenu(baseTask(), { x: 280, y: 190 });

        const menu = screen.getByRole('menu');
        expect(parseInt(menu.style.left, 10)).toBe(300 - 160 - 8);
        expect(parseInt(menu.style.top, 10)).toBe(200 - 120 - 8);

        rect.mockRestore();
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalWidth,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: originalHeight,
        });
    });
});

describe('MinimalContextMenu next action', () => {
    const setNextAction = jest.fn().mockResolvedValue(undefined);
    const renderWithContext = (
        task: Task,
        nextTaskUid: string | null,
        onClose = jest.fn()
    ) =>
        render(
            <NextActionContext.Provider value={{ nextTaskUid, setNextAction }}>
                <MinimalContextMenu
                    x={10}
                    y={10}
                    task={task}
                    projects={projects}
                    onTaskUpdate={jest.fn().mockResolvedValue(undefined)}
                    onDelete={jest.fn()}
                    onClose={onClose}
                />
            </NextActionContext.Provider>
        );

    beforeEach(() => setNextAction.mockClear());

    it('has no next action entry outside a project page', () => {
        renderMenu();
        expect(
            screen.queryByRole('menuitemcheckbox', { name: 'Next action' })
        ).toBeNull();
    });

    it('sets the task as the next action', () => {
        const onClose = jest.fn();
        renderWithContext(baseTask(), null, onClose);

        fireEvent.click(
            screen.getByRole('menuitemcheckbox', { name: 'Next action' })
        );

        expect(setNextAction).toHaveBeenCalledWith('task-7');
        expect(onClose).toHaveBeenCalled();
    });

    it('clears the pick when the task already is the next action', () => {
        renderWithContext(baseTask(), 'task-7');

        const entry = screen.getByRole('menuitemcheckbox', {
            name: 'Next action',
        });
        expect(entry).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(entry);

        expect(setNextAction).toHaveBeenCalledWith(null);
    });

    it('is not offered for a finished task or a subtask', () => {
        const { unmount } = renderWithContext(
            baseTask({ status: 'done' }),
            null
        );
        expect(
            screen.queryByRole('menuitemcheckbox', { name: 'Next action' })
        ).toBeNull();
        unmount();

        renderWithContext(baseTask({ parent_task_id: 3 }), null);
        expect(
            screen.queryByRole('menuitemcheckbox', { name: 'Next action' })
        ).toBeNull();
    });
});
