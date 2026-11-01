import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedEventPopover, {
    FeedEventDetail,
} from '../Calendar/FeedEventPopover';
import { ToastProvider } from '../Shared/ToastContext';

// dateUtils loads the i18n setup, which Jest cannot start; the weekday locale
// is not what these tests check.
jest.mock('../../utils/dateUtils', () => ({
    getCurrentLocale: () => undefined,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

const detail = (over: Partial<FeedEventDetail> = {}): FeedEventDetail => ({
    title: 'Workshop',
    calendarName: 'Work',
    day: new Date(2026, 9, 25),
    start: new Date(2026, 9, 25, 16, 0),
    end: new Date(2026, 9, 25, 17, 0),
    allDay: false,
    location: null,
    description: null,
    ...over,
});

const renderPopover = (d: FeedEventDetail, onClose = jest.fn()) =>
    render(
        <ToastProvider>
            <FeedEventPopover detail={d} onClose={onClose} />
        </ToastProvider>
    );

describe('FeedEventPopover', () => {
    it('shows the title, the time and the calendar name', () => {
        renderPopover(detail());
        expect(screen.getByRole('heading', { name: 'Workshop' })).toBeInTheDocument();
        expect(screen.getByText('16:00–17:00')).toBeInTheDocument();
        expect(screen.getByText('Work')).toBeInTheDocument();
    });

    it('shows an all-day event as all day', () => {
        renderPopover(detail({ allDay: true, start: null, end: null }));
        expect(screen.getByText('All day')).toBeInTheDocument();
    });

    it('links the location to Maps and offers Join for a meeting in the description', () => {
        renderPopover(
            detail({
                location: 'Rue du Lac 4, Vevey',
                description: 'Lien : https://zoom.us/j/123456789',
            })
        );
        expect(
            screen.getByRole('link', { name: 'Rue du Lac 4, Vevey' })
        ).toHaveAttribute(
            'href',
            'https://www.google.com/maps/search/?api=1&query=Rue%20du%20Lac%204%2C%20Vevey'
        );
        expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute(
            'href',
            'https://zoom.us/j/123456789'
        );
    });

    it('shows the description as written, line breaks kept', () => {
        renderPopover(detail({ description: 'Bring the laptop\nand the badge' }));
        expect(
            screen.getByText(/Bring the laptop/, { collapseWhitespace: false })
        ).toHaveClass('whitespace-pre-line');
    });

    it('hides the location and description rows when the feed has none', () => {
        renderPopover(detail());
        expect(screen.queryByRole('link', { name: /Maps|Join/ })).toBeNull();
        expect(screen.queryByLabelText('Copy address')).toBeNull();
    });

    it('closes with Escape', () => {
        const onClose = jest.fn();
        renderPopover(detail(), onClose);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
