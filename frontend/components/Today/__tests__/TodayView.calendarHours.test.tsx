import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayView from '../TodayView';
import { fetchDay, DayResponse } from '../../../utils/dayService';
import { fetchProfile } from '../../../utils/profileService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: unknown,
            values?: Record<string, unknown>
        ) => {
            const text =
                typeof fallback === 'string'
                    ? fallback
                    : String(
                          (fallback as { defaultValue?: string })
                              ?.defaultValue ?? _key
                      );
            return text.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            );
        },
        i18n: { language: 'en' },
    }),
}));

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
    overdue: [],
    suggestions: null,
    completed: [],
});

// The day calendar's section: the one holding the first day's lane.
const calendarGrid = () =>
    screen.getByTestId('calendar-grid').closest('section') as HTMLElement;

beforeEach(() => {
    jest.clearAllMocks();
    // Wide enough for the calendar beside the list, as on a desktop window.
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1600,
    });
    (fetchDay as jest.Mock).mockImplementation(async () => dayResponse());
});

describe('Today calendar hours', () => {
    it('draws the whole day when no visible hours are saved', async () => {
        (fetchProfile as jest.Mock).mockResolvedValue({ ui_settings: {} });

        render(<TodayView />);

        await waitFor(() => {
            expect(
                within(calendarGrid()).getByText('00:00')
            ).toBeInTheDocument();
        });
        expect(within(calendarGrid()).getByText('23:00')).toBeInTheDocument();
    });

    it('follows the saved visible hours of the Calendar settings', async () => {
        (fetchProfile as jest.Mock).mockResolvedValue({
            ui_settings: { calendar: { visibleHours: { start: 7, end: 19 } } },
        });

        render(<TodayView />);

        await waitFor(() => {
            expect(
                within(calendarGrid()).getByText('07:00')
            ).toBeInTheDocument();
        });
        expect(within(calendarGrid()).getByText('18:00')).toBeInTheDocument();
        expect(
            within(calendarGrid()).queryByText('00:00')
        ).not.toBeInTheDocument();
    });
});
