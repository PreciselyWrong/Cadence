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

jest.mock('../../../utils/tasksService', () => ({
    updateTask: jest.fn(),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: jest.fn(),
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
