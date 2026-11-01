import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleEventModal, {
    GoogleEventDraft,
} from '../Calendar/GoogleEventModal';
import { ToastProvider } from '../Shared/ToastContext';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

const draft = (overrides: Partial<GoogleEventDraft>): GoogleEventDraft => ({
    title: 'Point hebdo',
    allDay: false,
    start: new Date(2026, 10, 2, 9, 0),
    end: new Date(2026, 10, 2, 10, 0),
    ...overrides,
});

const renderModal = (d: GoogleEventDraft) =>
    render(
        <ToastProvider>
            <GoogleEventModal
                draft={d}
                calendars={[]}
                onSave={jest.fn()}
                onClose={jest.fn()}
            />
        </ToastProvider>
    );

describe('GoogleEventModal join link', () => {
    it('offers Join for a meeting link in the location', () => {
        renderModal(
            draft({ location: 'https://meet.google.com/abc-defg-hij' })
        );
        expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute(
            'href',
            'https://meet.google.com/abc-defg-hij'
        );
    });

    it('offers Join for a meeting link only in the description', () => {
        renderModal(
            draft({ description: 'Lien : https://zoom.us/j/123456789' })
        );
        expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute(
            'href',
            'https://zoom.us/j/123456789'
        );
    });

    it('shows no Join link without a meeting link', () => {
        renderModal(draft({ location: 'Rue du Lac 4, Vevey' }));
        expect(screen.queryByRole('link', { name: 'Join' })).toBeNull();
    });
});
