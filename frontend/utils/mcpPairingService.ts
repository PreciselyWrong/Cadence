import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';
import { readJsonOrThrow } from './mfaService';

// The remote MCP connector's pairing window (docs/38-remote-mcp.md).
export interface McpPairing {
    enabled: boolean;
    url: string | null;
    open: boolean;
    expires_at: string | null;
}

export async function fetchPairing(): Promise<McpPairing> {
    const response = await fetch(getApiPath('mcp/pairing'), {
        credentials: 'include',
    });
    return readJsonOrThrow<McpPairing>(response);
}

export async function openPairing(): Promise<McpPairing> {
    const response = await fetch(getApiPath('mcp/pairing'), {
        method: 'POST',
        headers: { 'x-csrf-token': await getCsrfToken() },
        credentials: 'include',
    });
    return readJsonOrThrow<McpPairing>(response);
}
