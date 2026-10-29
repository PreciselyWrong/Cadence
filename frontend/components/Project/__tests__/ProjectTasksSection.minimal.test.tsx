import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectTasksSection from '../ProjectTasksSection';
import { useIsMinimal } from '../../../hooks/useUiDensity';
import { Task } from '../../../entities/Task';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: jest.fn(),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));

jest.mock('../../Task/TaskList', () => ({
    __esModule: true,
    default: ({ tasks }: { tasks: Task[] }) => (
        <ul>
            {tasks.map((task) => (
                <li key={task.id}>{task.name}</li>
            ))}
        </ul>
    ),
}));

const mockedUseIsMinimal = useIsMinimal as jest.Mock;

const openTask = {
    id: 1,
    uid: 'a',
    name: 'Open one',
    status: 'not_started',
} as Task;
const doneTask = { id: 2, uid: 'b', name: 'Done one', status: 'done' } as Task;

const baseProps = {
    displayTasks: [openTask],
    onTaskUpdate: jest.fn(),
    onTaskCompletionToggle: jest.fn(),
    onTaskDelete: jest.fn(),
    onToggleToday: jest.fn(),
    allProjects: [],
    showCompleted: false,
    taskSearchQuery: '',
    t: ((_key: string, fallback?: string) => fallback ?? _key) as any,
};

describe('ProjectTasksSection in minimal mode', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        mockedUseIsMinimal.mockReturnValue(true);
    });

    it('shows the inline add field and creates a task on Enter', async () => {
        const onInlineCreate = jest.fn().mockResolvedValue(undefined);
        render(
            <ProjectTasksSection
                {...baseProps}
                onInlineCreate={onInlineCreate}
                completedTasks={[doneTask]}
            />
        );

        const input = screen.getByPlaceholderText('+ Add task');
        fireEvent.change(input, { target: { value: 'New item' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(onInlineCreate).toHaveBeenCalledWith('New item')
        );
    });

    it('shows a collapsed Completed section with the count', () => {
        render(
            <ProjectTasksSection
                {...baseProps}
                onInlineCreate={jest.fn()}
                completedTasks={[doneTask]}
            />
        );

        expect(screen.getByTestId('completed-tasks-toggle')).toHaveTextContent(
            'Completed (1)'
        );
        expect(screen.queryByText('Done one')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('completed-tasks-toggle'));
        expect(screen.getByText('Done one')).toBeInTheDocument();
    });

    it('drops the Completed section when the list already shows completed tasks', () => {
        render(
            <ProjectTasksSection
                {...baseProps}
                showCompleted
                onInlineCreate={jest.fn()}
                completedTasks={[doneTask]}
            />
        );
        expect(
            screen.queryByTestId('completed-tasks-section')
        ).not.toBeInTheDocument();
    });
});

describe('ProjectTasksSection in dense mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseIsMinimal.mockReturnValue(false);
    });

    it('does not show the inline add field or the Completed section', () => {
        render(
            <ProjectTasksSection
                {...baseProps}
                onInlineCreate={jest.fn()}
                completedTasks={[doneTask]}
            />
        );

        expect(
            screen.queryByPlaceholderText('+ Add task')
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId('completed-tasks-section')
        ).not.toBeInTheDocument();
        expect(screen.getByText('Open one')).toBeInTheDocument();
    });
});
