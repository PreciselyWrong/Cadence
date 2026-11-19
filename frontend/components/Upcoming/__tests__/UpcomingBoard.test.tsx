import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import UpcomingBoard from '../UpcomingBoard';
import {
    applyProposal,
    getProposal,
    listProposals,
} from '../../../utils/proposalsService';
import { decideTask, fetchReviewCategory } from '../../../utils/reviewService';
import { fetchCalendarEvents } from '../../../utils/calendarFeedsService';
import { useStore } from '../../../store/useStore';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';
import {
    PlanChangedError,
    applyPlanOps,
    fetchDay,
    restorePlan,
} from '../../../utils/dayService';
import { applyOpsLocally } from '../../Today/dayModel';
import type { DailyPlanItem } from '../../../utils/dailyPlanService';
import {
    createTask,
    fetchTasks,
    updateTask,
} from '../../../utils/tasksService';
import { DayResponse } from '../../../utils/dayService';
import { Task } from '../../../entities/Task';

const TODAY = new Date().toISOString().slice(0, 10);

let mockOpenTaskUid: string | null = null;
const mockOpenTask = jest.fn();
const mockCloseTask = jest.fn();

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: () => null,
}));

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
    TASK_UPDATED_EVENT: 'tududi:task-updated',
    useTaskPane: () => ({
        openTaskUid: mockOpenTaskUid,
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

// « À trier (N) » reads the triage queue from the server.
jest.mock('../../../utils/proposalsService', () => ({
    ...jest.requireActual('../../../utils/proposalsService'),
    listProposals: jest.fn().mockResolvedValue({ proposals: [], agent: true }),
    getProposal: jest.fn(),
    applyProposal: jest.fn(),
    sendProposal: jest.fn(),
    dismissProposal: jest.fn(),
    createProposal: jest.fn(),
}));

jest.mock('../../../utils/reviewService', () => ({
    ...jest.requireActual('../../../utils/reviewService'),
    fetchReviewCategory: jest.fn().mockResolvedValue({ total: 0, items: [] }),
    decideTask: jest.fn(),
}));

jest.mock('../../Inbox/TriageEntry', () => ({
    __esModule: true,
    default: () => null,
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
const mockRestore = restorePlan as jest.MockedFunction<typeof restorePlan>;

type Line = { task: Task; start: number | null; duration: number };

/**
 * A server holding each day's plan, as backend/modules/daily-plan does: the
 * etag changes on every write to a day (a move writes its target day too)
 * and a write with a stale If-Match is refused.
 */
const fakeServer = (
    plans: Record<string, Line[]>,
    due: Record<string, Task[]> = {}
) => {
    const items: Record<string, DailyPlanItem[]> = {};
    const versions: Record<string, number> = {};
    const tasks = new Map<string, Task>();
    Object.entries(plans).forEach(([date, lines]) => {
        items[date] = lines.map((line, position) => ({
            task_uid: line.task.uid as string,
            task: line.task,
            position,
            start_minute: line.start,
            duration_minutes: line.duration,
        }));
        lines.forEach((line) => tasks.set(line.task.uid as string, line.task));
    });
    Object.values(due)
        .flat()
        .forEach((t) => tasks.set(t.uid as string, t));
    const etagOf = (date: string) => `${date}@${versions[date] ?? 0}`;
    const bump = (date: string) => {
        versions[date] = (versions[date] ?? 0) + 1;
    };
    const planned = (uid?: string) =>
        Object.values(items).some((list) =>
            list.some((item) => item.task_uid === uid)
        );
    mockFetchDay.mockImplementation(async (date?: string) => {
        const on = date as string;
        const day = dayWith(
            on,
            [],
            (due[on] ?? []).filter((t) => !planned(t.uid))
        );
        return {
            ...day,
            plan: {
                ...(day.plan as NonNullable<DayResponse['plan']>),
                items: [...(items[on] ?? [])],
            },
            etag: etagOf(on),
        };
    });
    mockApply.mockImplementation(async (date, ops, etag) => {
        if (etag !== undefined && etag !== etagOf(date)) {
            throw new PlanChangedError();
        }
        for (const op of ops) {
            const before = items[date] ?? [];
            items[date] = applyOpsLocally(before, [op], tasks);
            if (op.op === 'move') {
                const line = before.find(
                    (item) => item.task_uid === op.task_uid
                );
                const target = items[op.to_date] ?? [];
                if (
                    line &&
                    !target.some((item) => item.task_uid === op.task_uid)
                ) {
                    items[op.to_date] = [
                        ...target,
                        {
                            ...line,
                            position: target.length,
                            start_minute: null,
                        },
                    ];
                }
                bump(op.to_date);
            }
        }
        bump(date);
        return { plan: null, etag: etagOf(date) };
    });
    const uids = (date: string) =>
        (items[date] ?? []).map((item) => item.task_uid);
    return { items, tasks, uids };
};

// Lets the pending loads and writes answer.
const settle = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 20)));

const CARD = '[data-testid="upcoming-card"]';
const cardIn = (date: string, name: string) =>
    within(column(date)).getByText(name).closest(CARD) as HTMLElement;

const isoWeekStart = (date: string): string => {
    const at = new Date(`${date}T00:00:00`);
    at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

const renderBoard = (path = '/upcoming') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <UpcomingBoard />
        </MemoryRouter>
    );

const shift = (n: number) => {
    const at = new Date(`${TODAY}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + n);
    return at.toISOString().slice(0, 10);
};
const TOMORROW = shift(1);

// The overdue strip's « ▾ » menu (all on one day), then one of its choices.
const replanOverdue = (strip: HTMLElement, choice: string) => {
    fireEvent.click(
        within(strip).getByRole('button', { name: 'All on one day' })
    );
    fireEvent.click(
        within(screen.getByTestId('overdue-replan-menu')).getByRole(
            'menuitem',
            { name: choice }
        )
    );
};

// Today's answer lists `late` as overdue.
const withOverdue = (late: Task[]) => {
    const base = mockFetchDay.getMockImplementation() as typeof fetchDay;
    mockFetchDay.mockImplementation(async (date?: string) => {
        const day = await base(date);
        return date === TODAY ? { ...day, overdue: late } : day;
    });
};

const column = (date: string) =>
    screen
        .getAllByTestId('upcoming-column')
        .find((el) => el.getAttribute('data-date') === date) as HTMLElement;

beforeEach(() => {
    jest.clearAllMocks();
    mockOpenTaskUid = null;
    localStorage.clear();
    // Most cases read the overdue cards: the strip starts open.
    localStorage.setItem('upcoming.overdueCollapsed', '0');
    // A desktop window: the calendar sits beside the board.
    window.innerWidth = 1440;
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
    // No unsorted task unless a test says so.
    mockFetchTasks.mockResolvedValue({ tasks: [], metrics: {} as never });
    useStore
        .getState()
        .inboxStore.setInboxItems([
            { uid: 'i1', content: 'Call the dentist', status: 'added' },
        ]);
});

describe('UpcomingBoard', () => {
    it('shows two weeks of day columns, with the day cards from fetchDay', async () => {
        renderBoard();
        const columns = await screen.findAllByTestId('upcoming-column');
        expect(columns).toHaveLength(14);
        expect(columns[0]).toHaveAttribute('data-date', TODAY);
        expect(columns[13]).toHaveAttribute('data-date', shift(13));

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
        expect(calls).toBe(14);
    });

    it('titles the page Plan, with Days selected', async () => {
        renderBoard();
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Plan' })
        ).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Days' })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        expect(screen.getByRole('tab', { name: 'Horizons' })).toBeEnabled();
    });

    it('switches to Horizons: five columns from one task fetch, remembered', async () => {
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
        fireEvent.click(await screen.findByRole('tab', { name: 'Horizons' }));

        const columns = await screen.findAllByTestId('horizon-column');
        expect(columns.map((c) => c.getAttribute('data-horizon'))).toEqual([
            'week',
            'next_week',
            'this_month',
            'next_month',
            'someday',
        ]);
        expect(
            await within(columns[0]).findByText('Plan the offsite')
        ).toBeInTheDocument();
        expect(
            within(columns[4]).getByText('Learn the cello')
        ).toBeInTheDocument();
        expect(
            within(columns[2]).getByText('Nothing planned.')
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

    it('moves by weeks from one nav bar; the calendar follows the selected day', async () => {
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ calendarSpan: 3 })
        );
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        // One navigation only: the calendar has no arrows of its own.
        expect(
            within(screen.getByTestId('upcoming-calendar')).queryByRole(
                'button',
                { name: /previous|next/i }
            )
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Next day' })
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
        await waitFor(() =>
            expect(screen.getAllByTestId('upcoming-column')[0]).toHaveAttribute(
                'data-date',
                shift(7)
            )
        );
        // Only the week that came into view is fetched.
        await waitFor(() => {
            const asked = mockFetchDay.mock.calls.map(([date]) => date);
            expect(asked).toEqual(expect.arrayContaining([shift(20)]));
            expect(asked.filter((date) => date === shift(8))).toHaveLength(1);
        });

        // A click on a column moves the calendar there.
        fireEvent.click(column(shift(12)));
        expect(
            within(screen.getByTestId('upcoming-calendar')).getByText(/–/)
                .textContent
        ).toContain(String(Number(shift(12).slice(8))));

        fireEvent.click(screen.getByRole('button', { name: 'Today' }));
        await waitFor(() =>
            expect(screen.getAllByTestId('upcoming-column')[0]).toHaveAttribute(
                'data-date',
                TODAY
            )
        );
    });

    it('clamps a stale calendar width and reports it on the splitter', async () => {
        localStorage.setItem('upcoming.calendarWidth', '1077');
        renderBoard();
        const splitter = await screen.findByRole('separator', {
            name: 'Calendar width',
        });
        expect(splitter).toHaveAttribute('aria-valuenow', '600');
        expect(splitter).toHaveAttribute('aria-valuemin', '280');
        expect(screen.getByTestId('upcoming-calendar')).toHaveStyle({
            width: '600px',
        });
    });

    it('widens the inbox column with its handle and remembers it', async () => {
        renderBoard();
        const splitter = await screen.findByRole('separator', {
            name: 'Inbox width',
        });
        const inbox = screen.getByTestId('inbox-column');
        expect(inbox).toHaveStyle({ width: '260px' });

        fireEvent.keyDown(splitter, { key: 'ArrowRight' });
        expect(screen.getByTestId('inbox-column')).toHaveStyle({
            width: '284px',
        });
        expect(splitter).toHaveAttribute('aria-valuenow', '284');
        expect(localStorage.getItem('upcoming.inboxWidth')).toBe('284');

        // A double click brings back the usual width.
        fireEvent.doubleClick(splitter);
        expect(screen.getByTestId('inbox-column')).toHaveStyle({
            width: '260px',
        });
    });

    it('scrolls the inbox and « À planifier » as one list with sticky headers', async () => {
        renderBoard();
        const inbox = await screen.findByTestId('inbox-column');
        const left = screen.getByTestId('plan-left-column');
        expect(left).toHaveClass('overflow-y-auto');
        expect(within(inbox).getByRole('list')).not.toHaveClass(
            'overflow-y-auto'
        );
        expect(inbox.querySelector('header')).toHaveClass('sticky', 'top-0');
    });

    it('keeps Today usable on today and names the calendar button', async () => {
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        const todayButton = screen.getByRole('button', { name: 'Today' });
        // Never greyed out: on today it brings today's column back in view.
        expect(todayButton).toBeEnabled();
        expect(todayButton).toHaveAttribute('aria-current', 'date');
        // The header's button (the calendar pane has its own « Hide »).
        expect(
            screen.getAllByRole('button', { name: 'Hide calendar' })[0]
        ).toHaveTextContent('Calendar');
    });

    it('opens the inbox field on N, not while typing', async () => {
        renderBoard();
        await screen.findByTestId('inbox-column');
        fireEvent.keyDown(document.body, { key: 'n' });
        const field = await screen.findByPlaceholderText('Add a task');
        expect(field).toHaveFocus();
        fireEvent.change(field, { target: { value: 'n' } });
        fireEvent.keyDown(field, { key: 'n' });
        expect(screen.getAllByPlaceholderText('Add a task')).toHaveLength(1);
    });

    describe('the AI week previewed on the board', () => {
        // Today holds « Write report » (t1, planned) and « Pay bill » (t2,
        // due only). The AI moves t1 to tomorrow and t2 to next month.
        const proposal = (status = 'ready') => ({
            uid: 'p1',
            kind: 'week',
            status,
            facts: {
                today: TODAY,
                period: { start: TODAY, end: shift(6) },
                days: [
                    {
                        date: TODAY,
                        events: [],
                        planned: ['t1'],
                        load_minutes: 45,
                    },
                ],
                tasks: [
                    { uid: 't1', name: 'Write report', estimate_min: 45 },
                    { uid: 't2', name: 'Pay bill', due: TODAY },
                ],
            },
            answer: {
                headline: 'Lighter today',
                questions: [],
                changes: [
                    {
                        task_uid: 't1',
                        op: 'plan_day',
                        date: TOMORROW,
                        reason: 'Tomorrow is free',
                    },
                    { task_uid: 't2', op: 'next_month', reason: '' },
                ],
            },
            days: [
                {
                    date: TOMORROW,
                    load_minutes: 0,
                    capacity_minutes: 600,
                    items: [],
                    events: [
                        {
                            title: 'Dentist',
                            start: '10:00',
                            end: '11:00',
                            all_day: false,
                        },
                    ],
                    work: null,
                },
            ],
        });

        beforeEach(() => {
            (getProposal as jest.Mock).mockResolvedValue(proposal());
        });

        it('shows the proposal on the days: the card where it goes, a trace where it was', async () => {
            renderBoard('/upcoming?proposal=p1');
            const banner = await screen.findByTestId('week-preview-banner');
            expect(
                within(banner).getByText('Lighter today')
            ).toBeInTheDocument();

            const card = await within(column(TOMORROW)).findByTestId(
                'preview-card'
            );
            expect(card).toHaveTextContent('Write report');
            expect(card).toHaveTextContent('Tomorrow is free');
            const trace = within(column(TODAY)).getAllByTestId(
                'preview-trace'
            )[0];
            expect(trace).toHaveTextContent('Write report');
            // The day's agenda is in the column.
            expect(
                within(column(TOMORROW)).getByTestId('preview-events')
            ).toHaveTextContent('Dentist');

            // Hovering one rings the other, sizes unchanged.
            fireEvent.mouseEnter(card);
            expect(trace).toHaveAttribute('data-linked', 'true');
            fireEvent.mouseLeave(card);
            expect(trace).not.toHaveAttribute('data-linked');
        });

        it('opens the task from the card menu, and keeps it where it is on refuse', async () => {
            renderBoard('/upcoming?proposal=p1');
            const card = await within(column(TOMORROW)).findByTestId(
                'preview-card'
            );
            fireEvent.click(card);
            fireEvent.click(
                screen.getByRole('menuitem', { name: 'Show the task' })
            );
            expect(mockOpenTask).toHaveBeenCalledWith('t1');

            fireEvent.click(
                within(column(TOMORROW)).getByTestId('preview-card')
            );
            fireEvent.click(
                screen.getByRole('menuitem', {
                    name: 'Refuse: keep it where it is',
                })
            );
            expect(
                within(column(TOMORROW)).queryByTestId('preview-card')
            ).not.toBeInTheDocument();
        });

        it('applies the decisions, the user’s own included, and leaves the preview', async () => {
            (applyProposal as jest.Mock).mockResolvedValue({
                uid: 'p1',
                status: 'applied',
                results: [
                    { task_uid: 't1', state: 'applied' },
                    { task_uid: 't2', state: 'applied' },
                ],
            });
            renderBoard('/upcoming?proposal=p1');
            const card = await within(column(TOMORROW)).findByTestId(
                'preview-card'
            );
            fireEvent.click(card);
            fireEvent.click(
                screen.getByRole('menuitemcheckbox', { name: 'Mark as done' })
            );
            fireEvent.click(screen.getByTestId('week-preview-apply'));
            await waitFor(() =>
                expect(applyProposal).toHaveBeenCalledWith('p1', {
                    decisions: [
                        { task_uid: 't1', op: 'done' },
                        { task_uid: 't2', op: 'next_month' },
                    ],
                })
            );
            await waitFor(() =>
                expect(
                    screen.queryByTestId('week-preview-banner')
                ).not.toBeInTheDocument()
            );
        });

        it('folds a horizon list of the preview and remembers it', async () => {
            renderBoard('/upcoming?proposal=p1');
            await screen.findByTestId('preview-horizons');
            const month = screen
                .getAllByTestId('preview-horizon')
                .find((el) => el.dataset.horizon === 'next_month')!;
            expect(
                within(month).getByTestId('preview-card')
            ).toBeInTheDocument();
            fireEvent.click(
                within(month).getByRole('button', { expanded: true })
            );
            expect(within(month).queryByTestId('preview-card')).toBeNull();
            expect(
                localStorage.getItem('upcoming.previewCollapsed.next_month')
            ).toBe('1');
        });

        it('adds a « Planned by AI » tab once the week is ready, and leaves it for Days', async () => {
            (listProposals as jest.Mock).mockResolvedValue({
                proposals: [{ uid: 'p1', kind: 'week', status: 'ready' }],
                agent: true,
            });
            renderBoard();
            const tab = await screen.findByTestId('ai-tab');
            expect(screen.queryByTestId('week-preview-banner')).toBeNull();
            fireEvent.click(tab);
            expect(
                await screen.findByTestId('week-preview-banner')
            ).toBeInTheDocument();
            fireEvent.click(screen.getByRole('tab', { name: 'Horizons' }));
            await waitFor(() =>
                expect(screen.queryByTestId('week-preview-banner')).toBeNull()
            );
            expect(screen.getByTestId('ai-tab')).toBeInTheDocument();
        });

        it('says when the AI is still preparing the week', async () => {
            (getProposal as jest.Mock).mockResolvedValue({
                ...proposal('pending'),
                answer: null,
            });
            renderBoard('/upcoming?proposal=p1');
            expect(
                await screen.findByText('The AI is preparing your week…')
            ).toBeInTheDocument();
        });
    });

    describe('selection of several cards', () => {
        const cardOf = (name: string) =>
            within(column(TODAY))
                .getByText(name)
                .closest('[data-testid="upcoming-card"]') as HTMLElement;

        it('picks cards with Ctrl or Shift click and plans them together', async () => {
            renderBoard();
            await within(column(TODAY)).findByText('Write report');
            fireEvent.click(cardOf('Write report'), { ctrlKey: true });
            fireEvent.click(cardOf('Pay bill'), { shiftKey: true });
            // Picking never opens the task.
            expect(mockOpenTask).not.toHaveBeenCalled();
            expect(cardOf('Write report')).toHaveAttribute(
                'data-picked',
                'true'
            );
            const bar = screen.getByRole('toolbar', { name: 'Selected: 2' });

            fireEvent.click(
                within(bar).getByRole('button', { name: 'Tomorrow' })
            );
            await waitFor(() =>
                expect(mockApply).toHaveBeenCalledWith(
                    TOMORROW,
                    [
                        expect.objectContaining({ op: 'slot', task_uid: 't1' }),
                        { op: 'add', task_uid: 't2' },
                    ],
                    expect.anything()
                )
            );
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'remove', task_uid: 't1' }],
                expect.anything()
            );
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
        });

        it('moves the whole selection with t from a picked card', async () => {
            renderBoard();
            await within(column(TODAY)).findByText('Write report');
            fireEvent.click(cardOf('Pay bill'), { ctrlKey: true });
            fireEvent.click(cardOf('Write report'), { metaKey: true });
            fireEvent.keyDown(cardOf('Pay bill'), { key: 'T', shiftKey: true });
            await waitFor(() =>
                expect(mockApply).toHaveBeenCalledWith(
                    TOMORROW,
                    expect.arrayContaining([
                        { op: 'add', task_uid: 't2' },
                        expect.objectContaining({ op: 'slot', task_uid: 't1' }),
                    ]),
                    expect.anything()
                )
            );
        });

        it('clears with Escape or a second Ctrl click', async () => {
            renderBoard();
            await within(column(TODAY)).findByText('Write report');
            fireEvent.click(cardOf('Write report'), { ctrlKey: true });
            fireEvent.click(cardOf('Pay bill'), { ctrlKey: true });
            fireEvent.click(cardOf('Pay bill'), { ctrlKey: true });
            expect(
                screen.getByRole('toolbar', { name: 'Selected: 1' })
            ).toBeInTheDocument();
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
            expect(cardOf('Write report')).not.toHaveAttribute('data-picked');
        });
    });

    it('opens the inbox at its remembered width', async () => {
        localStorage.setItem('upcoming.inboxWidth', '400');
        renderBoard();
        expect(await screen.findByTestId('inbox-column')).toHaveStyle({
            width: '400px',
        });
    });

    it('shows the calendar as a drawer on a narrow window', async () => {
        window.innerWidth = 1024;
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        expect(
            screen.queryByTestId('upcoming-calendar')
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show calendar' }));
        expect(screen.getByTestId('upcoming-calendar')).toHaveAttribute(
            'data-drawer',
            'true'
        );
        expect(
            screen.queryByRole('separator', { name: 'Calendar width' })
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Close the calendar' })
        );
        expect(
            screen.queryByTestId('upcoming-calendar')
        ).not.toBeInTheDocument();
    });

    it('lists overdue tasks above the board and plans them all today', async () => {
        const late = task('late', 'Renew passport', {
            due_date: shift(-3),
        } as Partial<Task>);
        const base = mockFetchDay.getMockImplementation() as typeof fetchDay;
        mockFetchDay.mockImplementation(async (date?: string) => {
            const day = await base(date);
            return date === TODAY ? { ...day, overdue: [late] } : day;
        });
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        expect(within(strip).getByText('Overdue (1)')).toBeInTheDocument();
        expect(within(strip).getByText('Renew passport')).toBeInTheDocument();

        replanOverdue(strip, 'Today');
        // At once: the strip empties, the task is on today.
        expect(
            screen.queryByTestId('upcoming-overdue')
        ).not.toBeInTheDocument();
        expect(
            within(column(TODAY)).getByText('Renew passport')
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'add', task_uid: 'late' }],
                'etag-1'
            )
        );
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    // The review saw a moved card vanish from both columns until a reload.
    // Seen in the browser: a slotted card lost its time on its new day.
    it('shows a slotted card moved to tomorrow there at once, at its time, and refreshes both days', async () => {
        renderBoard();
        const card = await within(column(TODAY)).findByText('Write report');
        await settle();
        const before = mockFetchDay.mock.calls.length;
        let release: () => void = () => undefined;
        mockApply.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = () => resolve({ plan: null, etag: 'etag-2' });
                })
        );
        fireEvent.keyDown(card.closest(CARD) as HTMLElement, {
            key: 'T',
            shiftKey: true,
        });
        // Before the server answers.
        const moved = within(column(TOMORROW));
        expect(moved.getByText('Write report')).toBeInTheDocument();
        expect(moved.getByText('10:00')).toBeInTheDocument();
        expect(
            within(column(TODAY)).queryByText('Write report')
        ).not.toBeInTheDocument();
        await waitFor(() => expect(mockApply).toHaveBeenCalled());
        expect(mockApply).toHaveBeenCalledWith(
            TOMORROW,
            [
                {
                    op: 'slot',
                    task_uid: 't1',
                    start_minute: 600,
                    duration_minutes: 45,
                },
            ],
            'etag-1'
        );
        await act(async () => release());
        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'remove', task_uid: 't1' }],
                'etag-1'
            )
        );
        await waitFor(() => {
            const asked = mockFetchDay.mock.calls
                .slice(before)
                .map(([date]) => date);
            expect(asked).toEqual(expect.arrayContaining([TODAY, TOMORROW]));
            expect(asked.length).toBeLessThanOrEqual(2);
        });
    });

    it('puts the card back and says so when the move fails', async () => {
        renderBoard();
        const card = await within(column(TODAY)).findByText('Write report');
        mockApply.mockRejectedValueOnce(new Error('boom'));
        fireEvent.keyDown(
            card.closest('[data-testid="upcoming-card"]') as HTMLElement,
            { key: 'T', shiftKey: true }
        );
        await waitFor(() => expect(mockShowErrorToast).toHaveBeenCalled());
        expect(
            within(column(TODAY)).getByText('Write report')
        ).toBeInTheDocument();
        expect(
            within(column(TOMORROW)).queryByText('Write report')
        ).not.toBeInTheDocument();
    });

    it('moves the keyboard focus between days and cards', async () => {
        renderBoard();
        const report = (
            await within(column(TODAY)).findByText('Write report')
        ).closest('[data-testid="upcoming-card"]') as HTMLElement;
        report.focus();
        fireEvent.keyDown(report, { key: 'j' });
        expect(document.activeElement).toHaveTextContent('Pay bill');
        fireEvent.keyDown(document.activeElement as HTMLElement, {
            key: 'ArrowRight',
        });
        // Tomorrow has no card: its first button takes the focus.
        expect(column(TOMORROW)).toContainElement(
            document.activeElement as HTMLElement
        );
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('collapses an empty inbox into a bar in Horizons, never in Days', async () => {
        useStore.getState().inboxStore.setInboxItems([]);
        const { unmount } = renderBoard();
        await screen.findAllByTestId('upcoming-column');
        expect(screen.getByTestId('inbox-column')).not.toHaveAttribute(
            'data-collapsed'
        );
        unmount();
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ mode: 'horizons' })
        );
        renderBoard();
        await screen.findAllByTestId('horizon-column');
        expect(screen.getByTestId('inbox-column')).toHaveAttribute(
            'data-collapsed',
            'true'
        );
    });

    it('refreshes only the days showing a task saved in the side pane', async () => {
        renderBoard();
        await within(column(TODAY)).findByText('Write report');
        await new Promise((resolve) => setTimeout(resolve, 50));
        const before = mockFetchDay.mock.calls.length;
        window.dispatchEvent(
            new CustomEvent('tududi:task-updated', {
                detail: { uid: 't1', name: 'Write report' },
            })
        );
        await waitFor(() =>
            expect(mockFetchDay.mock.calls.length).toBeGreaterThan(before)
        );
        expect(
            mockFetchDay.mock.calls.slice(before).map(([date]) => date)
        ).toEqual([TODAY]);
    });

    it('adds a task to a horizon: created, then committed to it', async () => {
        mockFetchTasks.mockResolvedValue({ tasks: [], metrics: {} as never });
        mockCreate.mockResolvedValue(task('h1', 'Book flights'));
        mockUpdate.mockResolvedValue(task('h1', 'Book flights'));
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ mode: 'horizons' })
        );
        renderBoard();
        const columns = await screen.findAllByTestId('horizon-column');
        // The horizon's meaning is its tooltip, no longer a line.
        expect(
            within(columns[4]).getByRole('heading', { name: /^Someday/ })
        ).toHaveAttribute('title', 'Maybe later, out of the way');
        fireEvent.click(
            within(columns[3]).getByRole('button', {
                name: 'Add a task to Next month',
            })
        );
        const input = within(columns[3]).getByLabelText('Add a task');
        fireEvent.change(input, { target: { value: 'Book flights' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('h1', {
                month_of: 'next_month',
                week_of: null,
            })
        );
    });

    it('keeps the inbox column when an old view hid it', async () => {
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ showInbox: false })
        );
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        expect(screen.getByTestId('inbox-column')).toBeInTheDocument();
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
        // The sheet shows the day and slot the card is planned on.
        expect(mockOpenTask).toHaveBeenCalledWith('t1', {
            date: TODAY,
            startMinute: 600,
        });
    });

    it('adds a task to its day: createTask, then an add op on that day', async () => {
        mockCreate.mockResolvedValue(task('t9', 'Buy milk'));
        renderBoard();
        await within(screen.getAllByTestId('upcoming-column')[0]).findByText(
            'Write report'
        );
        fireEvent.click(
            within(column(TODAY)).getByRole('button', {
                name: /^Add a task to /,
            })
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

    it('sends a second move of the same card after the first, with the fresh etag', async () => {
        const D1 = shift(1);
        const D2 = shift(2);
        const server = fakeServer({
            [TODAY]: [
                { task: task('m1', 'Water plants'), start: null, duration: 30 },
            ],
        });
        renderBoard();
        await within(column(TODAY)).findByText('Water plants');
        await settle();
        fireEvent.keyDown(cardIn(TODAY, 'Water plants'), {
            key: 'ArrowRight',
            shiftKey: true,
        });
        // At once, before the first write is answered.
        fireEvent.keyDown(cardIn(D1, 'Water plants'), {
            key: 'ArrowRight',
            shiftKey: true,
        });
        await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(2));
        await settle();
        expect(mockShowErrorToast).not.toHaveBeenCalled();
        expect(
            mockApply.mock.calls.map(([date, , etag]) => [date, etag])
        ).toEqual([
            [TODAY, `${TODAY}@0`],
            [D1, `${D1}@1`],
        ]);
        expect(server.uids(D2)).toEqual(['m1']);
        expect(server.uids(D1)).toEqual([]);
        expect(
            within(column(D2)).getByText('Water plants')
        ).toBeInTheDocument();
    });

    it('sends two adds on today one after the other', async () => {
        const server = fakeServer({ [TODAY]: [] });
        mockCreate.mockImplementation(async (input: Task) => {
            const created = task(`new-${input.name}`, input.name as string);
            server.tasks.set(created.uid as string, created);
            return created;
        });
        renderBoard();
        await settle();
        fireEvent.click(
            within(column(TODAY)).getByRole('button', {
                name: /^Add a task to /,
            })
        );
        const input = within(column(TODAY)).getByLabelText('Add a task');
        fireEvent.change(input, { target: { value: 'Buy milk' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        fireEvent.change(input, { target: { value: 'Buy bread' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(2));
        await settle();
        expect(mockShowErrorToast).not.toHaveBeenCalled();
        expect(mockApply.mock.calls.map(([, , etag]) => etag)).toEqual([
            `${TODAY}@0`,
            `${TODAY}@1`,
        ]);
        expect(server.uids(TODAY)).toEqual(['new-Buy milk', 'new-Buy bread']);
    });

    it('undoes a move without taking back a later one', async () => {
        const server = fakeServer({
            [TODAY]: [
                { task: task('t1', 'Write report'), start: 600, duration: 45 },
                { task: task('t3', 'Call mom'), start: null, duration: 30 },
            ],
        });
        renderBoard();
        await within(column(TODAY)).findByText('Call mom');
        await settle();
        // A: Call mom to tomorrow. B: Write report to tomorrow.
        fireEvent.keyDown(cardIn(TODAY, 'Call mom'), {
            key: 'T',
            shiftKey: true,
        });
        await settle();
        fireEvent.keyDown(cardIn(TODAY, 'Write report'), {
            key: 'T',
            shiftKey: true,
        });
        await settle();
        expect(server.uids(TOMORROW)).toEqual(['t3', 't1']);
        const undoA = mockShowUndoToast.mock.calls[0][1] as () => void;
        act(() => undoA());
        await settle();
        expect(mockShowErrorToast).not.toHaveBeenCalled();
        expect(mockRestore).not.toHaveBeenCalled();
        expect(server.uids(TODAY)).toEqual(['t3']);
        expect(server.uids(TOMORROW)).toEqual(['t1']);
        expect(server.items[TOMORROW][0].start_minute).toBe(600);
        expect(within(column(TODAY)).getByText('Call mom')).toBeInTheDocument();
        expect(
            within(column(TOMORROW)).getByText('Write report')
        ).toBeInTheDocument();
    });

    it('moves a horizon card already planned on a day instead of planning it twice', async () => {
        mockFetchTasks.mockResolvedValue({
            tasks: [
                task('w1', 'Plan the offsite', {
                    week_of: isoWeekStart(TODAY),
                }),
            ],
            metrics: {} as never,
        });
        const server = fakeServer({
            [TODAY]: [
                {
                    task: task('w1', 'Plan the offsite', {
                        week_of: isoWeekStart(TODAY),
                    }),
                    start: null,
                    duration: 30,
                },
            ],
        });
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ mode: 'horizons' })
        );
        renderBoard();
        const week = (await screen.findAllByTestId('horizon-column'))[0];
        const card = (
            await within(week).findByText('Plan the offsite')
        ).closest(CARD) as HTMLElement;
        await settle();
        fireEvent.keyDown(card, { key: 'T', shiftKey: true });
        await settle();
        expect(mockApply).toHaveBeenCalledWith(
            TODAY,
            [{ op: 'move', task_uid: 'w1', to_date: TOMORROW }],
            `${TODAY}@0`
        );
        expect(mockApply).toHaveBeenCalledTimes(1);
        expect(server.uids(TODAY)).toEqual([]);
        expect(server.uids(TOMORROW)).toEqual(['w1']);
    });

    it.each(['Semicolon', 'KeyM'])(
        'picks a card up with the M key whatever the layout (code %s)',
        async (code) => {
            renderBoard();
            const card = (
                await within(column(TODAY)).findByText('Write report')
            ).closest(CARD) as HTMLElement;
            card.focus();
            fireEvent.keyDown(card, { key: 'm', code });
            expect(
                await screen.findByText('“Write report” picked up')
            ).toBeInTheDocument();
        }
    );

    it('plans the overdue tasks tomorrow and drops them from the strip', async () => {
        withOverdue([
            task('late', 'Renew passport', {
                due_date: shift(-3),
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        await settle();
        const todayLoads = () =>
            mockFetchDay.mock.calls.filter(([date]) => date === TODAY).length;
        const loadsBefore = todayLoads();
        replanOverdue(strip, 'Tomorrow');
        // At once: the strip empties, the task is on tomorrow.
        expect(
            screen.queryByTestId('upcoming-overdue')
        ).not.toBeInTheDocument();
        expect(
            within(column(TOMORROW)).getByText('Renew passport')
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TOMORROW,
                [{ op: 'add', task_uid: 'late' }],
                'etag-1'
            )
        );
        await waitFor(() =>
            expect(mockShowUndoToast).toHaveBeenCalledWith(
                'Overdue tasks replanned',
                expect.any(Function)
            )
        );
        // Today is reloaded: its answer no longer lists the task.
        expect(todayLoads()).toBeGreaterThan(loadsBefore);
    });

    it('lists the overdue tasks in the left column, above the inbox, one under the other', async () => {
        withOverdue([
            task('late', 'Renew passport', {
                due_date: shift(-3),
            } as Partial<Task>),
            task('later', 'Call the bank', {
                due_date: shift(-2),
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        const left = screen.getByTestId('plan-left-column');
        expect(left).toContainElement(strip);
        const inbox = within(left).getByTestId('inbox-column');
        expect(
            strip.compareDocumentPosition(inbox) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        // Cards stack: the arrows move down the list.
        const cards = within(strip).getAllByTestId('upcoming-card');
        cards[0].focus();
        fireEvent.keyDown(cards[0], { key: 'ArrowDown' });
        expect(cards[1]).toHaveFocus();
    });

    it('shows the overdue tasks as one line until opened', async () => {
        localStorage.removeItem('upcoming.overdueCollapsed');
        withOverdue([
            task('late', 'Renew passport', {
                due_date: shift(-3),
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        expect(strip).toHaveAttribute('data-collapsed', 'true');
        expect(within(strip).queryByText('Renew passport')).toBeNull();
        fireEvent.click(within(strip).getByText('Overdue (1)'));
        expect(within(strip).getByText('Renew passport')).toBeInTheDocument();
        expect(localStorage.getItem('upcoming.overdueCollapsed')).toBe('0');
    });

    it('names the last day the spread used', async () => {
        withOverdue([
            task('minor', 'Sort photos', {
                due_date: shift(-9),
                priority: 'low',
            } as Partial<Task>),
            task('urgent', 'Renew passport', {
                due_date: shift(-2),
                priority: 'high',
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        await settle();
        fireEvent.click(
            within(strip).getByRole('button', { name: 'Reschedule' })
        );
        await waitFor(() =>
            expect(mockShowUndoToast).toHaveBeenCalledWith(
                `Overdue tasks spread until ${new Intl.DateTimeFormat('en', {
                    weekday: 'long',
                }).format(new Date(`${shift(2)}T12:00:00`))}`,
                expect.any(Function)
            )
        );
    });

    it('spreads the overdue tasks over the lightest of the next 7 days', async () => {
        // Today holds « Write report » (30 min): the others are empty.
        withOverdue([
            task('minor', 'Sort photos', {
                due_date: shift(-9),
                priority: 'low',
            } as Partial<Task>),
            task('urgent', 'Renew passport', {
                due_date: shift(-2),
                priority: 'high',
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        await settle();
        fireEvent.click(
            within(strip).getByRole('button', { name: 'Reschedule' })
        );
        await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(2));
        expect(mockApply).toHaveBeenCalledWith(
            TOMORROW,
            [{ op: 'add', task_uid: 'urgent' }],
            'etag-1'
        );
        expect(mockApply).toHaveBeenCalledWith(
            shift(2),
            [{ op: 'add', task_uid: 'minor' }],
            'etag-1'
        );
    });

    it('plans the overdue tasks on a picked day, not before today', async () => {
        withOverdue([
            task('late', 'Renew passport', {
                due_date: shift(-3),
            } as Partial<Task>),
        ]);
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        replanOverdue(strip, 'Pick a date…');
        const month = await screen.findByTestId('overdue-replan-date');
        const yesterday = month.querySelector(
            `[data-date="${shift(-1)}"]`
        ) as HTMLButtonElement | null;
        if (yesterday) expect(yesterday).toBeDisabled();
        fireEvent.click(
            month.querySelector(`[data-date="${TODAY}"]`) as HTMLElement
        );
        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'add', task_uid: 'late' }],
                'etag-1'
            )
        );
        expect(
            screen.queryByTestId('overdue-replan-date')
        ).not.toBeInTheDocument();
    });

    it('shows the plugin buttons of the overdue place in the strip', async () => {
        usePluginMenuStore.setState({
            loaded: true,
            items: [
                {
                    id: 'hermes',
                    label: 'Agents',
                    path: '/plugins/hermes',
                    file: 'index.html',
                },
            ],
            actions: [
                {
                    plugin: 'hermes',
                    id: 'plan-overdue',
                    label: 'Proposer un plan',
                    places: ['overdue'],
                },
            ],
        });
        withOverdue([
            task('late', 'Renew passport', {
                due_date: shift(-3),
            } as Partial<Task>),
        ]);
        try {
            renderBoard();
            const strip = await screen.findByTestId('upcoming-overdue');
            expect(
                within(strip).getByRole('button', { name: 'Proposer un plan' })
            ).toBeInTheDocument();
        } finally {
            usePluginMenuStore.setState({ items: [], actions: [] });
        }
    });

    it('reschedules only the overdue tasks the filters show', async () => {
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({
                filters: { projectIds: [], tagNames: [], priorities: ['high'] },
            })
        );
        const urgent = task('late1', 'Renew passport', {
            due_date: shift(-3),
            priority: 'high',
        } as Partial<Task>);
        const minor = task('late2', 'Sort photos', {
            due_date: shift(-2),
            priority: 'low',
        } as Partial<Task>);
        const base = mockFetchDay.getMockImplementation() as typeof fetchDay;
        mockFetchDay.mockImplementation(async (date?: string) => {
            const day = await base(date);
            return date === TODAY ? { ...day, overdue: [urgent, minor] } : day;
        });
        renderBoard();
        const strip = await screen.findByTestId('upcoming-overdue');
        expect(within(strip).getByText('Overdue (1)')).toBeInTheDocument();
        replanOverdue(strip, 'Today');
        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'add', task_uid: 'late1' }],
                'etag-1'
            )
        );
    });

    it('keeps the typed line and says so when it names no task', async () => {
        renderBoard();
        await settle();
        fireEvent.click(
            within(column(TODAY)).getByRole('button', {
                name: /^Add a task to /,
            })
        );
        const input = within(column(TODAY)).getByLabelText('Add a task');
        fireEvent.change(input, { target: { value: 'tomorrow' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        await waitFor(() =>
            expect(mockShowErrorToast).toHaveBeenCalledWith(
                'Add a name for the task'
            )
        );
        expect(mockCreate).not.toHaveBeenCalled();
        expect(input).toHaveValue('tomorrow');
    });

    it('tells the open sheet the day its task moved to', async () => {
        mockOpenTaskUid = 't1';
        fakeServer({
            [TODAY]: [
                { task: task('t1', 'Write report'), start: 600, duration: 45 },
            ],
        });
        renderBoard();
        await within(column(TODAY)).findByText('Write report');
        await settle();
        fireEvent.keyDown(cardIn(TODAY, 'Write report'), {
            key: 'T',
            shiftKey: true,
        });
        await settle();
        expect(mockOpenTask).toHaveBeenLastCalledWith('t1', {
            date: TOMORROW,
            startMinute: 600,
        });
    });

    it('adds a task, not an inbox item, from the + of the inbox column', async () => {
        useStore.getState().inboxStore.setInboxItems([]);
        useStore
            .getState()
            .projectsStore.setProjects([{ id: 7, name: 'Home' } as never]);
        let unsorted: Task[] = [];
        mockFetchTasks.mockImplementation(async (query?: string) => ({
            tasks: query === '?type=unsorted' ? unsorted : [],
            metrics: {} as never,
        }));
        mockCreate.mockImplementation(async (data: Task) => {
            const created = task('n1', data.name, data);
            unsorted = [created];
            return created;
        });
        mockUpdate.mockResolvedValue(task('n1', 'Fix the tap'));
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        fireEvent.click(
            screen.getByRole('button', { name: 'Add a task to Inbox' })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });
        fireEvent.change(input, { target: { value: 'Fix the tap #Home' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Fix the tap', project_id: 7 })
            )
        );
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('due_date');
        // Filed in a project, it still waits in « Tâches à classer ».
        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith('n1', { needs_when: true })
        );
        const inbox = screen.getByTestId('inbox-column');
        expect(
            await within(inbox).findByText('Fix the tap')
        ).toBeInTheDocument();
        expect(mockApply).not.toHaveBeenCalled();
        expect(input).toHaveValue('');
        expect(input).toBeInTheDocument();
    });

    it('plans a task typed in the inbox with a date on that day', async () => {
        mockFetchTasks.mockResolvedValue({ tasks: [], metrics: {} as never });
        mockCreate.mockResolvedValue(task('n2', 'Call mum'));
        renderBoard();
        await within(column(TODAY)).findByText('Write report');
        fireEvent.click(
            screen.getByRole('button', { name: 'Add a task to Inbox' })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });
        fireEvent.change(input, { target: { value: 'Call mum tomorrow' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(mockApply).toHaveBeenCalledWith(
                TOMORROW,
                [{ op: 'add', task_uid: 'n2' }],
                'etag-1'
            )
        );
        expect(mockCreate.mock.calls[0][0]).toMatchObject({ name: 'Call mum' });
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('due_date');
    });

    it('lists unsorted tasks in the inbox column and plans one from there', async () => {
        const loose = task('u1', 'Renew the car insurance');
        mockFetchTasks.mockImplementation(async (query?: string) => ({
            tasks: query === '?type=unsorted' ? [loose] : [],
            metrics: {} as never,
        }));
        const server = fakeServer({ [TODAY]: [] });
        server.tasks.set('u1', loose);
        renderBoard();
        const inbox = screen.getByTestId('inbox-column');
        const card = (
            await within(inbox).findByText('Renew the car insurance')
        ).closest(CARD) as HTMLElement;
        // Tasks first, then the ideas.
        expect(
            Array.from(
                inbox.querySelectorAll(
                    '[data-testid="upcoming-card"], [data-testid="inbox-card"]'
                )
            ).map((el) => el.textContent)
        ).toEqual([
            expect.stringContaining('Renew the car insurance'),
            expect.stringContaining('Call the dentist'),
        ]);
        await settle();
        fireEvent.keyDown(card, { key: 'T', shiftKey: true });
        await settle();

        expect(mockApply).toHaveBeenCalledWith(
            TOMORROW,
            [{ op: 'add', task_uid: 'u1' }],
            `${TOMORROW}@0`
        );
        expect(server.uids(TOMORROW)).toEqual(['u1']);
        // Planned on a day, it leaves the inbox column.
        expect(
            within(inbox).queryByText('Renew the car insurance')
        ).not.toBeInTheDocument();
        expect(
            within(column(TOMORROW)).getByText('Renew the car insurance')
        ).toBeInTheDocument();
    });

    it('counts unsorted tasks with the ideas on the collapsed bar', async () => {
        useStore.getState().inboxStore.setInboxItems([]);
        mockFetchTasks.mockImplementation(async (query?: string) => ({
            tasks: query === '?type=unsorted' ? [task('u1', 'Loose task')] : [],
            metrics: {} as never,
        }));
        localStorage.setItem('upcoming.inboxCollapsed', '1');
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ mode: 'horizons' })
        );
        renderBoard();
        expect(
            await screen.findByRole('button', { name: 'Show the inbox (1)' })
        ).toBeEnabled();
    });

    it('opens an unsorted task of the inbox column in the side pane', async () => {
        mockFetchTasks.mockImplementation(async (query?: string) => ({
            tasks: query === '?type=unsorted' ? [task('u1', 'Loose task')] : [],
            metrics: {} as never,
        }));
        renderBoard();
        const inbox = screen.getByTestId('inbox-column');
        fireEvent.click(await within(inbox).findByText('Loose task'));
        expect(mockOpenTask).toHaveBeenCalledWith('u1', undefined);
    });

    it('opens This week on its planned tasks when nothing else is in it', async () => {
        mockFetchTasks.mockResolvedValue({ tasks: [], metrics: {} as never });
        fakeServer({
            [TODAY]: [
                { task: task('p1', 'Dentist'), start: null, duration: 30 },
            ],
        });
        localStorage.setItem(
            'upcoming.viewOptions',
            JSON.stringify({ mode: 'horizons' })
        );
        renderBoard();
        const week = (await screen.findAllByTestId('horizon-column'))[0];
        expect(
            await within(week).findByText('1 planned on a day')
        ).toBeInTheDocument();
        const toggle = within(week).getByRole('button', {
            name: /Planned on a day/,
        });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(within(week).getByText('Dentist')).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    describe('left column of the Days layout', () => {
        const nextWeekStart = () => {
            const at = new Date(`${isoWeekStart(TODAY)}T00:00:00Z`);
            at.setUTCDate(at.getUTCDate() + 7);
            return at.toISOString().slice(0, 10);
        };
        const horizonTasks = () => [
            task('w1', 'Prepare the meeting', {
                week_of: isoWeekStart(TODAY),
            } as Partial<Task>),
            task('n1', 'Call the notary', {
                week_of: nextWeekStart(),
            } as Partial<Task>),
            task('m1', 'Renew the domain', {
                month_of: `${TODAY.slice(0, 8)}01`,
            } as Partial<Task>),
            task('s1', 'Learn the cello', {
                tags: [{ name: 'someday' }],
            } as Partial<Task>),
        ];
        const sections = () =>
            Array.from(
                screen
                    .getByTestId('plan-left-column')
                    .querySelectorAll(
                        '[data-testid="upcoming-overdue"], [data-testid="inbox-column"], [data-testid="horizon-column"]'
                    )
            ).map(
                (el) =>
                    (el as HTMLElement).dataset.horizon ??
                    el.getAttribute('data-testid')
            );

        beforeEach(() => {
            const tasks = horizonTasks();
            mockFetchTasks.mockImplementation(async (query?: string) => ({
                tasks: query === '?status=active' ? tasks : [],
                metrics: {} as never,
            }));
        });

        it('lists what has no day in time order, each horizon once, and no strip', async () => {
            withOverdue([
                task('late', 'Renew passport', {
                    due_date: shift(-3),
                } as Partial<Task>),
            ]);
            renderBoard();
            await screen.findByText('Prepare the meeting');
            expect(sections()).toEqual([
                'upcoming-overdue',
                'inbox-column',
                'week',
                'next_week',
                'this_month',
                'next_month',
                'someday',
            ]);
            expect(screen.queryByTestId('horizon-strip')).toBeNull();
            expect(screen.queryByTestId('to-plan-box')).toBeNull();
            expect(screen.getAllByText('Prepare the meeting')).toHaveLength(1);
            // The week section carries the week's load.
            const week = screen
                .getAllByTestId('horizon-column')
                .find((el) => el.dataset.horizon === 'week')!;
            expect(within(week).getByTestId('week-load')).toBeInTheDocument();
        });

        it('plans a horizon task on today with t, and it leaves its section', async () => {
            const server = fakeServer({}, { '2099-01-01': horizonTasks() });
            renderBoard();
            const card = (await screen.findByText('Call the notary')).closest(
                CARD
            ) as HTMLElement;
            await settle();
            fireEvent.keyDown(card, { key: 't' });
            await waitFor(() => expect(server.uids(TODAY)).toEqual(['n1']));
            await waitFor(() =>
                expect(
                    within(column(TODAY)).getByText('Call the notary')
                ).toBeInTheDocument()
            );
            expect(screen.getAllByText('Call the notary')).toHaveLength(1);
        });

        it('folds a section and remembers it; Someday starts folded', async () => {
            renderBoard();
            await screen.findByText('Prepare the meeting');
            expect(screen.queryByText('Learn the cello')).toBeNull();
            const next = screen
                .getAllByTestId('horizon-column')
                .find((el) => el.dataset.horizon === 'next_week')!;
            fireEvent.click(
                within(next).getByRole('button', { expanded: true })
            );
            expect(screen.queryByText('Call the notary')).toBeNull();
            expect(
                localStorage.getItem('upcoming.leftCollapsed.next_week')
            ).toBe('1');
        });
    });

    it('merges the calendar into the day columns and hides the side calendar', async () => {
        useStore.getState().userSettingsStore.setCalendarEnabled(true);
        (fetchCalendarEvents as jest.Mock).mockImplementation(
            async (date: string) => ({
                events:
                    date === TOMORROW
                        ? [
                              {
                                  uid: 'e1',
                                  title: 'Dentist',
                                  all_day: false,
                                  busy: true,
                                  start_minute: 600,
                                  end_minute: 660,
                              },
                          ]
                        : [],
            })
        );
        renderBoard();
        await screen.findAllByTestId('upcoming-column');
        expect(screen.getByTestId('upcoming-calendar')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Merged calendar' })
        );
        expect(screen.queryByTestId('upcoming-calendar')).toBeNull();
        expect(
            await within(column(TOMORROW)).findByText('Dentist')
        ).toBeInTheDocument();
        expect(
            within(column(TOMORROW)).getByText('10:00–11:00')
        ).toBeInTheDocument();
        expect(
            JSON.parse(localStorage.getItem('upcoming.viewOptions') as string)
                .mergeCalendar
        ).toBe(true);
        useStore.getState().userSettingsStore.setCalendarEnabled(false);
    });

    describe('tasks pushed back again and again', () => {
        const pushedPage = () => ({
            total: 1,
            items: [
                {
                    task: task('t1', 'Write report'),
                    push: {
                        recent_count: 4,
                        total_count: 6,
                        last_postponed_on: shift(-1),
                        last_planned_for: shift(-1),
                        frequent: true,
                    },
                },
            ],
        });

        beforeEach(() => {
            (fetchReviewCategory as jest.Mock).mockResolvedValue(pushedPage());
        });

        it('marks the card on its day and lists it in « Pushed back » on the left', async () => {
            renderBoard();
            const badge = await within(column(TODAY)).findByTestId(
                'pushed-badge'
            );
            expect(badge).toHaveTextContent('4×');
            const section = screen.getByTestId('pushed-section');
            expect(screen.getByTestId('plan-left-column')).toContainElement(
                section
            );
            expect(
                within(section).getByText('Write report')
            ).toBeInTheDocument();
            expect(
                within(section).getByText(/4× in 30 days/)
            ).toBeInTheDocument();
        });

        it('decides from the row: later sends it to Someday and resets the count', async () => {
            (decideTask as jest.Mock).mockResolvedValue({});
            renderBoard();
            const section = await screen.findByTestId('pushed-section');
            fireEvent.click(
                within(section).getByRole('button', { name: /Write report/ })
            );
            fireEvent.click(screen.getByRole('menuitem', { name: 'Later' }));
            await waitFor(() =>
                expect(decideTask).toHaveBeenCalledWith('t1', {
                    later: true,
                    reviewed: true,
                })
            );
        });

        it('shows nothing when no task is pushed back', async () => {
            (fetchReviewCategory as jest.Mock).mockResolvedValue({
                total: 0,
                items: [],
            });
            renderBoard();
            await within(column(TODAY)).findByText('Write report');
            expect(screen.queryByTestId('pushed-section')).toBeNull();
            expect(screen.queryByTestId('pushed-badge')).toBeNull();
        });
    });

    describe('sending a card to a horizon', () => {
        it('sends a planned card to next week: off its day, committed, one undo', async () => {
            const server = fakeServer({
                [TODAY]: [
                    { task: task('p1', 'Dentist'), start: null, duration: 30 },
                ],
            });
            mockUpdate.mockResolvedValue({} as Task);
            renderBoard();
            await within(column(TODAY)).findByText('Dentist');
            await settle();
            fireEvent.keyDown(cardIn(TODAY, 'Dentist'), {
                key: 'W',
                shiftKey: true,
            });
            await settle();
            expect(mockUpdate).toHaveBeenCalledWith('p1', {
                week_of: 'next_week',
                month_of: null,
            });
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'remove', task_uid: 'p1' }],
                `${TODAY}@0`
            );
            expect(server.uids(TODAY)).toEqual([]);
            expect(mockShowUndoToast).toHaveBeenCalledTimes(1);

            const undo = mockShowUndoToast.mock.calls[0][1] as () => void;
            act(() => undo());
            await settle();
            expect(server.uids(TODAY)).toEqual(['p1']);
            expect(mockUpdate).toHaveBeenLastCalledWith('p1', {
                week_of: null,
                month_of: null,
            });
        });

        it('sends a card to a horizon from its right-click menu', async () => {
            fakeServer({
                [TODAY]: [
                    { task: task('p1', 'Dentist'), start: null, duration: 30 },
                ],
            });
            mockUpdate.mockResolvedValue({} as Task);
            renderBoard();
            await within(column(TODAY)).findByText('Dentist');
            await settle();
            fireEvent.contextMenu(cardIn(TODAY, 'Dentist'));
            fireEvent.click(await screen.findByTestId('card-send-someday'));
            await settle();
            expect(mockUpdate).toHaveBeenCalledWith('p1', { later: true });
            expect(mockApply).toHaveBeenCalledWith(
                TODAY,
                [{ op: 'remove', task_uid: 'p1' }],
                `${TODAY}@0`
            );
        });
    });
});
