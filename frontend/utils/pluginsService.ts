import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';

// Server plugins (docs/46-plugins.md). Admin only: the server refuses the
// calls for anyone else. Secrets are sent to the server when typed and are
// never read back: the page only learns whether one is set (`has_value`).

export type PluginState =
    | 'disabled'
    | 'active'
    | 'error'
    | 'invalid'
    | 'incompatible'
    | 'needs_approval'
    | 'missing';

export type PluginSettingType =
    'string' | 'secret' | 'boolean' | 'number' | 'select';

export interface PluginSettingField {
    key: string;
    type: PluginSettingType;
    label: string;
    required?: boolean;
    options?: string[];
    help?: string;
    // Non-secret fields carry their current value; secrets only `has_value`.
    value?: string | number | boolean | null;
    has_value?: boolean;
}

export interface PluginUpdateInfo {
    url: string;
    latest: string | null;
    available: boolean;
    checked_at: string | null;
    error: string | null;
}

export interface PluginInfo {
    id: string | null;
    folder: string | null;
    name: string | null;
    description: string;
    version: string | null;
    loaded_version: string | null;
    previous_version: string | null;
    state: PluginState;
    last_error: string | null;
    permissions: string[];
    events: string[];
    settings: PluginSettingField[];
    update: PluginUpdateInfo | null;
    entry_missing: boolean;
    // Sidebar entry declared by the manifest (null when it has none)
    menu: { label: string; page: string } | null;
    // True when the folder is a Git clone, so it can be pulled
    installed_from_git: boolean;
}

// A running plugin's sidebar entry (GET /api/plugins/menu, any signed-in user)
export interface PluginMenuItem {
    id: string;
    label: string;
    path: string;
    file: string;
}

// Where a plugin can add a button to the page header (backend/modules/plugins/core/actions.js)
export type PluginActionPlace =
    'plan' | 'today' | 'inbox' | 'project' | 'triage';

// A button a running plugin adds to some page headers; a click opens its page
export interface PluginPageAction {
    plugin: string;
    id: string;
    label: string;
    places: PluginActionPlace[];
}

export interface PluginsResponse {
    configured: boolean;
    plugins: PluginInfo[];
}

export interface PluginUpdateInput {
    enabled?: boolean;
    // A secret left out keeps its value; `null` clears it.
    settings?: Record<string, string | number | boolean | null>;
}

const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({}));
    return data.error || data.message || fallback;
};

const send = async <T>(
    path: string,
    method: string,
    fallback: string,
    body?: unknown
): Promise<T> => {
    const response = await fetch(getApiPath(path), {
        method,
        credentials: 'include',
        headers: {
            ...(body !== undefined
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...(method !== 'GET'
                ? { 'x-csrf-token': await getCsrfToken() }
                : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
        throw new Error(await readError(response, fallback));
    }
    return response.json();
};

export const fetchPlugins = () =>
    send<PluginsResponse>('plugins', 'GET', 'Could not load plugins');

export const updatePlugin = (id: string, input: PluginUpdateInput) =>
    send<PluginInfo>(
        `plugins/${encodeURIComponent(id)}`,
        'PATCH',
        'Could not save the plugin',
        input
    );

export const reloadPlugins = () =>
    send<PluginsResponse>('plugins/reload', 'POST', 'Could not reload plugins');

export const reloadPlugin = (id: string) =>
    send<PluginInfo>(
        `plugins/${encodeURIComponent(id)}/reload`,
        'POST',
        'Could not reload the plugin'
    );

export const checkPluginUpdate = (id: string) =>
    send<PluginInfo>(
        `plugins/${encodeURIComponent(id)}/check-update`,
        'POST',
        'Could not check for updates'
    );

export const installPlugin = (url: string) =>
    send<PluginInfo>('plugins/install', 'POST', 'Could not add the plugin', {
        url,
    });

export const pullPlugin = (id: string) =>
    send<PluginInfo>(
        `plugins/${encodeURIComponent(id)}/pull`,
        'POST',
        'Could not update the plugin'
    );

export const removePlugin = (id: string) =>
    send<{ removed: string }>(
        `plugins/${encodeURIComponent(id)}`,
        'DELETE',
        'Could not delete the plugin'
    );

export const fetchPluginMenu = () =>
    send<{ items: PluginMenuItem[]; actions?: PluginPageAction[] }>(
        'plugins/menu',
        'GET',
        'Could not load the plugin menu'
    );
