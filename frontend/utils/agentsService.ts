import {
    getDefaultHeaders,
    getPostHeadersWithCsrf,
    handleAuthResponse,
} from './authUtils';
import { getApiPath } from '../config/paths';

// Client of the agent connector settings (Profile › Agents).

export interface AgentSettings {
    baseUrl: string;
    timeoutSeconds: number;
    profiles: { mail: string };
    api_key_set: boolean;
    api_key_last4: string | null;
}

// Only the fields the user sets; api_key: null clears the stored key, a
// missing api_key keeps it.
export type AgentSettingsPatch = Partial<
    Omit<AgentSettings, 'api_key_set' | 'api_key_last4'>
> & { api_key?: string | null };

export type AgentCheck = 'ok' | 'error' | 'unauthorized' | 'missing';

export interface AgentTestResult {
    health: 'ok' | 'error';
    auth: 'ok' | 'error' | 'unauthorized';
    profiles: { mail: AgentCheck };
}

const jsonRequest = async (
    path: string,
    method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    errorMessage = 'Request failed.'
): Promise<Response> => {
    const mutating = method !== 'GET';
    const headers = mutating
        ? await getPostHeadersWithCsrf()
        : getDefaultHeaders();
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    await handleAuthResponse(response, errorMessage);
    return response;
};

export const fetchAgentSettings = async (): Promise<AgentSettings> =>
    (
        await jsonRequest(
            'agents/settings',
            'GET',
            undefined,
            'Failed to load the agent settings.'
        )
    ).json();

export const saveAgentSettings = async (
    patch: AgentSettingsPatch
): Promise<AgentSettings> =>
    (
        await jsonRequest(
            'agents/settings',
            'PUT',
            patch,
            'Failed to save the agent settings.'
        )
    ).json();

export const testAgentConnection = async (): Promise<AgentTestResult> =>
    (
        await jsonRequest(
            'agents/test',
            'POST',
            {},
            'Failed to test the agent connection.'
        )
    ).json();
