import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarEventDetail from '../CalendarEventDetail';
import { ToastProvider } from '../../Shared/ToastContext';
import type { CalendarEvent } from '../../../utils/calendarFeedsService';
import * as google from '../../../utils/googleSyncService';

jest.mock('../../Shared/MarkdownRenderer', () => {
    const mockReact = jest.requireActual('react');
    return {
        __esModule: true,
        default: ({ content }: { content: string }) =>
            mockReact.createElement('div', { 'data-testid': 'md' }, content),
    };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../utils/googleSyncService', () => ({
    updateGoogleEvent: jest.fn().mockResolvedValue({}),
    deleteGoogleEvent: jest.fn().mockResolvedValue(undefined),
}));

const html = '<p>SORTIE FAMILIALE</p><p>Parking gratuit.</p>';

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    uid: 'ev1',
    title: 'Maison Cailler',
    all_day: false,
    busy: true,
    start: '2026-11-15T10:00:00.000Z',
    end: '2026-11-15T13:00:00.000Z',
    start_minute: 660,
    end_minute: 840,
    feed_uid: 'google:cal1',
    feed_name: 'Commun',
    color: null,
    description: html,
    ...overrides,
});

const google2way = {
    source: 'google' as const,
    calendar_uid: 'cal1',
    event_id: 'gev1',
    editable: true,
};

const renderDetail = (e: CalendarEvent, onChanged = jest.fn()) =>
    render(
        <ToastProvider>
            <CalendarEventDetail
                event={e}
                onDate="2026-11-15"
                onClose={jest.fn()}
                onChanged={onChanged}
            />
        </ToastProvider>
    );

describe('CalendarEventDetail', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows a read-only event description as text, not HTML', () => {
        renderDetail(event());
        expect(screen.getByText(/SORTIE FAMILIALE/)).toBeInTheDocument();
        expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Delete' })
        ).not.toBeInTheDocument();
    });

    it('opens a writable Google event in the editor, its HTML as text', () => {
        renderDetail(event(google2way));
        expect(screen.getByLabelText('Description')).toHaveValue(
            'SORTIE FAMILIALE\n\nParking gratuit.'
        );
    });

    it('saves without sending back an untouched description', async () => {
        const onChanged = jest.fn();
        renderDetail(event(google2way), onChanged);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const input = (google.updateGoogleEvent as jest.Mock).mock.calls[0][2];
        expect(google.updateGoogleEvent).toHaveBeenCalledWith(
            'cal1',
            'gev1',
            expect.any(Object)
        );
        expect(input).not.toHaveProperty('description');
    });

    it('deletes after a second click that confirms', async () => {
        const onChanged = jest.fn();
        renderDetail(event(google2way), onChanged);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(google.deleteGoogleEvent).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Delete for good?' })
        );
        await waitFor(() =>
            expect(google.deleteGoogleEvent).toHaveBeenCalledWith(
                'cal1',
                'gev1'
            )
        );
        expect(onChanged).toHaveBeenCalled();
    });
});
