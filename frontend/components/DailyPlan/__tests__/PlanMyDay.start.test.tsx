import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlanMyDay from '../PlanMyDay';
import {
    estimateWithAi,
    fetchDailyPlan,
    fetchPlanCandidates,
    saveDailyPlanItems,
    startDailyPlan,
} from '../../../utils/dailyPlanService';

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
    useLocation: () => ({ pathname: '/today/plan' }),
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
    createTask: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../utils/inboxService', () => ({
    processInboxItem: jest.fn(),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
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

describe('PlanMyDay start while saving', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        aiEnabled = false;
        calendarEnabled = false;
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: '2026-09-24',
            plan: {
                uid: 'p',
                date: '2026-09-24',
                started_at: null,
                items: [existing],
            },
        });
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (estimateWithAi as jest.Mock).mockResolvedValue({});
        (startDailyPlan as jest.Mock).mockResolvedValue({});
    });

    it('starts the day only after the autosave on its way has landed', async () => {
        let finishSave: () => void = () => undefined;
        (saveDailyPlanItems as jest.Mock).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishSave = () => resolve({});
                })
        );
        render(<PlanMyDay />);
        await screen.findByText('Pay invoice');

        jest.useFakeTimers();
        fireEvent.click(screen.getByTestId('add-a'));
        // The autosave fires and its request is still open.
        act(() => {
            jest.advanceTimersByTime(600);
        });
        jest.useRealTimers();
        expect(saveDailyPlanItems).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('start-my-day'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(startDailyPlan).not.toHaveBeenCalled();

        await act(async () => {
            finishSave();
            await Promise.resolve();
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(startDailyPlan).toHaveBeenCalledWith('2026-09-24');
    });
});
