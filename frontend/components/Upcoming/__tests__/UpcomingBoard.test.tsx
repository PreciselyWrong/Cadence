import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import UpcomingBoard from '../UpcomingBoard';
import { useStore } from '../../../store/useStore';
import { applyPlanOps, fetchDay } from '../../../utils/dayService';
import {
    createTask,
    fetchTasks,
    updateTask,
} from '../../../utils/tasksService';
import { DayResponse } from '../../../utils/dayService';
import { Task } from '../../../entities/Task';

const TODAY = new Date().toISOString().slice(0, 10);

const mockOpenTask = jest.fn();
const mockCloseTask = jest.fn();

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: () => undefined },
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    ...jest.requireActual('../../../utils/dateUtils'),
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../contexts/TaskPaneContext', () => ({
    useTaskPane: () => ({
        openTaskUid: null,
        openTask: mockOpenTask,
        closeTask: mockCloseTask,
    }),
}));

const mockShowErrorToast = jest.fn();
const mockShowUndoToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: mockShowErrorToast,
        showUndoToast: mockShowUndoToast,
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/dayService', () => ({
    ...jest.requireActual('../../../utils/dayService'),
    fetchDay: jest.fn(),
    applyPlanOps: jest.fn(),
    restorePlan: jest.fn(),
}));

jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn(),
    fetchTasks: jest.fn(),
}));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn(async () => 1),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarEvents: jest.fn(async () => ({ events: [] })),
}));

jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn(async () => undefined),
    processInboxItemWithStore: jest.fn(async () => ({})),
}));

const task = (uid: string, name: string, fields: Partial<Task> = {}): Task =>
    ({
        uid,
        name,
        status: 0,
        estimated_minutes: 30,
        subtasks: [],
        tags: [],
        ...fields,
    }) as Task;

const dayWith = (
    date: string,
    items: { task: Task; start: number | null; duration: number }[],
    due: Task[] = []
): DayResponse =>
    ({
        date,
        is_today: date === TODAY,
        day_hours: { start: 480, end: 1080 },
        focus_blocks_of_day: [],
        plan: {
            uid: `plan-${date}`,
            date,
            started_at: null,
            items: items.map((entry, position) => ({
                task_uid: entry.task.uid,
                position,
                start_minute: entry.start,
                duration_minutes: entry.duration,
                task: entry.task,
            })),
        },
        etag: 'etag-1',
        due,
        overdue: [],
        suggestions: null,
        completed: [],
    }) as unknown as DayResponse;

const mockFetchDay = fetchDay as jest.MockedFunction<typeof fetchDay>;
const mockApply = applyPlanOps as jest.MockedFunction<typeof applyPlanOps>;
const mockCreate = createTask as jest.MockedFunction<typeof createTask>;
const mockFetchTasks = fetchTasks as jest.MockedFunction<typeof fetchTasks>;
const mockUpdate = updateTask as jest.MockedFunction<typeof updateTask>;

const isoWeekStart = (date: string): string => {
    const at = new Date(`${date}T00:00:00`);
    at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

const renderBoard = () =>
    render(
        <MemoryRouter>
            <UpcomingBoard />
        </MemoryRouter>
    );

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockFetchDay.mockImplementation(async (date?: string) => {
        if (date === TODAY) {
            return dayWith(
                TODAY,
                [
                    {
                        task: task('t1', 'Write report', {
                            Project: { name: 'Work', color: '#123456' },
                        } as Partial<Task>),
                        start: 600,
                        duration: 45,
                    },
                ],
                [task('t2', 'Pay bill')]
            );
        }
        return dayWith(date as string, []);
    });
    mockApply.mockResolvedValue({ plan: null, etag: 'etag-2' });
    useStore
        .getState()
        .inboxStore.setInboxItems([
            { uid: 'i1', content: 'Call the dentist', status: 'added' },
        ]);
});

describe('UpcomingBoard', () => {
    it('shows one column per day, with the day cards from fetchDay', async () => {
        renderBoard();
        const columns = await screen.findAllByTestId('upcoming-column');
        expect(columns).toHaveLength(3);
        expect(columns[0]).toHaveAttribute('data-date', TODAY);

        const today = within(columns[0]);
        expect(await today.findByText('Write report')).toBeInTheDocument();
        expect(today.getByText('10:00')).toBeInTheDocument();
        expect(today.getByText('Pay bill')).toBeInTheDocument();
        expect(today.getByText('Work')).toBeInTheDocument();
    });

    it('loads each day once, without a fetch loop', async () => {
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const calls = mockFetchDay.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(mockFetchDay.mock.calls.length).toBe(calls);
        expect(calls).toBeLessThanOrEqual(4);
    });

    it('titles the page Plan, with Days selected', async () => {
        renderBoard();
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Plan' })
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Days' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(screen.getByRole('button', { name: 'Horizons' })).toBeEnabled();
    });

    it('switches to Horizons: four columns from one task fetch, remembered', async () => {
        mockFetchTasks.mockResolvedValue({
            tasks: [
                task('w1', 'Plan the offsite', {
                    week_of: isoWeekStart(TODAY),
                }),
                task('s1', 'Learn the cello', {
                    tags: [{ name: 'someday' }],
                } as Partial<Task>),
            ],
            metrics: {} as never,
        });
        renderBoard();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Horizons' })
        );

        const columns = await screen.findAllByTestId('horizon-column');
        expect(columns.map((c) => c.getAttribute('data-horizon'))).toEqual([
            'week',
            'this_month',
            'next_month',
            'someday',
        ]);
        expect(
            await within(columns[0]).findByText('Plan the offsite')
        ).toBeInTheDocument();
        expect(
            within(columns[3]).getByText('Learn the cello')
        ).toBeInTheDocument();
        expect(
            within(columns[1]).getByText('Nothing here yet.')
        ).toBeInTheDocument();
        expect(screen.queryAllByTestId('upcoming-column')).toHaveLength(0);
        expect(mockFetchTasks).toHaveBeenCalledWith('?status=active');
        expect(
            JSON.parse(localStorage.getItem('upcoming.viewOptions') as string)
                .mode
        ).toBe('horizons');
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('hides and shows the calendar from the header', async () => {
        renderBoard();
        expect(
            await screen.findByTestId('upcoming-calendar')
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Hide calendar' })[0]
        );
        expect(
            screen.queryByTestId('upcoming-calendar')
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show calendar' }));
        expect(screen.getByTestId('upcoming-calendar')).toBeInTheDocument();
    });

    it('fetches every day of a 3-day calendar, which moves on its own', async () => {
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ calendarSpan: 3 })
        );
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        const calendar = screen.getByTestId('upcoming-calendar');
        const next = within(calendar).getByRole('button', { name: 'Next day' });
        fireEvent.click(next);
        const shift = (n: number) => {
            const at = new Date(`${TODAY}T00:00:00Z`);
            at.setUTCDate(at.getUTCDate() + n);
            return at.toISOString().slice(0, 10);
        };
        await waitFor(() => {
            const asked = mockFetchDay.mock.calls.map(([date]) => date);
            expect(asked).toEqual(
                expect.arrayContaining([shift(3), shift(4), shift(5)])
            );
        });
        // The board did not move.
        expect(screen.getAllByTestId('upcoming-column')[0]).toHaveAttribute(
            'data-date',
            TODAY
        );
    });

    it('hides the inbox column when the view says so', async () => {
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ showInbox: false })
        );
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        expect(screen.queryByTestId('inbox-column')).not.toBeInTheDocument();
    });

    it('shows the inbox pinned as the first column', async () => {
        renderBoard();
        expect(await screen.findByText('Call the dentist')).toBeInTheDocument();
        expect(screen.getByTestId('inbox-column')).toBeInTheDocument();
    });

    it('opens a card in the side pane on click', async () => {
        renderBoard();
        const cards = await screen.findAllByTestId('upcoming-card');
        fireEvent.click(
            cards.find((card) =>
                card.textContent?.includes('Write report')
            ) as HTMLElement
        );
        expect(mockOpenTask).toHaveBeenCalledWith('t1');
    });

    it('adds a task to its day: createTask, then an add op on that day', async () => {
        mockCreate.mockResolvedValue(task('t9', 'Buy milk'));
        renderBoard();
        await within(screen.getAllByTestId('upcoming-column')[0]).findByText(
            'Write report'
        );
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Add a task' })[0]
        );
        const input = screen.getByLabelText('Add a task');
        fireEvent.change(input, { target: { value: 'Buy milk' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'add', task_uid: 't9' }],
                'etag-1'
            )
        );
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Buy milk' })
        );
    });
});
