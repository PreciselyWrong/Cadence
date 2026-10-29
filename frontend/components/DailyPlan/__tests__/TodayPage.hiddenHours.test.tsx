import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { fetchCalendarTasks } from '../../../utils/tasksService';
import { fetchProfile } from '../../../utils/profileService';

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

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
        showUndoToast: jest.fn(),
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

jest.mock('../../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn().mockResolvedValue({}),
}));

const candidates = {
    in_progress: [],
    overdue: [],
    due_today: [],
    suggested: [],
    inbox: [],
    inbox_count: 0,
};

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);

// The planned block sits inside the visible hours (09:00-17:00).
const planned = {
    task_uid: 'w',
    position: 0,
    start_minute: 600,
    duration_minutes: 30,
    task: { uid: 'w', name: 'Write report', status: 0, due_time: '07:30' },
};

const timedTask = (uid: string, name: string, due_time: string) => ({
    id: uid,
    uid,
    name,
    status: 0,
    due_date: TODAY,
    due_time,
    estimated_minutes: 30,
});

const dayTasks = [
    // Planned already: its due time is outside the window but it is not counted.
    timedTask('w', 'Write report', '07:30'),
    timedTask('early', 'Early call', '07:00'),
    timedTask('inside', 'Lunch review', '11:00'),
    timedTask('late', 'Late review', '19:00'),
];

describe('TodayPage planning mode: hidden hours', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockSearch = '';
        (fetchProfile as jest.Mock).mockResolvedValue({
            ui_settings: {
                calendar: { visibleHours: { start: 9, end: 17 } },
            },
        });
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (fetchCalendarTasks as jest.Mock).mockResolvedValue(dayTasks);
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchCalendarEvents as jest.Mock).mockResolvedValue({
            date: TODAY,
            events: [],
            errors: [],
        });
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: {
                uid: 'p',
                date: TODAY,
                started_at: null,
                items: [planned],
            },
        });
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
    });

    const timelineStart = () =>
        Number(screen.getByTestId('day-timeline').dataset.rangeStart);

    it('shows earlier and later bars for unplanned timed tasks outside the visible hours', async () => {
        render(<TodayPage />);

        expect(await screen.findByText('1 earlier')).toBeInTheDocument();
        expect(screen.getByText('1 later')).toBeInTheDocument();
        expect(timelineStart()).toBe(9 * 60);
    });

    it('shows the whole 0-24 range from the more menu and switches back', async () => {
        render(<TodayPage />);
        await screen.findByText('1 earlier');

        fireEvent.click(screen.getByTestId('plan-more'));
        fireEvent.click(screen.getByTestId('plan-show-all-hours'));

        await waitFor(() => expect(timelineStart()).toBe(0));
        expect(screen.queryByText('1 earlier')).not.toBeInTheDocument();
        expect(screen.queryByText('1 later')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('plan-more'));
        fireEvent.click(screen.getByTestId('plan-show-all-hours'));

        await waitFor(() => expect(timelineStart()).toBe(9 * 60));
        expect(screen.getByText('1 earlier')).toBeInTheDocument();
    });

    it('shows all hours when the earlier bar is clicked', async () => {
        render(<TodayPage />);
        fireEvent.click(await screen.findByText('1 earlier'));

        await waitFor(() => expect(timelineStart()).toBe(0));
        expect(screen.queryByText('1 later')).not.toBeInTheDocument();
    });
});
