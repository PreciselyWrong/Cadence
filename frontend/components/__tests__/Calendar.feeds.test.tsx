import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Calendar from '../Calendar';
import {
    fetchCalendarFeeds,
    fetchCalendarEventsRange,
    updateCalendarFeed,
} from '../../utils/calendarFeedsService';

// The markdown stack is ESM-only and Jest cannot load it; the event
// description preview is not under test here.
jest.mock('../Shared/MarkdownRenderer', () => {
    const mockReact = jest.requireActual('react');
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

const showErrorToast = jest.fn();
jest.mock('../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast, showSuccessToast: jest.fn() }),
}));

jest.mock('../../utils/tasksService', () => ({ updateTask: jest.fn() }));
jest.mock('../../utils/calendarFeedsService');

jest.mock('../Calendar/CalendarMonthView', () => ({
    __esModule: true,
    default: ({
        events,
        onEventClick,
    }: {
        events: { id: string; title: string }[];
        onEventClick?: (event: { id: string; title: string }) => void;
    }) => (
        <ul>
            {events.map((event) => (
                <li key={event.id} onClick={() => onEventClick?.(event)}>
                    {event.title}
                </li>
            ))}
        </ul>
    ),
}));

const feed = (uid: string, name: string, show = true) => ({
    uid,
    name,
    url_host: 'calendar.google.com',
    color: '#2563eb',
    last_fetched_at: null,
    last_error: null,
    show_on_calendar: show,
});

const rangeEvent = (feedUid: string, title: string) => ({
    uid: `${feedUid}-${title}`,
    title,
    all_day: true,
    busy: false,
    start: '2026-09-24',
    end: '2026-09-25',
    start_minute: null,
    end_minute: null,
    feed_uid: feedUid,
    feed_name: feedUid,
    color: '#2563eb',
    date: '2026-09-24',
});

const renderCalendar = () =>
    render(
        <MemoryRouter>
            <Calendar />
        </MemoryRouter>
    );

describe('Calendar page feeds', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        }) as unknown as typeof fetch;
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([
            feed('work', 'Work'),
            feed('family', 'Family', false),
        ]);
        (fetchCalendarEventsRange as jest.Mock).mockResolvedValue({
            start: '2026-08-25',
            end: '2026-10-07',
            errors: [],
            events: [
                rangeEvent('work', 'Standup'),
                rangeEvent('family', 'Birthday'),
            ],
        });
        (updateCalendarFeed as jest.Mock).mockResolvedValue({});
    });

    it('prints only the calendar area', async () => {
        const print = jest.fn();
        window.print = print;
        renderCalendar();
        await screen.findByText('Standup');
        fireEvent.click(screen.getByRole('button', { name: 'Print' }));
        expect(print).toHaveBeenCalled();
        expect(document.body).toHaveClass('printing-calendar');
        window.dispatchEvent(new Event('afterprint'));
        expect(document.body).not.toHaveClass('printing-calendar');
    });

    it('offers every view in the switcher', async () => {
        renderCalendar();
        await screen.findByText('Standup');
        // A segmented switch (tabs); phones get a shorter copy of it.
        ['year', 'month', 'week', 'day', 'agenda'].forEach((name) =>
            expect(
                screen.getAllByRole('tab', {
                    name: new RegExp(`^${name}$`, 'i'),
                }).length
            ).toBeGreaterThan(0)
        );
    });

    it('draws events only from calendars that are shown', async () => {
        renderCalendar();

        expect(await screen.findByText('Standup')).toBeInTheDocument();
        expect(screen.queryByText('Birthday')).not.toBeInTheDocument();
        expect(screen.getByRole('switch', { name: /Work/ })).toHaveAttribute(
            'aria-checked',
            'true'
        );
        expect(screen.getByRole('switch', { name: /Family/ })).toHaveAttribute(
            'aria-checked',
            'false'
        );
    });

    it('shows a hidden calendar and saves the choice', async () => {
        renderCalendar();
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('switch', { name: /Family/ }));

        expect(await screen.findByText('Birthday')).toBeInTheDocument();
        expect(updateCalendarFeed).toHaveBeenCalledWith('family', {
            show_on_calendar: true,
        });
    });

    it('puts the calendar back and says so when saving fails', async () => {
        (updateCalendarFeed as jest.Mock).mockRejectedValue(new Error('no'));
        renderCalendar();
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('switch', { name: /Work/ }));

        await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
        expect(await screen.findByText('Standup')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: /Work/ })).toHaveAttribute(
            'aria-checked',
            'true'
        );
    });

    it('opens the calendar setup from the page', async () => {
        renderCalendar();
        await screen.findByText('Standup');

        fireEvent.click(screen.getByRole('button', { name: 'Calendars' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Connect a calendar')).toBeInTheDocument();
    });

    it('opens an ICS event in a read-only card with its location and description', async () => {
        (fetchCalendarEventsRange as jest.Mock).mockResolvedValue({
            start: '2026-08-25',
            end: '2026-10-07',
            errors: [],
            events: [
                {
                    ...rangeEvent('work', 'Workshop'),
                    all_day: false,
                    start_minute: 960,
                    end_minute: 1020,
                    location: 'Rue du Lac 4, Vevey',
                    description: 'Bring the badge',
                },
            ],
        });
        renderCalendar();
        fireEvent.click(await screen.findByText('Workshop'));
        const card = await screen.findByRole('dialog', { name: 'Workshop' });
        expect(card).toHaveTextContent('Bring the badge');
        expect(card).toHaveTextContent('Rue du Lac 4, Vevey');
    });
});
