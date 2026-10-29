import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayPage from '../TodayPage';
import { PX_PER_HOUR } from '../DayTimeline';
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

// A stable t, like i18next's: the page reloads when t changes.
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

const planned = {
    task_uid: 'w',
    position: 0,
    start_minute: 600,
    duration_minutes: 30,
    task: { uid: 'w', name: 'Write report', status: 0 },
};

const resizeHandle = (uid: string) =>
    screen
        .getByTestId(`block-${uid}`)
        .querySelector('.cursor-ns-resize') as HTMLElement;

describe('TodayPage resize', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockCalendarEnabled = true;
        mockSearch = '';
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (fetchCalendarTasks as jest.Mock).mockResolvedValue([]);
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchCalendarEvents as jest.Mock).mockResolvedValue({
            date: TODAY,
            events: [],
            errors: [],
        });
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: { uid: 'p', date: TODAY, started_at: null, items: [planned] },
        });
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
    });

    it('shows a planned block at its new length after a timeline resize', async () => {
        render(<TodayPage />);
        await screen.findByTestId('block-w');
        const pxPerMinute = PX_PER_HOUR / 60;

        // jsdom has no PointerEvent, so the clientY is set by hand.
        const pointer = (type: string, clientY: number) => {
            const event = new Event(type, { bubbles: true });
            Object.defineProperty(event, 'clientY', { value: clientY });
            return event;
        };
        act(() => {
            resizeHandle('w').dispatchEvent(pointer('pointerdown', 0));
            window.dispatchEvent(pointer('pointermove', 60 * pxPerMinute));
            window.dispatchEvent(pointer('pointerup', 60 * pxPerMinute));
        });

        expect(
            await within(screen.getByTestId('block-w')).findByText(
                /10:00 · 1h 30m/
            )
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(saveDailyPlanItems).toHaveBeenCalledWith(TODAY, [
                expect.objectContaining({
                    task_uid: 'w',
                    duration_minutes: 90,
                }),
            ])
        );
    });

    it('updates the list row and block label after a calendar resize', async () => {
        window.localStorage.setItem('today.panelMode', 'calendar');
        const timed = {
            id: 7,
            uid: 'd1',
            name: 'Pay invoice',
            status: 0,
            due_date: TODAY,
            due_time: '10:00',
            estimated_minutes: 30,
        };
        (fetchPlanCandidates as jest.Mock).mockResolvedValue({
            ...candidates,
            due_today: [timed],
        });
        (fetchCalendarTasks as jest.Mock).mockResolvedValue([timed]);
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
        render(<TodayPage />);
        const card = await screen.findByTestId('candidate-d1');
        expect(within(card).getByText('Due today · 30m')).toBeInTheDocument();

        const block = await screen.findByTestId('calendar-resize-handle');
        const eventBlock = block.parentElement as HTMLElement;
        expect(eventBlock).toHaveTextContent('10:00 – 10:30');

        // Calendar hours are 48px tall: 48px of drag is one more hour.
        const pointer = (type: string, clientY: number) => {
            const event = new Event(type, { bubbles: true });
            Object.defineProperty(event, 'clientY', { value: clientY });
            return event;
        };
        act(() => {
            block.dispatchEvent(pointer('pointerdown', 0));
            window.dispatchEvent(pointer('pointermove', 48));
            window.dispatchEvent(pointer('pointerup', 48));
        });

        await waitFor(() =>
            expect(eventBlock).toHaveTextContent('10:00 – 11:30')
        );
        expect(
            within(screen.getByTestId('candidate-d1')).getByText(
                'Due today · 1h 30m'
            )
        ).toBeInTheDocument();
        expect(
            within(screen.getByTestId('candidate-d1')).queryByText(
                'Due today · 30m'
            )
        ).not.toBeInTheDocument();
    });
});
