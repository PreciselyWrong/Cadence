import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleSyncSection from '../GoogleSyncSection';
import {
    updateGoogleCalendar,
    updateGoogleSettings,
} from '../../../utils/googleSyncService';

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
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));
jest.mock('../../../utils/googleSyncService');

const calendar = (uid: string, name: string, extra = {}) => ({
    uid,
    feed_uid: `google-${uid}`,
    name,
    color: '#039be5',
    is_primary: false,
    is_tududi: false,
    writable: false,
    can_write: true,
    sync_mode: 'read' as const,
    show_on_calendar: true,
    ...extra,
});

const status = () => ({
    configured: true,
    connected: true,
    email: 'me@gmail.com',
    sync_events: true,
    sync_tasks: true,
    last_synced_at: null,
    last_error: null,
    calendars: [
        calendar('me', 'Me', { is_primary: true }),
        calendar('hol', 'Holidays', { can_write: false }),
        calendar('cad', 'Cadence', { is_tududi: true }),
    ],
});

describe('GoogleSyncSection', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sets a calendar to two-way', async () => {
        const onStatusChange = jest.fn();
        (updateGoogleCalendar as jest.Mock).mockResolvedValue(
            calendar('me', 'Me', {
                is_primary: true,
                sync_mode: 'two_way',
                writable: true,
            })
        );
        render(
            <GoogleSyncSection
                status={status()}
                onStatusChange={onStatusChange}
            />
        );
        const select = screen.getByLabelText('Sync mode for Me');
        expect(select).toHaveValue('read');
        fireEvent.change(select, { target: { value: 'two_way' } });
        await waitFor(() =>
            expect(updateGoogleCalendar).toHaveBeenCalledWith('me', {
                sync_mode: 'two_way',
            })
        );
        await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
        const next = onStatusChange.mock.calls[0][0];
        expect(next.calendars.find((c: any) => c.uid === 'me').sync_mode).toBe(
            'two_way'
        );
    });

    it('offers two-way only where Google allows writing', () => {
        render(<GoogleSyncSection status={status()} />);
        const holidays = screen.getByLabelText('Sync mode for Holidays');
        expect(
            holidays.querySelector('option[value="two_way"]')
        ).toBeDisabled();
        const me = screen.getByLabelText('Sync mode for Me');
        expect(me.querySelector('option[value="two_way"]')).not.toBeDisabled();
        expect(screen.queryByLabelText('Sync mode for Cadence')).toBeNull();
    });

    it('chooses the calendar that receives timed tasks', async () => {
        (updateGoogleSettings as jest.Mock).mockResolvedValue({
            ...status(),
            task_calendar_uid: 'me',
        });
        const onStatusChange = jest.fn();
        render(
            <GoogleSyncSection
                status={status()}
                onStatusChange={onStatusChange}
            />
        );
        const select = screen.getByLabelText('Calendar for tasks with a time');
        expect(select).toHaveValue('');
        // Only calendars Google lets the account write to.
        const options = Array.from(select.querySelectorAll('option')).map(
            (o) => o.textContent
        );
        expect(options).toEqual(['Cadence (made by the sync)', 'Me']);
        fireEvent.change(select, { target: { value: 'me' } });
        await waitFor(() =>
            expect(updateGoogleSettings).toHaveBeenCalledWith({
                task_calendar_uid: 'me',
            })
        );
        await waitFor(() =>
            expect(onStatusChange).toHaveBeenCalledWith(
                expect.objectContaining({ task_calendar_uid: 'me' })
            )
        );
    });
});
