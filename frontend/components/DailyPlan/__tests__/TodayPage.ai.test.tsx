import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayPage from '../TodayPage';
import {
    draftDayWithAi,
    estimateWithAi,
    fetchDailyPlan,
    fetchPlanCandidates,
} from '../../../utils/dailyPlanService';
import { fetchCalendarEvents } from '../../../utils/calendarFeedsService';

// Candidates come from the server only for the real today.
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);

let aiEnabled = false;
let calendarEnabled = true;

// A stable t, like the real one: the planner reloads when t changes.
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
    const value = { t, i18n: { language: 'en' } };
    return { useTranslation: () => value };
});

jest.mock('react-router-dom', () => ({
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/today' }),
    useSearchParams: () => [new URLSearchParams(''), jest.fn()],
    Link: ({ to, children, className }: any) => (
        <a href={to} className={className}>
            {children}
        </a>
    ),
}));

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            userSettingsStore: {
                aiAssistantEnabled: aiEnabled,
                calendarEnabled,
            },
        }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../utils/tasksService', () => ({
    fetchCalendarTasks: jest.fn().mockResolvedValue([]),
    createTask: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../utils/inboxService', () => ({
    processInboxItem: jest.fn(),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest
        .fn()
        .mockResolvedValue([{ uid: 'f1', show_on_calendar: true }]),
    fetchCalendarEvents: jest
        .fn()
        .mockResolvedValue({ events: [], errors: [] }),
}));

jest.mock('../../../utils/dailyPlanService', () => ({
    ...jest.requireActual('../../../utils/dailyPlanService'),
    fetchDailyPlan: jest.fn(),
    fetchPlanCandidates: jest.fn(),
    saveDailyPlanItems: jest.fn().mockResolvedValue({}),
    startDailyPlan: jest.fn(),
    draftDayWithAi: jest.fn(),
    estimateWithAi: jest.fn(),
}));

const candidates = {
    in_progress: [],
    overdue: [],
    due_today: [
        { uid: 'a', name: 'Pay invoice', status: 0, completed_at: null },
    ],
    suggested: [],
    inbox: [],
    inbox_count: 0,
};

const existing = {
    task_uid: 'kept',
    position: 0,
    start_minute: null,
    duration_minutes: 30,
    task: { uid: 'kept', name: 'Already planned', status: 0 },
};

describe('TodayPage AI help', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        calendarEnabled = true;
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: {
                uid: 'p',
                date: TODAY,
                started_at: null,
                items: [existing],
            },
        });
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (estimateWithAi as jest.Mock).mockResolvedValue({ a: 15 });
    });

    it('shows no AI controls while the AI assistant is off', async () => {
        aiEnabled = false;
        render(<TodayPage />);

        expect(await screen.findByText('Pay invoice')).toBeInTheDocument();
        expect(screen.queryByTestId('ai-draft-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('plan-tips')).not.toBeInTheDocument();
        expect(estimateWithAi).not.toHaveBeenCalled();
    });

    it('loads calendar events while the Calendar feature is on', async () => {
        render(<TodayPage />);

        await waitFor(() =>
            expect(fetchCalendarEvents).toHaveBeenCalledWith(TODAY)
        );
        fireEvent.click(screen.getByTestId('plan-more'));
        expect(screen.getByTestId('plan-refresh-calendar')).toBeInTheDocument();
    });

    it('leaves calendars out while the Calendar feature is off', async () => {
        calendarEnabled = false;
        render(<TodayPage />);

        expect(await screen.findByText('Pay invoice')).toBeInTheDocument();
        expect(fetchCalendarEvents).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('plan-more'));
        expect(
            screen.queryByTestId('plan-refresh-calendar')
        ).not.toBeInTheDocument();
    });

    it('fills free time with a draft and undoes it', async () => {
        aiEnabled = true;
        (draftDayWithAi as jest.Mock).mockResolvedValue({
            date: TODAY,
            mode: 'fill',
            summary: 'One quick win',
            items: [
                {
                    task_uid: 'a',
                    start_minute: null,
                    duration_minutes: 15,
                    reason: 'Due today',
                    task: candidates.due_today[0],
                },
            ],
            skipped: [],
        });
        render(<TodayPage />);

        await waitFor(() => expect(estimateWithAi).toHaveBeenCalledWith(['a']));
        fireEvent.click(await screen.findByTestId('ai-draft-button'));
        fireEvent.click(screen.getByText('Fill free time'));

        expect(await screen.findByTestId('ai-draft-banner')).toHaveTextContent(
            'One quick win'
        );
        expect(draftDayWithAi).toHaveBeenCalledWith(TODAY, 'fill');
        expect(screen.getByTestId('capacity')).toHaveTextContent('45m planned');

        fireEvent.click(screen.getByTestId('ai-draft-undo'));

        expect(screen.queryByTestId('ai-draft-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('capacity')).toHaveTextContent('30m planned');
    });

    it('reloads the task list when the planner comes back into view', async () => {
        aiEnabled = false;
        render(<TodayPage />);
        expect(await screen.findByText('Pay invoice')).toBeInTheDocument();

        (fetchPlanCandidates as jest.Mock).mockResolvedValue({
            ...candidates,
            due_today: [
                { uid: 'b', name: 'Call bank', status: 0, completed_at: null },
            ],
        });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(await screen.findByText('Call bank')).toBeInTheDocument();
        expect(screen.queryByText('Pay invoice')).not.toBeInTheDocument();
    });
});
