import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskRowCollapsed from '../TaskRow/TaskRowCollapsed';
import { useIsMinimal } from '../../../hooks/useUiDensity';
import {
    getTodayDateString,
    getTomorrowDateString,
} from '../../../utils/dateUtils';
import { Task } from '../../../entities/Task';
import { Project } from '../../../entities/Project';
import * as tasksService from '../../../utils/tasksService';
import { writeShowTaskDescription } from '../../../utils/taskRowDisplay';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: jest.fn(),
}));

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

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

jest.mock('react-router-dom', () => ({
    Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

const mockTaskRowFields: { current: unknown } = { current: undefined };

jest.mock('../../../store/useStore', () => {
    const state: any = {
        projectsStore: { projects: [] },
        get userSettingsStore() {
            return { taskRowFields: mockTaskRowFields.current };
        },
    };
    const useStore: any = (selector: any) => selector(state);
    useStore.getState = () => state;
    return { useStore };
});

const project = {
    id: 1,
    uid: 'proj-1',
    name: 'Work Project',
} as unknown as Project;

const baseTask = (overrides: Partial<Task> = {}): Task =>
    ({
        uid: 'task-1',
        name: 'Write report',
        original_name: 'Write report',
        status: 'in_progress',
        priority: 'high',
        due_date: null,
        due_has_time: false,
        tags: [],
        ...overrides,
    }) as unknown as Task;

const renderRow = (task: Task, extra: Record<string, unknown> = {}) =>
    render(
        <TaskRowCollapsed
            task={task}
            project={project}
            onActivate={jest.fn()}
            onToggleCompletion={jest.fn()}
            {...extra}
        />
    );

describe('TaskRowCollapsed in minimal mode', () => {
    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(true);
    });

    it('shows the note under the title only when the row setting is on', () => {
        const task = baseTask({
            note: 'Bring the signed form\nand the receipt',
        });
        const { unmount } = renderRow(task);

        expect(screen.queryByTestId('task-row-description')).toBeNull();
        unmount();

        writeShowTaskDescription(true);
        renderRow(task);

        expect(screen.getByTestId('task-row-description')).toHaveTextContent(
            'Bring the signed form and the receipt'
        );
        writeShowTaskDescription(false);
    });

    it('shows the project and tag icons in the metadata line', () => {
        renderRow(
            baseTask({
                tags: [
                    { uid: 't1', name: 'velo', icon: 'bike' },
                ] as Task['tags'],
            }),
            { project: { ...project, icon: 'home' } }
        );

        const link = screen.getByText('Work Project').closest('a')!;
        expect(link.querySelector('svg path')).toBeInTheDocument();
        expect(
            screen.getByText('#velo').parentElement!.querySelector('svg')
        ).toBeInTheDocument();
    });

    it('drops the priority badge and shows tags as plain #names', () => {
        renderRow(
            baseTask({
                tags: [{ uid: 't1', name: 'perso' }] as Task['tags'],
            })
        );

        expect(screen.queryByText('High')).not.toBeInTheDocument();
        expect(screen.getByText('#perso')).toBeInTheDocument();
    });

    it('names today in sentence case on a neutral chip, a past day in the warning tone, never red', () => {
        const { unmount } = renderRow(
            baseTask({ due_date: getTodayDateString() })
        );
        const today = screen.getByText('Today');
        expect(today).toHaveClass('bg-surface-high');
        expect(today.className).not.toMatch(/blue|uppercase/);
        unmount();

        renderRow(baseTask({ due_date: '2000-01-01' }));
        const past = screen.getByText(/2000/);
        expect(past).toHaveClass('bg-warning-container/70', 'text-warning');
        expect(past.className).not.toMatch(/red/);
    });

    it('leaves the date of a completed task neutral', () => {
        renderRow(baseTask({ due_date: '2000-01-01', status: 'done' }));
        expect(screen.getByText(/2000/)).not.toHaveClass('text-warning');
    });

    it('puts the details under the title, as on Today', () => {
        renderRow(baseTask());

        const meta = screen.getByTestId('task-row-meta');
        expect(meta).toContainElement(screen.getByText('Work Project'));
        expect(meta).not.toContainElement(screen.getByText('Write report'));
    });

    it('shows its menu only on the selected row, never on hover alone', () => {
        const { rerender } = renderRow(baseTask(), { onEdit: jest.fn() });
        const menu = screen.getByTestId('task-actions-menu-button');
        expect(menu).toHaveClass('invisible');
        expect(menu.className).not.toMatch(/group-hover/);
        rerender(
            <TaskRowCollapsed
                task={baseTask()}
                project={project}
                onActivate={jest.fn()}
                onToggleCompletion={jest.fn()}
                onEdit={jest.fn()}
                selected
            />
        );
        expect(screen.getByTestId('task-actions-menu-button')).not.toHaveClass(
            'invisible'
        );
    });

    it('keeps the subtasks toggle working with its title', () => {
        const onSubtasksToggle = jest.fn();
        renderRow(baseTask(), {
            hasSubtasks: true,
            showSubtasks: false,
            onSubtasksToggle,
        });

        fireEvent.click(screen.getByTitle('Show subtasks'));
        expect(onSubtasksToggle).toHaveBeenCalledTimes(1);
    });

    it('shows a chevron before the check circle that toggles subtasks', () => {
        const onSubtasksToggle = jest.fn();
        const onActivate = jest.fn();
        renderRow(baseTask(), {
            hasSubtasks: true,
            showSubtasks: false,
            onSubtasksToggle,
            onActivate,
        });

        const chevron = screen.getByTitle('Show subtasks');
        const check = screen.getByTestId('task-check-circle');
        expect(
            chevron.compareDocumentPosition(check) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(chevron).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(chevron);
        expect(onSubtasksToggle).toHaveBeenCalledTimes(1);
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('marks the chevron expanded while subtasks are shown', () => {
        renderRow(baseTask(), {
            hasSubtasks: true,
            showSubtasks: true,
            onSubtasksToggle: jest.fn(),
        });

        expect(screen.getByTitle('Hide subtasks')).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });

    it('opens the row context menu on right click', () => {
        const onContextMenu = jest.fn();
        renderRow(baseTask(), { onContextMenu });

        const row = screen
            .getByText('Write report')
            .closest('[role="button"]')!;
        fireEvent.contextMenu(row);
        expect(onContextMenu).toHaveBeenCalledTimes(1);
    });

    it('shows no subtasks chevron for a task without subtasks', () => {
        renderRow(baseTask(), { hasSubtasks: false });

        expect(screen.queryByTitle('Show subtasks')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Hide subtasks')).not.toBeInTheDocument();
    });
});

describe('TaskRowCollapsed keyboard in minimal mode', () => {
    const rowOf = () =>
        screen
            .getByText('Write report')
            .closest('[role="button"]') as HTMLElement;

    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(true);
    });

    it('toggles completion on Space instead of opening the task', () => {
        const onActivate = jest.fn();
        const onToggleCompletion = jest.fn();
        renderRow(baseTask(), { onActivate, onToggleCompletion });

        fireEvent.keyDown(rowOf(), { key: ' ' });

        expect(onToggleCompletion).toHaveBeenCalledTimes(1);
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('opens the task on Enter', () => {
        const onActivate = jest.fn();
        const onToggleCompletion = jest.fn();
        renderRow(baseTask(), { onActivate, onToggleCompletion });

        fireEvent.keyDown(rowOf(), { key: 'Enter' });

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onToggleCompletion).not.toHaveBeenCalled();
    });

    it('leaves Space alone when it comes from a control inside the row', () => {
        const onToggleCompletion = jest.fn();
        const onSubtasksToggle = jest.fn();
        renderRow(baseTask(), {
            onToggleCompletion,
            hasSubtasks: true,
            showSubtasks: false,
            onSubtasksToggle,
        });

        fireEvent.keyDown(screen.getByTitle('Show subtasks'), { key: ' ' });

        expect(onToggleCompletion).not.toHaveBeenCalled();
    });

    it('opens the date picker on D and the priority picker on P', () => {
        renderRow(baseTask({ due_date: null, priority: null }), {
            onFieldUpdate: jest.fn().mockResolvedValue(undefined),
            onToggleCompletion: jest.fn(),
        });
        const dateTrigger = screen.getByRole('button', {
            name: 'Set due date',
        });
        const priorityTrigger = screen.getByRole('button', {
            name: 'Set priority',
        });

        fireEvent.keyDown(rowOf(), { key: 'd' });
        expect(dateTrigger).toHaveAttribute('aria-expanded', 'true');

        fireEvent.keyDown(rowOf(), { key: 'P' });
        expect(priorityTrigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('ignores D and P without quick edits on the row', () => {
        const onActivate = jest.fn();
        renderRow(baseTask(), { onActivate, onToggleCompletion: jest.fn() });

        expect(() => {
            fireEvent.keyDown(rowOf(), { key: 'd' });
            fireEvent.keyDown(rowOf(), { key: 'p' });
        }).not.toThrow();
        expect(onActivate).not.toHaveBeenCalled();
    });
});

describe('TaskRowCollapsed keyboard in dense mode', () => {
    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(false);
    });

    it('keeps Space opening the task and never completes it', () => {
        const onActivate = jest.fn();
        const onToggleCompletion = jest.fn();
        renderRow(baseTask(), { onActivate, onToggleCompletion });

        fireEvent.keyDown(
            screen.getByText('Write report').closest('[role="button"]')!,
            { key: ' ' }
        );

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onToggleCompletion).not.toHaveBeenCalled();
    });
});

describe('TaskRowCollapsed in dense mode', () => {
    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(false);
    });

    it('still shows the priority badge', () => {
        renderRow(baseTask());

        expect(screen.getByText('High')).toBeInTheDocument();
        expect(
            screen.queryByTestId('task-row-minimal-line')
        ).not.toBeInTheDocument();
    });

    it('ignores right click so the browser menu stays', () => {
        const onContextMenu = jest.fn();
        renderRow(baseTask(), { onContextMenu });

        fireEvent.contextMenu(screen.getByText('Write report'));
        expect(onContextMenu).not.toHaveBeenCalled();
    });

    it('keeps the subtasks toggle without a chevron', () => {
        const onSubtasksToggle = jest.fn();
        renderRow(baseTask(), {
            hasSubtasks: true,
            showSubtasks: false,
            onSubtasksToggle,
        });

        const toggle = screen.getByTitle('Show subtasks');
        expect(toggle).not.toHaveAttribute('aria-expanded');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        const check = screen.getByTestId('task-check-circle');
        expect(
            toggle.compareDocumentPosition(check) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeFalsy();
    });
});

describe('TaskRowCollapsed quick edits in minimal mode', () => {
    const renderEditable = (task: Task) => {
        const onActivate = jest.fn();
        const onFieldUpdate = jest.fn().mockResolvedValue(undefined);
        renderRow(task, { onActivate, onFieldUpdate });
        return { onActivate, onFieldUpdate };
    };

    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(true);
        (tasksService.updateTask as jest.Mock).mockReset();
        (tasksService.updateTask as jest.Mock).mockResolvedValue({});
    });

    it('opens the priority menu and saves High once without expanding the row', async () => {
        const { onActivate } = renderEditable(baseTask({ priority: null }));

        fireEvent.click(screen.getByRole('button', { name: 'Set priority' }));
        fireEvent.click(await screen.findByTestId('priority-option-high'));

        expect(tasksService.updateTask).toHaveBeenCalledTimes(1);
        expect(tasksService.updateTask).toHaveBeenCalledWith('task-1', {
            priority: 'high',
        });
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('opens the date picker and saves Tomorrow without expanding the row', async () => {
        const { onActivate } = renderEditable(baseTask({ due_date: null }));

        fireEvent.click(screen.getByRole('button', { name: 'Set due date' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Tomorrow' })
        );

        expect(tasksService.updateTask).toHaveBeenCalledTimes(1);
        expect(tasksService.updateTask).toHaveBeenCalledWith(
            'task-1',
            expect.objectContaining({ due_date: getTomorrowDateString() })
        );
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('shows no priority flag in dense mode', () => {
        (useIsMinimal as jest.Mock).mockReturnValue(false);
        renderEditable(baseTask({ priority: 'high' }));

        expect(
            screen.queryByRole('button', { name: 'Set priority' })
        ).not.toBeInTheDocument();
    });

    describe('chips chosen in Profile -> Appearance', () => {
        beforeEach(() => {
            (useIsMinimal as jest.Mock).mockReturnValue(true);
        });

        afterEach(() => {
            mockTaskRowFields.current = undefined;
        });

        const withQuickEdits = (task: Task) =>
            renderRow(task, { onFieldUpdate: jest.fn() });
        const minimalTask = () =>
            baseTask({
                due_date: '2030-01-15',
                tags: [{ uid: 't1', name: 'perso' }] as Task['tags'],
            });
        const follows = (a: Element, b: Element) =>
            !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const flagOf = (container: HTMLElement) =>
            container.querySelector('[data-quick-edit="priority"]');
        const dueOf = (container: HTMLElement) =>
            container.querySelector('[data-quick-edit="due"]');

        it('keeps the default order when no preference is saved', () => {
            const { container } = withQuickEdits(minimalTask());
            const tag = screen.getByText('#perso');
            const project = screen.getByText('Work Project');
            const flag = flagOf(container)!;
            const due = dueOf(container)!;
            expect(follows(tag, project)).toBe(true);
            expect(follows(project, flag)).toBe(true);
            expect(follows(flag, due)).toBe(true);
        });

        it('does not render a chip the user hid', () => {
            mockTaskRowFields.current = [
                { key: 'tags', visible: false },
                { key: 'project', visible: true },
                { key: 'priority', visible: false },
                { key: 'due', visible: false },
                { key: 'recurrence', visible: true },
                { key: 'comments', visible: true },
            ];
            const { container } = withQuickEdits(minimalTask());
            expect(screen.queryByText('#perso')).not.toBeInTheDocument();
            expect(screen.getByText('Work Project')).toBeInTheDocument();
            expect(flagOf(container)).toBeNull();
            expect(dueOf(container)).toBeNull();
            expect(screen.queryByText(/2030/)).not.toBeInTheDocument();
        });

        it('keeps the flag and date editable in place while they are shown', () => {
            const { container } = withQuickEdits(minimalTask());
            expect(flagOf(container)).not.toBeNull();
            expect(dueOf(container)).not.toBeNull();
        });

        it('renders the chips in the saved order', () => {
            mockTaskRowFields.current = [
                { key: 'due', visible: true },
                { key: 'priority', visible: true },
                { key: 'project', visible: true },
                { key: 'tags', visible: true },
                { key: 'recurrence', visible: true },
                { key: 'comments', visible: true },
            ];
            const { container } = withQuickEdits(minimalTask());
            const tag = screen.getByText('#perso');
            const project = screen.getByText('Work Project');
            const flag = flagOf(container)!;
            const due = dueOf(container)!;
            expect(follows(due, flag)).toBe(true);
            expect(follows(flag, project)).toBe(true);
            expect(follows(project, tag)).toBe(true);
        });
    });
});
