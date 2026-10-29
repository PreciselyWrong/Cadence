import {
    handleAuthResponse,
    getDefaultHeaders,
    getPostHeadersWithCsrf,
} from './authUtils';
import { getApiPath } from '../config/paths';

export interface FocusSession {
    uid: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    task: { uid: string; name: string } | null;
}

export interface FocusStats {
    days: number;
    total_minutes: number;
    sessions: number;
    by_day: { date: string; minutes: number }[];
    by_hour: number[];
    top_tasks: { uid: string; name: string; minutes: number }[];
}

export const recordFocusSession = async (data: {
    duration_seconds: number;
    ended_at?: string;
    task_uid?: string;
}): Promise<FocusSession> => {
    const response = await fetch(getApiPath('focus-sessions'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
        body: JSON.stringify(data),
    });
    await handleAuthResponse(response, 'Could not save the focus session.');
    return (await response.json()).session;
};

export const fetchFocusSessions = async (
    start: string,
    end: string
): Promise<FocusSession[]> => {
    const response = await fetch(
        getApiPath(`focus-sessions?start=${start}&end=${end}`),
        { credentials: 'include', headers: getDefaultHeaders() }
    );
    await handleAuthResponse(response, 'Could not load focus sessions.');
    return (await response.json()).sessions;
};

export const fetchFocusStats = async (days = 30): Promise<FocusStats> => {
    const response = await fetch(
        getApiPath(`focus-sessions/stats?days=${days}`),
        {
            credentials: 'include',
            headers: getDefaultHeaders(),
        }
    );
    await handleAuthResponse(response, 'Could not load focus statistics.');
    return response.json();
};
