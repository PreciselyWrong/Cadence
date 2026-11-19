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
import TodayView from '../TodayView';
import { emitCaptureSaved } from '../../../utils/captureUi';
import { fetchDay, DayResponse } from '../../../utils/dayService';
import { fetchProfile } from '../../../utils/profileService';

// One translation object for every render, as react-i18next gives: a new
// `t` each render would reload the day in a loop.
jest.mock('react-i18next', () => {
    const t = (
        _key: string,
        fallback: unknown,
        values?: Record<string, unknown>
    ) => {
        const text =
            typeof fallback === 'string'
                ? fallback
                : String(
                      (fallback as { defaultValue?: string })?.defaultValue ??
                          _key
                  );
        return text.replace(/{{(\w+)}}/g, (_m, name) =>
            String(values?.[name] ?? '')
        );
    };
    const value = { t, i18n: { language: 'en' } };
    return { useTranslation: () => value };
});

jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: '/today' }),
    useSearchParams: () => [new URLSearchParams(''), jest.fn()],
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

jest.mock('../../../utils/dayService', () => ({
    ...jest.requireActual('../../../utils/dayService'),
    fetchDay: jest.fn(),
    applyPlanOps: jest.fn(),
    restorePlan: jest.fn(),
}));

jest.mock('../../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../utils/tasksService', () => ({
    ...jest.requireActual('../../../utils/tasksService'),
    toggleTaskCompletion: jest.fn(async (uid: string) => ({
        uid,
        name: 'Pay the bill',
        status: 2,
    })),
}));
jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarEvents: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../../utils/cadenceHabitsService', () => ({
    fetchCadenceCalendar: jest.fn(() => Promise.resolve([])),
    fetchCadenceHabits: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en', t: (key: string) => key },
}));

jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Plugins/PluginActions', () => () => null);

// Working hours 08:00-17:00, as the user has them; no visible hours saved.
const dayResponse = (): DayResponse => ({
    date: '2026-11-13',
    is_today: true,
    day_hours: { start: 480, end: 1020 },
    focus_blocks_of_day: [],
    plan: null,
    etag: 'etag-1',
    due: [],
    overdue: [
        {
            uid: 'late1',
            name: 'Pay the bill',
            status: 0,
            due_date: '2026-11-10',
        } as never,
    ],
    suggestions: null,
    completed: [],
});

import { toggleTaskCompletion } from '../../../utils/tasksService';

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1600,
    });
    (fetchDay as jest.Mock).mockImplementation(async () => dayResponse());
    (fetchProfile as jest.Mock).mockResolvedValue({ ui_settings: {} });
});

describe('Today and the capture box', () => {
    it('reads the day again when a task is captured for another day', async () => {
        render(<TodayView />);
        await screen.findByText(/Overdue · 1/);
        // Let the first loads (the day, tomorrow) settle.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 400));
        });
        const calls = (fetchDay as jest.Mock).mock.calls.length;
        act(() => {
            emitCaptureSaved({
                scope: null,
                items: [{ target: 'task', uid: 'new1' } as never],
                undone: false,
            });
        });
        await waitFor(() =>
            expect((fetchDay as jest.Mock).mock.calls.length).toBeGreaterThan(
                calls
            )
        );
    });
});

describe('Today overdue tasks', () => {
    it('leaves the late list once the task is on the day', async () => {
        (fetchDay as jest.Mock).mockImplementation(async () => ({
            ...dayResponse(),
            plan: {
                items: [
                    {
                        task_uid: 'late1',
                        task: dayResponse().overdue[0],
                        position: 0,
                        start_minute: 600,
                        duration_minutes: 30,
                    },
                ],
            },
        }));
        render(<TodayView />);
        await screen.findAllByText('Pay the bill');
        expect(screen.queryByText(/Overdue · 1/)).toBeNull();
    });

    it('are task lines: they can be checked and dragged like the others', async () => {
        render(<TodayView />);
        fireEvent.click(await screen.findByText(/Overdue · 1/));
        const row = screen
            .getByText('Pay the bill')
            .closest('[aria-roledescription="sortable"]') as HTMLElement;
        expect(row).not.toBeNull();
        fireEvent.click(within(row).getByRole('checkbox'));
        // The circle plays its check before it saves.
        await waitFor(() =>
            expect(toggleTaskCompletion).toHaveBeenCalledWith(
                'late1',
                expect.anything()
            )
        );
    });

    it('opens the Replan sheet from the Overdue section header', async () => {
        render(<TodayView />);
        const replanBtn = await screen.findByRole('button', { name: 'Replan' });
        fireEvent.click(replanBtn);
        expect(
            await screen.findByRole('dialog', { name: /Replan overdue/ })
        ).toBeInTheDocument();
    });
});
