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

jest.mock('../../../store/useStore', () => {
    const state: any = { projectsStore: { projects: [] } };
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

    it('drops the priority badge and shows tags as plain #names', () => {
        renderRow(
            baseTask({
                tags: [{ uid: 't1', name: 'perso' }] as Task['tags'],
            })
        );

        expect(screen.queryByText('High')).not.toBeInTheDocument();
        expect(screen.getByText('#perso')).toBeInTheDocument();
    });

    it('colours today blue and an overdue date red', () => {
        const { unmount } = renderRow(
            baseTask({ due_date: getTodayDateString() })
        );
        expect(screen.getByText(/today/i)).toHaveClass(
            'text-blue-600',
            'dark:text-blue-400'
        );
        unmount();

        renderRow(baseTask({ due_date: '2000-01-01' }));
        expect(screen.getByText(/2000/)).toHaveClass(
            'text-red-600',
            'dark:text-red-400'
        );
    });

    it('leaves the date of a completed task grey', () => {
        renderRow(baseTask({ due_date: getTodayDateString(), status: 'done' }));
        expect(screen.getByText(/today/i)).not.toHaveClass('text-blue-600');
    });

    it('keeps the project name on the same line as the title', () => {
        renderRow(baseTask());

        const line = screen.getByTestId('task-row-minimal-line');
        expect(line).toContainElement(screen.getByText('Write report'));
        expect(line).toContainElement(screen.getByText('Work Project'));
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
});
