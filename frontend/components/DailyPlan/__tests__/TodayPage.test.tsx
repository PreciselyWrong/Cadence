import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayPage from '../TodayPage';
import {
    fetchDailyPlan,
    fetchPlanCandidates,
    saveDailyPlanItems,
    startDailyPlan,
} from '../../../utils/dailyPlanService';
import {
    fetchCalendarEvents,
    fetchCalendarFeeds,
} from '../../../utils/calendarFeedsService';
import {
    fetchCalendarTasks,
    toggleTaskCompletion,
} from '../../../utils/tasksService';

// A stable t, like i18next's: the page reloads when t changes.
jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('react-i18next', () => {
    const t = (
        _key: string,
        fallback: string | Record<string, unknown>,
        values?: Record<string, unknown>
    ) => {
        const options = typeof fallback === 'object' ? fallback : values;
        const text =
            typeof fallback === 'string'
                ? fallback
                : String(fallback?.defaultValue ?? _key);
        return text.replace(/{{(\w+)}}/g, (_m, name) =>
            String(options?.[name] ?? '')
        );
    };
    const i18n = { language: 'en' };
    return { useTranslation: () => ({ t, i18n }) };
});

// The day lives in ?date=; the setter only records it, the test re-renders.
let mockSearch = '';
const mockSetSearchParams = jest.fn((next: Record<string, string>) => {
    mockSearch = next.date ? `?date=${next.date}` : '';
});
jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
    useLocation: () => ({ pathname: '/today' }),
    useSearchParams: () => [
        new URLSearchParams(mockSearch),
        mockSetSearchParams,
    ],
}));

let mockCalendarEnabled = true;
jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            userSettingsStore: {
                aiAssistantEnabled: false,
                calendarEnabled: mockCalendarEnabled,
            },
        }),
}));

const mockShowUndoToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
        showUndoToast: mockShowUndoToast,
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../utils/tasksService', () => ({
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
    fetchCalendarTasks: jest.fn(),
}));

jest.mock('../../../utils/dailyPlanService', () => ({
    ...jest.requireActual('../../../utils/dailyPlanService'),
    fetchDailyPlan: jest.fn(),
    fetchPlanCandidates: jest.fn(),
    saveDailyPlanItems: jest.fn(),
    startDailyPlan: jest.fn(),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest.fn(),
    fetchCalendarEvents: jest.fn(),
}));

const candidates = {
    in_progress: [],
    overdue: [{ uid: 'o1', name: 'Renew insurance', status: 0 }],
    due_today: [{ uid: 'd1', name: 'Pay invoice', status: 0 }],
    suggested: [],
    inbox: [],
    inbox_count: 0,
};

// Candidates come from the server only for the real today.
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);
const emptyDay = { date: TODAY, plan: null };

describe('TodayPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockCalendarEnabled = true;
        (fetchDailyPlan as jest.Mock).mockResolvedValue(emptyDay);
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (fetchCalendarTasks as jest.Mock).mockResolvedValue([]);
        mockSearch = '';
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([
            { uid: 'f1', name: 'Work', show_on_calendar: true },
        ]);
        (fetchCalendarEvents as jest.Mock).mockResolvedValue({
            date: TODAY,
            events: [],
            errors: [],
        });
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
        (startDailyPlan as jest.Mock).mockResolvedValue({});
    });

    it('shows candidates on Today without a planning gate', async () => {
        render(<TodayPage />);

        expect(await screen.findByTestId('candidate-o1')).toBeInTheDocument();
        expect(screen.getByTestId('candidate-d1')).toBeInTheDocument();
        expect(screen.getByTestId('day-timeline')).toBeInTheDocument();
        expect(screen.queryByTestId('plan-your-day')).not.toBeInTheDocument();
        expect(screen.queryByTestId('start-my-day')).not.toBeInTheDocument();
    });

    it('completes a candidate from its round check and removes it', async () => {
        (toggleTaskCompletion as jest.Mock).mockResolvedValue({
            uid: 'o1',
            name: 'Renew insurance',
            status: 2,
        });
        render(<TodayPage />);

        const card = await screen.findByTestId('candidate-o1');
        fireEvent.click(within(card).getByTestId('task-check-circle'));

        await waitFor(() =>
            expect(screen.queryByTestId('candidate-o1')).not.toBeInTheDocument()
        );
        expect(toggleTaskCompletion).toHaveBeenCalledWith(
            'o1',
            expect.objectContaining({ uid: 'o1' })
        );
        expect(mockShowUndoToast).toHaveBeenCalled();
    });

    it('saves a placed candidate and starts the day once', async () => {
        // A free slot must remain today, so the clock reads 08:00.
        jest.useFakeTimers({
            now: new Date(`${TODAY}T08:00:00Z`),
            doNotFake: [
                'setTimeout',
                'clearTimeout',
                'setInterval',
                'clearInterval',
                'setImmediate',
                'clearImmediate',
                'queueMicrotask',
                'nextTick',
                'requestAnimationFrame',
                'cancelAnimationFrame',
                'performance',
                'hrtime',
            ],
        });
        render(<TodayPage />);

        fireEvent.click(await screen.findByTestId('add-d1'));
        await waitFor(() =>
            expect(saveDailyPlanItems).toHaveBeenCalledWith(TODAY, [
                expect.objectContaining({
                    task_uid: 'd1',
                    start_minute: expect.any(Number),
                }),
            ])
        );
        await waitFor(() => expect(startDailyPlan).toHaveBeenCalledWith(TODAY));

        fireEvent.click(screen.getByTestId('add-o1'));
        await waitFor(() =>
            expect(saveDailyPlanItems).toHaveBeenCalledTimes(2)
        );
        expect(startDailyPlan).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('hides the calendar and remembers the choice', async () => {
        render(<TodayPage />);

        await screen.findByTestId('day-timeline');
        fireEvent.click(screen.getByTitle('Hide calendar'));

        expect(screen.queryByTestId('day-timeline')).not.toBeInTheDocument();
        expect(window.localStorage.getItem('today.calendarOpen')).toBe('false');
        expect(screen.getByTestId('candidate-o1')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Show calendar'));
        expect(await screen.findByTestId('day-timeline')).toBeInTheDocument();
        expect(window.localStorage.getItem('today.calendarOpen')).toBe('true');
    });

    it('leaves calendars out when the Calendar feature is off', async () => {
        mockCalendarEnabled = false;

        render(<TodayPage />);

        await screen.findByTestId('candidate-o1');
        expect(fetchCalendarFeeds).not.toHaveBeenCalled();
        expect(fetchCalendarEvents).not.toHaveBeenCalled();
    });

    it('leaves events of calendars hidden from Calendar out of the timeline', async () => {
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([
            { uid: 'f1', name: 'Work', show_on_calendar: false },
        ]);

        render(<TodayPage />);

        await screen.findByTestId('candidate-o1');
        expect(fetchCalendarEvents).not.toHaveBeenCalled();
    });

    it('moves the day with the arrows and keeps it in ?date=', async () => {
        (fetchDailyPlan as jest.Mock).mockImplementation(
            async (date?: string) => ({ date: date ?? TODAY, plan: null })
        );
        const tomorrow = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'UTC',
        }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
        (fetchCalendarTasks as jest.Mock).mockImplementation(
            async (start: string) =>
                start === tomorrow
                    ? [
                          {
                              uid: 'n1',
                              id: 9,
                              name: 'Next day task',
                              status: 0,
                              due_date: tomorrow,
                          },
                      ]
                    : []
        );

        const { rerender } = render(<TodayPage />);
        await screen.findByTestId('candidate-o1');
        fireEvent.click(screen.getByTestId('day-next'));

        expect(mockSetSearchParams).toHaveBeenLastCalledWith({
            date: tomorrow,
        });
        rerender(<TodayPage />);
        expect(await screen.findByTestId('candidate-n1')).toBeInTheDocument();
        expect(fetchDailyPlan).toHaveBeenLastCalledWith(tomorrow, {});
        expect(screen.queryByTestId('candidate-o1')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('day-today'));
        expect(mockSetSearchParams).toHaveBeenLastCalledWith({});
    });

    it('lists the day chronologically in Agenda mode and remembers it', async () => {
        render(<TodayPage />);

        await screen.findByTestId('day-timeline');
        fireEvent.click(screen.getByTestId('panel-agenda'));

        expect(await screen.findByTestId('agenda-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('day-timeline')).not.toBeInTheDocument();
        expect(window.localStorage.getItem('today.panelMode')).toBe('agenda');
    });

    it('resizes the left column with the splitter and remembers the width', async () => {
        render(<TodayPage />);

        const splitter = await screen.findByTestId('pane-splitter');
        const left = screen.getByTestId('left-pane');
        expect(left).toHaveStyle({ width: '400px' });

        fireEvent.keyDown(splitter, { key: 'ArrowRight' });

        expect(left).toHaveStyle({ width: '424px' });
        expect(window.localStorage.getItem('today.leftWidth')).toBe('424');

        fireEvent.keyDown(splitter, { key: 'Home' });
        expect(left).toHaveStyle({ width: '280px' });
    });
});
