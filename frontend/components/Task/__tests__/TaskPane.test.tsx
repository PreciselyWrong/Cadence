import React, { useEffect, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskRow from '../TaskRow';
import TaskPane, { formatPlannedWhen, parsePlannedOn } from '../TaskPane';
import { RecurringScopeDialogHost } from '../RecurringScopeDialog';
import { TaskRowExpansionProvider } from '../TaskRow/TaskRowExpansionContext';
import {
    TaskPaneProvider,
    TASK_UPDATED_EVENT,
    useTaskPane,
} from '../../../contexts/TaskPaneContext';
import { Task } from '../../../entities/Task';
import * as tasksService from '../../../utils/tasksService';
import { useIsMinimal } from '../../../hooks/useUiDensity';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string, values?: Record<string, string>) =>
            (fallback ?? _key).replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en-GB' },
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
    const pane = screen.queryByRole('dialog');
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

    it('shows no Subtasks or Comments heading on a task without either', async () => {
        renderPage();

        fireEvent.click(screen.getByText('Write report'));

        await waitFor(() => expect(titleInput()).toHaveValue('Write report'));
        expect(
            screen.queryByRole('heading', { name: /subtasks|comments/i })
        ).toBeNull();
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

    it('opens as the floating sheet, never a side column', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));

        const sheet = await screen.findByRole('dialog');
        expect(sheet.className).toContain('md:absolute');
        expect(sheet.className).not.toContain('md:w-[420px]');
        expect(
            within(sheet).getByRole('button', { name: 'Expand' })
        ).toBeInTheDocument();
    });

    it('closes on a second click on the same row', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));
        await waitFor(() => expect(titleInput()).not.toBeNull());

        fireEvent.click(screen.getAllByText('Write report')[0]);

        await waitFor(() => expect(titleInput()).toBeNull());
        expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/);
    });

    it('closes on a click outside the sheet, not on a task row', async () => {
        renderPage();
        fireEvent.click(screen.getByText('Write report'));
        await waitFor(() => expect(titleInput()).not.toBeNull());

        const row = document.querySelector('[data-task-row]') as Element;
        fireEvent.pointerDown(row);
        expect(titleInput()).not.toBeNull();

        fireEvent.pointerDown(document.body);
        await waitFor(() => expect(titleInput()).toBeNull());
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
    it('still shows the sheet for a task opened by ?task=', async () => {
        render(
            <MemoryRouter initialEntries={['/inbox?task=uid-1']}>
                <TaskPaneProvider>
                    <TaskPane />
                </TaskPaneProvider>
            </MemoryRouter>
        );
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

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

describe('parsePlannedOn', () => {
    it('reads the day and an optional start minute', () => {
        expect(parsePlannedOn('?task=uid-1&on=2026-11-12&at=600')).toEqual({
            date: '2026-11-12',
            minute: 600,
        });
        expect(parsePlannedOn('?task=uid-1&on=2026-11-12')).toEqual({
            date: '2026-11-12',
            minute: null,
        });
    });

    it('ignores a malformed day or an out-of-range minute', () => {
        expect(parsePlannedOn('?on=12-11-2026')).toBeNull();
        expect(parsePlannedOn('?on=2026-02-31x')).toBeNull();
        expect(parsePlannedOn('?task=uid-1')).toBeNull();
        expect(parsePlannedOn('?on=2026-11-12&at=1440')).toEqual({
            date: '2026-11-12',
            minute: null,
        });
    });
});

describe('formatPlannedWhen', () => {
    it('gives the weekday, day, month and start time', () => {
        expect(
            formatPlannedWhen({ date: '2026-11-12', minute: 600 }, 'en-GB')
        ).toBe('Thu 12 Nov · 10:00');
    });

    it('omits the time when the plan has no start', () => {
        expect(
            formatPlannedWhen({ date: '2026-11-12', minute: null }, 'en-GB')
        ).toBe('Thu 12 Nov');
    });
});

describe('TaskPane as a floating sheet', () => {
    const Opener = () => {
        const { openTask } = useTaskPane();
        return (
            <button type="button" onClick={() => openTask('uid-1')}>
                Open task
            </button>
        );
    };

    // Goes to another page with the same task open, as a sidebar link
    // keeping ?task= would.
    const Elsewhere = () => {
        const navigate = useNavigate();
        return (
            <button
                type="button"
                onClick={() => navigate('/project/p1?task=uid-1')}
            >
                Go elsewhere
            </button>
        );
    };

    const renderSheet = (path: string) =>
        render(
            <MemoryRouter initialEntries={[path]}>
                <TaskPaneProvider>
                    <Opener />
                    <Elsewhere />
                    <TaskPane />
                    <LocationProbe />
                </TaskPaneProvider>
            </MemoryRouter>
        );

    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseIsMinimal.mockReturnValue(true);
        mockedFetchTaskByUid.mockResolvedValue(baseTask);
    });

    it('is a non-modal dialog named after the task title', async () => {
        renderSheet('/today?task=uid-1');

        const dialog = await screen.findByRole('dialog', {
            name: 'Write report',
        });
        expect(dialog).toHaveAttribute('aria-modal', 'false');
    });

    it('moves focus into the sheet and returns it to the opener on Escape', async () => {
        renderSheet('/today');
        const opener = screen.getByRole('button', { name: 'Open task' });
        opener.focus();
        fireEvent.click(opener);

        const dialog = await screen.findByRole('dialog', {
            name: 'Write report',
        });
        await waitFor(() => expect(dialog).toHaveFocus());

        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        );
        expect(opener).toHaveFocus();
    });

    it('shows the planned day and time from the calendar that opened it', async () => {
        renderSheet('/today?task=uid-1&on=2026-11-12&at=600');

        expect(
            await screen.findByTestId('task-planned-label')
        ).toHaveTextContent('Planned Thu 12 Nov · 10:00');
    });

    it('drops the planned day when the sheet closes', async () => {
        renderSheet('/today?task=uid-1&on=2026-11-12&at=600');
        await screen.findByTestId('task-planned-label');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() =>
            expect(screen.getByTestId('location-search')).toHaveTextContent(
                /^$/
            )
        );
    });

    const expandButton = () =>
        within(screen.getByRole('dialog')).getByRole('button', {
            name: /Expand|Shrink/,
        });

    it('floats again on the next open after an expanded sheet closes', async () => {
        renderSheet('/today');
        fireEvent.click(screen.getByRole('button', { name: 'Open task' }));
        await screen.findByRole('dialog', { name: 'Write report' });
        fireEvent.click(expandButton());
        expect(expandButton()).toHaveAttribute('aria-pressed', 'true');

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: 'Open task' }));
        await screen.findByRole('dialog', { name: 'Write report' });
        expect(expandButton()).toHaveAttribute('aria-pressed', 'false');
    });

    it('goes back to the floating sheet on another page', async () => {
        renderSheet('/today?task=uid-1');
        await screen.findByRole('dialog', { name: 'Write report' });
        fireEvent.click(expandButton());
        expect(expandButton()).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Go elsewhere' }));

        await waitFor(() =>
            expect(expandButton()).toHaveAttribute('aria-pressed', 'false')
        );
    });
});
