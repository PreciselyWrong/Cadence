import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Calendar from '../Calendar';
import {
    fetchCalendarFeeds,
    fetchCalendarEventsRange,
} from '../../utils/calendarFeedsService';
import {
    fetchGoogleStatus,
    updateGoogleCalendar,
    updateGoogleEvent,
    createGoogleEvent,
} from '../../utils/googleSyncService';

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
jest.mock('../../utils/googleSyncService');

// Month view stand-in: lists events, a click opens one, a drop moves it a
// day later, and a day button creates an event.
jest.mock('../Calendar/CalendarMonthView', () => ({
    __esModule: true,
    default: ({ events, onEventClick, onEventDrop, onDateClick }: any) => (
        <div>
            <button onClick={() => onDateClick(new Date(2026, 9, 20))}>
                new on 20th
            </button>
            <ul>
                {events.map((event: any) => (
                    <li key={event.id}>
                        <button onClick={() => onEventClick(event)}>
                            {event.title}
                        </button>
                        <button
                            onClick={() =>
                                onEventDrop(
                                    event.id,
                                    new Date(
                                        event.start.getFullYear(),
                                        event.start.getMonth(),
                                        event.start.getDate() + 1
                                    )
                                )
                            }
                        >
                            move {event.title}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    ),
}));

const calendar = (uid: string, name: string, extra = {}) => ({
    uid,
    feed_uid: `google-${uid}`,
    name,
    color: '#039be5',
    is_primary: false,
    is_tududi: false,
    writable: true,
    show_on_calendar: true,
    ...extra,
});

const googleEvent = (calendarUid: string, title: string, editable = true) => ({
    uid: `${calendarUid}-${title}`,
    title,
    all_day: true,
    busy: true,
    start: '2026-10-14',
    end: '2026-10-15',
    start_minute: null,
    end_minute: null,
    feed_uid: `google-${calendarUid}`,
    feed_name: calendarUid,
    color: '#039be5',
    date: '2026-10-14',
    source: 'google',
    calendar_uid: calendarUid,
    event_id: `evt-${title}`,
    editable,
});

const renderCalendar = () =>
    render(
        <MemoryRouter>
            <Calendar />
        </MemoryRouter>
    );

describe('Calendar page with Google', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        }) as unknown as typeof fetch;
        jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval'] });
        jest.setSystemTime(new Date(2026, 9, 14, 12));
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchGoogleStatus as jest.Mock).mockResolvedValue({
            configured: true,
            connected: true,
            sync_events: true,
            sync_tasks: true,
            calendars: [
                calendar('me', 'Me', { is_primary: true }),
                calendar('hol', 'Holidays', {
                    writable: false,
                    show_on_calendar: false,
                }),
                calendar('tududi', 'Tududi', { is_tududi: true }),
            ],
        });
        (fetchCalendarEventsRange as jest.Mock).mockResolvedValue({
            start: '2026-09-24',
            end: '2026-11-07',
            errors: [],
            events: [
                googleEvent('me', 'Dentist'),
                googleEvent('hol', 'Holiday', false),
            ],
        });
        (updateGoogleCalendar as jest.Mock).mockResolvedValue({});
        (updateGoogleEvent as jest.Mock).mockResolvedValue({});
        (createGoogleEvent as jest.Mock).mockResolvedValue({});
    });

    afterEach(() => jest.useRealTimers());

    it('shows a chip per Google calendar but not the Tududi one', async () => {
        renderCalendar();
        expect(
            await screen.findByRole('switch', { name: /Me/ })
        ).toHaveAttribute('aria-checked', 'true');
        expect(
            screen.getByRole('switch', { name: /Holidays/ })
        ).toHaveAttribute('aria-checked', 'false');
        expect(screen.queryByRole('switch', { name: /Tududi/ })).toBeNull();
    });

    it('draws only the shown calendars and toggles one', async () => {
        renderCalendar();
        await screen.findByText('Dentist');
        expect(screen.queryByText('Holiday')).toBeNull();
        fireEvent.click(screen.getByRole('switch', { name: /Holidays/ }));
        await screen.findByText('Holiday');
        expect(updateGoogleCalendar).toHaveBeenCalledWith('hol', {
            show_on_calendar: true,
        });
    });

    it('moves an editable event and saves it to Google', async () => {
        renderCalendar();
        await screen.findByText('Dentist');
        fireEvent.click(screen.getByText('move Dentist'));
        await waitFor(() =>
            expect(updateGoogleEvent).toHaveBeenCalledWith(
                'me',
                'evt-Dentist',
                {
                    all_day: true,
                    start_date: '2026-10-15',
                    end_date: '2026-10-16',
                }
            )
        );
    });

    it('edits an event in the dialog', async () => {
        renderCalendar();
        fireEvent.click(await screen.findByText('Dentist'));
        const title = await screen.findByLabelText('Title');
        fireEvent.change(title, { target: { value: 'Dentist (moved)' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(updateGoogleEvent).toHaveBeenCalledWith(
                'me',
                'evt-Dentist',
                expect.objectContaining({
                    title: 'Dentist (moved)',
                    all_day: true,
                    start_date: '2026-10-14',
                    end_date: '2026-10-15',
                })
            )
        );
    });

    it('creates an all-day event on a clicked day in the primary calendar', async () => {
        renderCalendar();
        await screen.findByText('Dentist');
        fireEvent.click(screen.getByText('new on 20th'));
        fireEvent.change(await screen.findByLabelText('Title'), {
            target: { value: 'Trip' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(createGoogleEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    calendar_uid: 'me',
                    title: 'Trip',
                    start_date: '2026-10-20',
                    end_date: '2026-10-21',
                })
            )
        );
    });

    it('leaves hidden calendars out and edits only two-way ones', async () => {
        (fetchGoogleStatus as jest.Mock).mockResolvedValue({
            configured: true,
            connected: true,
            sync_events: true,
            sync_tasks: true,
            calendars: [
                // Google allows writing, but the user chose read-only.
                calendar('me', 'Me', {
                    is_primary: true,
                    writable: true,
                    sync_mode: 'read',
                }),
                calendar('hol', 'Holidays', { sync_mode: 'hidden' }),
            ],
        });
        renderCalendar();
        await screen.findByRole('switch', { name: /Me/ });
        expect(screen.queryByRole('switch', { name: /Holidays/ })).toBeNull();
        fireEvent.click(screen.getByText('new on 20th'));
        expect(screen.queryByLabelText('Title')).toBeNull();
    });

    it('does not move a read-only event', async () => {
        renderCalendar();
        fireEvent.click(
            await screen.findByRole('switch', { name: /Holidays/ })
        );
        fireEvent.click(await screen.findByText('move Holiday'));
        expect(updateGoogleEvent).not.toHaveBeenCalled();
    });
});
