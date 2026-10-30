import {
    handleAuthResponse,
    getDefaultHeaders,
    getPostHeadersWithCsrf,
} from './authUtils';
import { getApiPath } from '../config/paths';

export interface GoogleCalendar {
    uid: string;
    // The uid its events carry as feed_uid in calendar-feeds/events.
    feed_uid: string;
    name: string;
    color: string | null;
    is_primary: boolean;
    is_tududi: boolean;
    // Editable from Cadence (two-way and Google allows it).
    writable: boolean;
    // Google lets the account write to it, so two-way can be chosen.
    can_write?: boolean;
    sync_mode?: GoogleCalendarSyncMode;
    show_on_calendar: boolean;
}

export type GoogleCalendarSyncMode = 'hidden' | 'read' | 'two_way';

export interface GoogleStatus {
    configured: boolean;
    connected: boolean;
    email?: string | null;
    sync_events?: boolean;
    sync_tasks?: boolean;
    last_synced_at?: string | null;
    last_error?: string | null;
    calendars: GoogleCalendar[];
}

export interface GoogleEventInput {
    calendar_uid?: string;
    title?: string;
    description?: string;
    location?: string;
    all_day?: boolean;
    // Timed: ISO instants. All-day: YYYY-MM-DD, end_date exclusive.
    start?: string;
    end?: string;
    start_date?: string;
    end_date?: string;
}

const json = async (response: Response, message: string) => {
    await handleAuthResponse(response, message);
    return response.json();
};

export const fetchGoogleStatus = async (): Promise<GoogleStatus> =>
    json(
        await fetch(getApiPath('google'), {
            credentials: 'include',
            headers: getDefaultHeaders(),
        }),
        'Could not load the Google connection.'
    );

// Returns Google's sign-in page; the browser comes back to /calendar.
export const startGoogleConnect = async (): Promise<string> => {
    const origin = encodeURIComponent(window.location.origin);
    const data = await json(
        await fetch(getApiPath(`google/connect?origin=${origin}`), {
            credentials: 'include',
            headers: getDefaultHeaders(),
        }),
        'Could not start the Google connection.'
    );
    return data.url;
};

export const disconnectGoogle = async (): Promise<void> => {
    const response = await fetch(getApiPath('google'), {
        method: 'DELETE',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Could not disconnect Google.');
};

export const updateGoogleSettings = async (data: {
    sync_events?: boolean;
    sync_tasks?: boolean;
}): Promise<GoogleStatus> =>
    json(
        await fetch(getApiPath('google/settings'), {
            method: 'PATCH',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify(data),
        }),
        'Could not save the Google settings.'
    );

export const syncGoogleNow = async (): Promise<GoogleStatus> =>
    json(
        await fetch(getApiPath('google/sync'), {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
        }),
        'Google sync failed.'
    );

export const updateGoogleCalendar = async (
    uid: string,
    data: { show_on_calendar?: boolean; sync_mode?: GoogleCalendarSyncMode }
): Promise<GoogleCalendar> => {
    const body = await json(
        await fetch(getApiPath(`google/calendars/${encodeURIComponent(uid)}`), {
            method: 'PATCH',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify(data),
        }),
        'Could not update that calendar.'
    );
    return body.calendar;
};

export const createGoogleEvent = async (data: GoogleEventInput) =>
    json(
        await fetch(getApiPath('google/events'), {
            method: 'POST',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify(data),
        }),
        'Could not create the event.'
    );

const eventPath = (calendarUid: string, eventId: string) =>
    getApiPath(
        `google/events/${encodeURIComponent(calendarUid)}/${encodeURIComponent(eventId)}`
    );

export const updateGoogleEvent = async (
    calendarUid: string,
    eventId: string,
    data: GoogleEventInput
) =>
    json(
        await fetch(eventPath(calendarUid, eventId), {
            method: 'PATCH',
            credentials: 'include',
            headers: await getPostHeadersWithCsrf(),
            body: JSON.stringify(data),
        }),
        'Could not update the event.'
    );

export const deleteGoogleEvent = async (
    calendarUid: string,
    eventId: string
): Promise<void> => {
    const response = await fetch(eventPath(calendarUid, eventId), {
        method: 'DELETE',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Could not delete the event.');
};
