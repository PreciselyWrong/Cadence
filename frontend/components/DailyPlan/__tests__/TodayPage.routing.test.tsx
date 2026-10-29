import React from 'react';
import {
    act,
    render,
    screen,
    fireEvent,
    waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TodayPage from '../TodayPage';
import {
    fetchDailyPlan,
    fetchPlanCandidates,
} from '../../../utils/dailyPlanService';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);
const NEXT = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
);

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('react-i18next', () => {
    const t = (key: string, fallback: string | Record<string, unknown>) =>
        typeof fallback === 'string'
            ? fallback
            : String((fallback as any)?.defaultValue ?? key);
    const value = { t, i18n: { language: 'en' } };
    return { useTranslation: () => value };
});

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
    fetchCalendarTasks: jest.fn().mockResolvedValue([]),
    createTask: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../utils/inboxService', () => ({
    processInboxItem: jest.fn(),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest.fn().mockResolvedValue([]),
    fetchCalendarEvents: jest
        .fn()
        .mockResolvedValue({ events: [], errors: [] }),
}));

jest.mock('../../../utils/dailyPlanService', () => ({
    ...jest.requireActual('../../../utils/dailyPlanService'),
    fetchDailyPlan: jest.fn(),
    fetchPlanCandidates: jest.fn(),
    saveDailyPlanItems: jest.fn().mockResolvedValue({}),
    startDailyPlan: jest.fn().mockResolvedValue({}),
    draftDayWithAi: jest.fn(),
    estimateWithAi: jest.fn().mockResolvedValue({}),
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

const LocationProbe = () => {
    const location = useLocation();
    return (
        <div data-testid="location">
            {`${location.pathname}${location.search}`}
        </div>
    );
};

const renderAt = (url: string) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route
                    path="/today"
                    element={
                        <>
                            <TodayPage />
                            <LocationProbe />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>
    );

describe('TodayPage routing and panel mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('today.calendarOpen', 'true');
        (fetchDailyPlan as jest.Mock).mockImplementation(
            async (date?: string) => {
                const day = date ?? TODAY;
                return {
                    date: day,
                    plan: {
                        uid: 'p',
                        date: day,
                        started_at: '2026-01-01T08:00:00Z',
                        items: day === TODAY ? [existing] : [],
                    },
                };
            }
        );
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
    });

    it('switches the right panel to Calendar and remembers it', async () => {
        renderAt('/today');
        const calendarButton = await screen.findByTestId('panel-calendar');

        fireEvent.click(calendarButton);

        expect(localStorage.getItem('today.panelMode')).toBe('calendar');
        expect(screen.getByTestId('panel-calendar')).toHaveAttribute(
            'aria-pressed',
            'true'
        );
    });

    it('keeps ?date= when moving to the next day', async () => {
        renderAt('/today');
        await screen.findByText('Pay invoice');

        fireEvent.click(screen.getByTestId('day-next'));

        await waitFor(() =>
            expect(screen.getByTestId('location')).toHaveTextContent(
                `/today?date=${NEXT}`
            )
        );
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        expect(screen.getByTestId('location')).toHaveTextContent(
            `/today?date=${NEXT}`
        );
        expect(fetchDailyPlan).toHaveBeenLastCalledWith(
            NEXT,
            expect.anything()
        );
    });

    it('returns to today from the Today button', async () => {
        renderAt(`/today?date=${NEXT}`);
        await screen.findByTestId('day-today');

        fireEvent.click(screen.getByTestId('day-today'));

        await waitFor(() =>
            expect(screen.getByTestId('location')).toHaveTextContent(
                /^\/today$/
            )
        );
    });
});
