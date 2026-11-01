import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Calendar from '../Calendar';
import { fetchCalendarFeeds } from '../../utils/calendarFeedsService';
import { fetchCadenceCalendar } from '../../utils/cadenceHabitsService';
import { fetchProfile } from '../../utils/profileService';

// The markdown stack is ESM-only and Jest cannot load it; the event
// description preview is not under test here.
jest.mock('../Shared/MarkdownRenderer', () => {
    const mockReact = require('react');
    return {
        __esModule: true,
        default: ({ content }: { content: string }) =>
            mockReact.createElement('div', null, content),
    };
});

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

jest.mock('../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../utils/tasksService', () => ({ updateTask: jest.fn() }));
jest.mock('../../utils/calendarFeedsService');
jest.mock('../../utils/cadenceHabitsService', () => ({
    fetchCadenceCalendar: jest.fn(),
}));

jest.mock('../Calendar/CalendarMonthView', () => ({
    __esModule: true,
    default: ({
        events,
        onEventClick,
    }: {
        events: { id: string; title: string }[];
        onEventClick: (event: any) => void;
    }) => (
        <ul>
            {events.map((event) => (
                <li key={event.id} onClick={() => onEventClick(event)}>
                    {event.title}
                </li>
            ))}
        </ul>
    ),
}));

jest.mock('../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn().mockResolvedValue({}),
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const renderCalendar = () =>
    render(
        <MemoryRouter initialEntries={['/calendar']}>
            <Routes>
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/habit/:uid" element={<p>habit page</p>} />
            </Routes>
        </MemoryRouter>
    );

describe('Calendar page habits', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        }) as unknown as typeof fetch;
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchProfile as jest.Mock).mockResolvedValue({ ui_settings: {} });
        (fetchCadenceCalendar as jest.Mock).mockResolvedValue({
            from: '2026-10-01',
            to: '2026-10-31',
            timezone: 'UTC',
            habits: [
                {
                    uid: 'h1',
                    name: 'Stretch',
                    icon_id: null,
                    color_argb: null,
                    group_uid: null,
                    days: [
                        {
                            date: '2026-10-05',
                            status: 'IDEAL',
                            done: true,
                            time: null,
                        },
                    ],
                },
            ],
        });
    });

    it('draws the due days of the habits and opens the habit on click', async () => {
        renderCalendar();

        const chip = await screen.findByText('✓ Stretch');
        expect(fetchCadenceCalendar).toHaveBeenCalledWith(
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
        );

        fireEvent.click(chip);
        expect(await screen.findByText('habit page')).toBeInTheDocument();
    });

    it('hides the habits when Show habits is off', async () => {
        (fetchProfile as jest.Mock).mockResolvedValue({
            ui_settings: { calendar: { showHabits: false } },
        });
        renderCalendar();

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.queryByText('✓ Stretch')).not.toBeInTheDocument()
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByText('✓ Stretch')).not.toBeInTheDocument();
    });
});
