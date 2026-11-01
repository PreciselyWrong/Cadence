import React, { useEffect, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskRow from '../TaskRow';
import TaskPane from '../TaskPane';
import { RecurringScopeDialogHost } from '../RecurringScopeDialog';
import { TaskRowExpansionProvider } from '../TaskRow/TaskRowExpansionContext';
import {
    TaskPaneProvider,
    TASK_UPDATED_EVENT,
} from '../../../contexts/TaskPaneContext';
import { Task } from '../../../entities/Task';
import * as tasksService from '../../../utils/tasksService';
import { useIsMinimal } from '../../../hooks/useUiDensity';

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

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: jest.fn(),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/tasksService', () => ({
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn(),
    editTaskOccurrence: jest.fn(),
    deleteTaskOccurrence: jest.fn(),
    fetchSubtasks: jest.fn().mockResolvedValue([]),
    createTask: jest.fn(),
    deleteTask: jest.fn(),
    fetchTaskByUid: jest.fn(),
    fetchTaskRelations: jest.fn().mockResolvedValue([]),
    TASK_RELATIONS_CHANGED_EVENT: 'taskRelationsChanged',
}));

jest.mock('../../../utils/peopleService', () => ({
    fetchPeople: jest.fn().mockResolvedValue([]),
    fetchAssignablePeopleForProject: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

jest.mock('../../../utils/inboxService', () => ({
    analyzeInboxText: jest.fn(async (text: string) => ({
        cleaned_content: text,
        parsed_tags: [],
        parsed_projects: [],
        parsed_area: null,
        parsed_due_date: null,
    })),
}));

jest.mock('../TaskComments', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../TaskDetails/TaskAttachmentsCard', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('../../Inbox/QuickCaptureInput', () => {
    const React = jest.requireActual('react');
    const ComposerStub = React.forwardRef(
        ({ initialValue, onTextChange }: any, ref: any) => {
            React.useImperativeHandle(ref, () => ({
                focus: () => {},
                submit: async () => {},
            }));
            return (
                <input
                    defaultValue={initialValue}
                    onChange={(e) => onTextChange?.(e.target.value)}
                />
            );
        }
    );
    ComposerStub.displayName = 'ComposerStub';
    return { __esModule: true, default: ComposerStub };
});

jest.mock('../../../store/useStore', () => {
    const state: any = {
        tagsStore: { tags: [], loadTags: jest.fn(), addNewTags: jest.fn() },
        projectsStore: { projects: [] },
        areasStore: { areas: [] },
        tasksStore: { updateTaskInStore: jest.fn() },
    };
    const useStore: any = (selector?: any) =>
        selector ? selector(state) : state;
    useStore.getState = () => state;
    return { useStore };
});

const mockedUseIsMinimal = useIsMinimal as jest.Mock;
const mockedFetchTaskByUid = tasksService.fetchTaskByUid as jest.Mock;
const mockedUpdateTask = tasksService.updateTask as jest.Mock;
const mockedEditOccurrence = tasksService.editTaskOccurrence as jest.Mock;

const baseTask = {
    id: 1,
    uid: 'uid-1',
    name: 'Write report',
    status: 'not_started',
    priority: 'low',
    project_id: null,
    tags: [],
    subtasks: [],
} as unknown as Task;

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-search">{location.search}</div>;
};

// Mirrors the Tasks list: merges the saves the pane broadcasts.
const ListHarness = ({ initial = baseTask }: { initial?: Task }) => {
    const [tasks, setTasks] = useState<Task[]>([initial]);
    useEffect(() => {
        const onUpdated = (event: Event) => {
            const saved = (event as CustomEvent<Task>).detail;
            setTasks((prev) =>
                prev.map((task) => (task.uid === saved.uid ? saved : task))
            );
        };
        window.addEventListener(TASK_UPDATED_EVENT, onUpdated);
        return () => window.removeEventListener(TASK_UPDATED_EVENT, onUpdated);
    }, []);
    return (
        <TaskRowExpansionProvider>
            {tasks.map((task) => (
                <TaskRow
                    key={task.uid}
                    task={task}
                    onTaskUpdate={async () => {}}
                    onTaskDelete={jest.fn()}
                    projects={[]}
                />
            ))}
        </TaskRowExpansionProvider>
    );
};

const renderPage = (initial: Task = baseTask) =>
    render(
        <MemoryRouter initialEntries={['/today']}>
            <TaskPaneProvider>
                <ListHarness initial={initial} />
                <TaskPane />
                <LocationProbe />
                <RecurringScopeDialogHost />
            </TaskPaneProvider>
        </MemoryRouter>
    );

const titleInput = () => {
    const pane = screen.queryByRole('complementary', { name: 'Task details' });
    return pane ? (within(pane).queryAllByRole('textbox')[0] ?? null) : null;
};

describe('TaskPane in minimal mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseIsMinimal.mockReturnValue(true);
        mockedFetchTaskByUid.mockResolvedValue(baseTask);
        mockedUpdateTask.mockImplementation(async (_uid, partial) => ({
            ...baseTask,
            ...partial,
        }));
    });

    it('opens the pane with the task title and sets ?task= on a row click', async () => {
        renderPage();

        fireEvent.click(screen.getByText('Write report'));

        await waitFor(() => expect(titleInput()).toHaveValue('Write report'));
        expect(screen.getByTestId('location-search')).toHaveTextContent(
            '?task=uid-1'
        );
    });

    it('saves an edited title once and updates the list row', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));
        await waitFor(() => expect(titleInput()).not.toBeNull());
        const input = titleInput() as HTMLElement;

        mockedFetchTaskByUid.mockResolvedValue({
            ...baseTask,
            name: 'Renamed report',
        });
        fireEvent.change(input, { target: { value: 'Renamed report' } });
        fireEvent.blur(input);

        await waitFor(() =>
            expect(screen.getByText('Renamed report')).toBeInTheDocument()
        );
        expect(mockedUpdateTask).toHaveBeenCalledTimes(1);
        expect(mockedUpdateTask).toHaveBeenCalledWith(
            'uid-1',
            expect.objectContaining({ name: 'Renamed report' })
        );
    });

    it('closes on Escape and removes ?task=', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));
        await waitFor(() => expect(titleInput()).not.toBeNull());

        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => expect(titleInput()).toBeNull());
        expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/);
    });

    it('links to the full task page', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));
        const pane = await screen.findByRole('complementary', {
            name: 'Task details',
        });

        expect(
            within(pane).getByRole('link', { name: 'Open full page' })
        ).toHaveAttribute('href', '/task/uid-1');
    });

    describe('on a recurring task', () => {
        const series = {
            ...baseTask,
            recurrence_type: 'daily',
            due_date: '2026-11-02',
        } as unknown as Task;
        const copy = {
            ...baseTask,
            id: 2,
            uid: 'uid-copy',
            name: 'Renamed once',
            recurrence_type: 'none',
            due_date: '2026-11-02',
        } as unknown as Task;

        const renameInPane = async (name: string) => {
            renderPage(series);
            fireEvent.click(screen.getByText('Write report'));
            await waitFor(() => expect(titleInput()).not.toBeNull());
            const input = titleInput() as HTMLElement;
            fireEvent.change(input, { target: { value: name } });
            fireEvent.blur(input);
        };

        beforeEach(() => {
            mockedFetchTaskByUid.mockImplementation(async (uid: string) =>
                uid === 'uid-copy' ? copy : series
            );
            mockedEditOccurrence.mockResolvedValue({
                task: series,
                edited: copy,
            });
        });

        it('asks once on blur and sends the rename to that occurrence alone', async () => {
            await renameInPane('Renamed once');

            fireEvent.click(await screen.findByTestId('recurring-scope-this'));

            await waitFor(() =>
                expect(titleInput()).toHaveValue('Renamed once')
            );
            expect(mockedEditOccurrence).toHaveBeenCalledTimes(1);
            expect(mockedEditOccurrence).toHaveBeenCalledWith('uid-1', {
                scope: 'this',
                occurrence_date: '2026-11-02',
                changes: expect.objectContaining({ name: 'Renamed once' }),
            });
            expect(mockedUpdateTask).not.toHaveBeenCalled();
            expect(mockedFetchTaskByUid).toHaveBeenCalledWith('uid-copy');
        });

        it('keeps the saved title when the prompt is cancelled', async () => {
            await renameInPane('Not saved');

            fireEvent.click(
                await screen.findByTestId('recurring-scope-cancel')
            );

            await waitFor(() =>
                expect(
                    screen.queryByTestId('recurring-scope-dialog')
                ).not.toBeInTheDocument()
            );
            expect(mockedEditOccurrence).not.toHaveBeenCalled();
            expect(mockedUpdateTask).not.toHaveBeenCalled();
        });
    });
});

describe('Task row in dense mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseIsMinimal.mockReturnValue(false);
        mockedFetchTaskByUid.mockResolvedValue(baseTask);
    });

    it('still expands inline and opens no pane', () => {
        const { container } = renderPage();

        fireEvent.click(screen.getByText('Write report'));

        expect(container.querySelector('[data-task-expanded]')).not.toBeNull();
        expect(titleInput()).toBeNull();
        expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/);
    });
});
