import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayPage from '../TodayPage';
import {
    fetchDailyPlan,
    fetchPlanCandidates,
    saveDailyPlanItems,
} from '../../../utils/dailyPlanService';
import {
    fetchCalendarEvents,
    fetchCalendarFeeds,
} from '../../../utils/calendarFeedsService';
import { fetchCalendarTasks, updateTask } from '../../../utils/tasksService';

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

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            userSettingsStore: {
                aiAssistantEnabled: false,
                calendarEnabled: true,
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

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);
const addDaysTo = (date: string, days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TOMORROW = addDaysTo(TODAY, 1);
const NEXT_WEEK = addDaysTo(TODAY, 7);

const candidates = {
    in_progress: [],
    overdue: [],
    due_today: [],
    suggested: [],
    inbox: [],
    inbox_count: 0,
};

// A task due today that the plan holds, with no time yet.
const plannedItems = () => [
    {
        task_uid: 'w',
        position: 0,
        start_minute: null,
        duration_minutes: 30,
        task: { uid: 'w', name: 'Write report', status: 0, due_date: TODAY },
    },
    {
        task_uid: 'x',
        position: 1,
        start_minute: null,
        duration_minutes: 30,
        task: { uid: 'x', name: 'File receipts', status: 0, due_date: TODAY },
    },
];

const renderWithPlan = async () => {
    (fetchDailyPlan as jest.Mock).mockResolvedValue({
        date: TODAY,
        plan: {
            uid: 'p',
            date: TODAY,
            started_at: null,
            items: plannedItems(),
        },
    });
    render(<TodayPage />);
    // The Now card repeats the name, so wait for any match.
    await screen.findAllByText('Write report');
};

describe('TodayPage planned task date changes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockSearch = '';
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (fetchCalendarTasks as jest.Mock).mockResolvedValue([]);
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchCalendarEvents as jest.Mock).mockResolvedValue({
            date: TODAY,
            events: [],
            errors: [],
        });
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
        (updateTask as jest.Mock).mockResolvedValue({});
    });

    it('takes a planned task off today when it is moved to tomorrow in the list', async () => {
        window.localStorage.setItem('dailyPlanMode', 'list');
        await renderWithPlan();

        const row = screen.getByTestId('plan-row-w');
        fireEvent.click(within(row).getByText('Tomorrow'));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('w', {
                due_date: TOMORROW,
            })
        );
        await waitFor(() =>
            expect(screen.queryByTestId('plan-row-w')).not.toBeInTheDocument()
        );
        await waitFor(() =>
            expect(saveDailyPlanItems).toHaveBeenLastCalledWith(TODAY, [
                expect.objectContaining({ task_uid: 'x' }),
            ])
        );
        expect(mockShowUndoToast).toHaveBeenCalledWith(
            expect.stringContaining('Write report'),
            expect.any(Function)
        );
    });

    it('takes a planned task off today when it is moved to next week from the untimed tray', async () => {
        await renderWithPlan();

        const tray = screen.getByTestId('tray-w');
        fireEvent.click(within(tray).getByText('Next week'));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('w', {
                due_date: NEXT_WEEK,
            })
        );
        await waitFor(() =>
            expect(screen.queryByTestId('tray-w')).not.toBeInTheDocument()
        );
        await waitFor(() =>
            expect(saveDailyPlanItems).toHaveBeenLastCalledWith(TODAY, [
                expect.objectContaining({ task_uid: 'x' }),
            ])
        );
    });
});
