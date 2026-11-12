'use strict';

// The one Gmail write Cadence may make: archiving a thread, through the
// restricted Gmail tool (integrations/hermes-gmail/) on the same network.
// The tool name is fixed here; no other call can go out. Cadence holds no
// Google token, only the tool's Bearer token.
const { logError } = require('../../services/logService');

const TIMEOUT_MS = 10000;

function endpoint() {
    const url = (process.env.TUDUDI_GMAIL_MCP_URL || '').trim();
    const token = (process.env.TUDUDI_GMAIL_MCP_TOKEN || '').trim();
    if (!url || !token) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
    } catch {
        return null;
    }
    return { url, token };
}

const configured = () => endpoint() !== null;

// True when Gmail confirmed; false on any failure, which the caller reports.
async function archiveThread(account, threadId) {
    const target = endpoint();
    if (!target) return false;
    try {
        const response = await fetch(target.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${target.token}`,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'archive_thread',
                    arguments: { account, thread_id: threadId },
                },
            }),
            // The token never follows a redirect elsewhere.
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
            logError(
                { status: response.status, account },
                'Gmail archive refused'
            );
            return false;
        }
        const answer = await response.json();
        if (answer?.error || !answer?.result || answer.result.isError) {
            logError({ account }, 'Gmail archive refused');
            return false;
        }
        return true;
    } catch (error) {
        logError({ error: error.message, account }, 'Gmail archive failed');
        return false;
    }
}

module.exports = { configured, archiveThread };
