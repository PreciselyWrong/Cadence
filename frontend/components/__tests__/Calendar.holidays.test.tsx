import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Calendar from '../Calendar';
import { fetchCalendarFeeds } from '../../utils/calendarFeedsService';
import { fetchHolidays } from '../../utils/holidaysService';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any, options?: any) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, name: string) => options?.[name] ?? ''
        );
    };
    const value = { t, i18n: { language: 'en' } };
    return {
        useTranslation: () => value,
        initReactI18next: { type: '3rdParty', init: () => {} },
    };
});

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

const showErrorToast = jest.fn();
jest.mock('../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast, showSuccessToast: jest.fn() }),
}));

jest.mock('../../utils/tasksService', () => ({ updateTask: jest.fn() }));
jest.mock('../../utils/calendarFeedsService');

jest.mock('../Calendar/CalendarMonthView', () => ({
    __esModule: true,
    default: ({ events }: { events: { id: string; title: string }[] }) => (
        <ul>
            {events.map((event) => (
                <li key={event.id}>{event.title}</li>
            ))}
        </ul>
    ),
}));

jest.mock('../../utils/holidaysService', () => ({
    fetchHolidays: jest.fn(),
    fetchHolidayCountries: jest.fn().mockResolvedValue([]),
    fetchHolidayRegions: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/focusSessionsService', () => ({
    fetchFocusSessions: jest.fn().mockResolvedValue([
        {
            uid: 'f1',
            started_at: new Date(2026, 9, 29, 9, 0).toISOString(),
            ended_at: new Date(2026, 9, 29, 9, 25).toISOString(),
            duration_seconds: 1500,
            task: { uid: 't1', name: 'Write' },
        },
    ]),
}));

jest.mock('../../utils/profileService', () => ({
    fetchProfile: jest.fn().mockResolvedValue({
        ui_settings: {
            calendar: { holidayCountry: 'CH', holidayRegion: 'VD' },
        },
    }),
    updateUiSettings: jest.fn().mockResolvedValue({}),
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

describe('Calendar page holidays and focus sessions', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        }) as unknown as typeof fetch;
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchHolidays as jest.Mock).mockResolvedValue([
            { date: '2026-12-25', name: 'Noël' },
        ]);
    });

    it('loads the chosen country and region and draws its holidays', async () => {
        render(
            <MemoryRouter>
                <Calendar />
            </MemoryRouter>
        );
        expect(await screen.findByText('Noël')).toBeInTheDocument();
        expect(await screen.findByText('Focus: Write')).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchHolidays).toHaveBeenLastCalledWith(
                'CH',
                'VD',
                expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
                expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
            )
        );
    });
});
