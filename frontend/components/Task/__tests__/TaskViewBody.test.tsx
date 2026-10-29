import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskViewBody from '../TaskViewBody';
import { Task } from '../../../entities/Task';

let mockMinimal = true;
const mockOpenTask = jest.fn();
const mockFetchProfile = jest.fn();
const mockUpdateUiSettings = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockMinimal,
}));

jest.mock('../../../contexts/TaskPaneContext', () => ({
    useTaskPane: () => ({
        openTaskUid: null,
        openTask: mockOpenTask,
        closeTask: jest.fn(),
    }),
}));

jest.mock('../../../utils/profileService', () => ({
    fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    updateUiSettings: (...args: unknown[]) => mockUpdateUiSettings(...args),
    getFirstDayOfWeek: jest.fn(() => Promise.resolve(1)),
    getLocaleFirstDayOfWeek: jest.fn(() => 1),
}));

const KEY = 'tag:work';

const monthPrefix = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${mm}`;
};

const makeTask = (overrides: Partial<Task>): Task =>
    ({
        id: 1,
        uid: 'a',
        name: 'Write report',
        priority: 'low',
        due_date: null,
        ...overrides,
    }) as unknown as Task;

const renderBody = (tasks: Task[], onTaskUpdate = jest.fn(), viewKey = KEY) => {
    const utils = render(
        <TaskViewBody
            viewKey={viewKey}
            tasks={tasks}
            onTaskUpdate={onTaskUpdate}
        >
            <p>LIST CONTENT</p>
        </TaskViewBody>
    );
    return { ...utils, onTaskUpdate };
};

describe('TaskViewBody', () => {
    let store: Record<string, string>;

    beforeEach(() => {
        mockMinimal = true;
        mockOpenTask.mockReset();
        store = {};
        mockFetchProfile.mockReset();
        mockFetchProfile.mockImplementation(() =>
            Promise.resolve({ ui_settings: { viewTypes: { ...store } } })
        );
        mockUpdateUiSettings.mockReset();
        mockUpdateUiSettings.mockImplementation(
            (settings: { viewTypes?: Record<string, string> }) => {
                Object.assign(store, settings.viewTypes || {});
                return Promise.resolve({ success: true });
            }
        );
    });

    describe('in Minimal', () => {
        it('shows the list with List selected by default', async () => {
            renderBody([]);

            expect(screen.getByText('LIST CONTENT')).toBeInTheDocument();
            expect(screen.getByTestId('view-type-list')).toHaveAttribute(
                'aria-pressed',
                'true'
            );
            await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
        });

        it('switching to board saves the choice under the view key', async () => {
            renderBody([makeTask({})]);

            fireEvent.click(screen.getByTestId('view-type-board'));

            expect(
                screen.getByTestId('task-priority-board')
            ).toBeInTheDocument();
            expect(screen.queryByText('LIST CONTENT')).not.toBeInTheDocument();
            expect(mockUpdateUiSettings).toHaveBeenCalledWith({
                viewTypes: { [KEY]: 'board' },
            });
        });

        it('switching to calendar saves the choice', async () => {
            renderBody([]);

            fireEvent.click(screen.getByTestId('view-type-calendar'));

            expect(
                screen.getByTestId('task-month-calendar')
            ).toBeInTheDocument();
            expect(mockUpdateUiSettings).toHaveBeenCalledWith({
                viewTypes: { [KEY]: 'calendar' },
            });
        });

        it('restores the saved choice after a remount', async () => {
            const first = renderBody([]);
            fireEvent.click(screen.getByTestId('view-type-calendar'));
            first.unmount();

            renderBody([]);

            await waitFor(() =>
                expect(
                    screen.getByTestId('view-type-calendar')
                ).toHaveAttribute('aria-pressed', 'true')
            );
            expect(
                screen.getByTestId('task-month-calendar')
            ).toBeInTheDocument();
        });

        it('keeps each view key on its own choice', async () => {
            store['tag:other'] = 'board';
            renderBody([], jest.fn(), KEY);

            await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
            expect(screen.getByTestId('view-type-list')).toHaveAttribute(
                'aria-pressed',
                'true'
            );
        });

        it('falls back to the list when the saved value is not a known type', async () => {
            store[KEY] = 'timeline';
            renderBody([]);

            await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
            expect(screen.getByText('LIST CONTENT')).toBeInTheDocument();
        });
    });

    describe('in Dense', () => {
        it('renders the list unchanged, with no switch', () => {
            mockMinimal = false;
            renderBody([]);

            expect(screen.getByText('LIST CONTENT')).toBeInTheDocument();
            expect(
                screen.queryByTestId('view-type-switch')
            ).not.toBeInTheDocument();
            expect(mockFetchProfile).not.toHaveBeenCalled();
        });
    });

    describe('board', () => {
        const showBoard = () =>
            fireEvent.click(screen.getByTestId('view-type-board'));

        it('groups tasks by priority, with an index-based priority', () => {
            renderBody([
                makeTask({ uid: 'h', priority: 'high' }),
                makeTask({ uid: 'm', priority: 'medium' }),
                makeTask({ uid: 'l', priority: 'low' }),
                makeTask({ uid: 'n', priority: null }),
                makeTask({
                    uid: 'i',
                    priority: 2 as unknown as Task['priority'],
                }),
            ]);
            showBoard();

            const high = screen.getByTestId('priority-column-high');
            expect(high).toContainElement(screen.getByTestId('board-card-h'));
            expect(high).toContainElement(screen.getByTestId('board-card-i'));
            expect(
                screen.getByTestId('priority-column-medium')
            ).toContainElement(screen.getByTestId('board-card-m'));
            expect(screen.getByTestId('priority-column-low')).toContainElement(
                screen.getByTestId('board-card-l')
            );
            expect(screen.getByTestId('priority-column-none')).toContainElement(
                screen.getByTestId('board-card-n')
            );
        });

        it('dropping a card in another column sets its priority', () => {
            const { onTaskUpdate } = renderBody([
                makeTask({ uid: 'a', priority: 'low' }),
            ]);
            showBoard();

            fireEvent.drop(screen.getByTestId('priority-column-high'), {
                dataTransfer: { getData: () => 'a' },
            });

            expect(onTaskUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ uid: 'a', priority: 'high' })
            );
        });

        it('dropping a card in the None column clears its priority', () => {
            const { onTaskUpdate } = renderBody([
                makeTask({ uid: 'a', priority: 'medium' }),
            ]);
            showBoard();

            fireEvent.drop(screen.getByTestId('priority-column-none'), {
                dataTransfer: { getData: () => 'a' },
            });

            expect(onTaskUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ uid: 'a', priority: null })
            );
        });

        it('dropping a card on its own column saves nothing', () => {
            const { onTaskUpdate } = renderBody([
                makeTask({ uid: 'a', priority: 'high' }),
            ]);
            showBoard();

            fireEvent.drop(screen.getByTestId('priority-column-high'), {
                dataTransfer: { getData: () => 'a' },
            });

            expect(onTaskUpdate).not.toHaveBeenCalled();
        });

        it('opens the task in the pane when its title is clicked', () => {
            renderBody([makeTask({ uid: 'open-me', name: 'Open me' })]);
            showBoard();

            fireEvent.click(screen.getByText('Open me'));

            expect(mockOpenTask).toHaveBeenCalledWith('open-me');
        });
    });

    describe('calendar', () => {
        it('shows the tasks due in the month', () => {
            renderBody([
                makeTask({
                    uid: 'c',
                    id: 7,
                    name: 'Pay rent',
                    due_date: `${monthPrefix()}-10`,
                }),
            ]);
            fireEvent.click(screen.getByTestId('view-type-calendar'));

            expect(screen.getByText('Pay rent')).toBeInTheDocument();
        });

        it('dropping a task on a day moves its due date there', async () => {
            const { onTaskUpdate } = renderBody([
                makeTask({
                    uid: 'c',
                    id: 7,
                    name: 'Pay rent',
                    due_date: `${monthPrefix()}-10`,
                }),
            ]);
            fireEvent.click(screen.getByTestId('view-type-calendar'));
            expect(screen.getByText('Pay rent')).toBeInTheDocument();

            const dayCell = screen.getByText('20', { selector: 'span' })
                .parentElement?.parentElement as HTMLElement;
            fireEvent.drop(dayCell, {
                dataTransfer: { getData: () => 'task-7' },
            });

            expect(onTaskUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    uid: 'c',
                    due_date: `${monthPrefix()}-20`,
                })
            );
        });
    });
});
