'use strict';

// HTTP client for a Hermes agent server (/p/<profile>/v1/runs).
//
// Response fields read:
// - run id: `id`, else `run_id` (create response);
// - status: `status` (queued, running, waiting_for_approval, completed,
//   failed, cancelled, interrupted);
// - final text: the first of `output`, `output_text`, `result`, `response`
//   that is set; a non-string value is passed on as JSON text.
//
// Never auto-approves: a run waiting for approval is reported as
// needs_approval and the caller decides (denyApproval).
// Never logs the API key, the input text or the output, only codes, run
// ids and statuses.

const { logger } = require('../../services/logService');

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_POLL_MS = 2000;
const OUTPUT_FIELDS = ['output', 'output_text', 'result', 'response'];
const ACTIVE_STATUSES = new Set(['queued', 'running']);
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'interrupted']);

class AgentError extends Error {
    constructor(code, { status = null, runId = null, profile = null } = {}) {
        super(`Agent error: ${code}`);
        this.name = 'AgentError';
        this.code = code;
        this.status = status;
        this.runId = runId;
        this.profile = profile;
    }
}

function requireConfigured(settings, apiKey, profile) {
    if (!settings?.baseUrl || !apiKey || !profile) {
        throw new AgentError('not_configured');
    }
}

function serverUrl(settings, path) {
    return `${settings.baseUrl.replace(/\/+$/, '')}${path}`;
}

function profilePath(profile, path) {
    return `/p/${encodeURIComponent(profile)}/v1${path}`;
}

function errorForStatus(status) {
    if (status === 401 || status === 403) {
        return new AgentError('unauthorized', { status });
    }
    if (status === 404) return new AgentError('not_configured', { status });
    return new AgentError('failed', { status });
}

async function request({
    url,
    method = 'GET',
    apiKey = null,
    body = undefined,
    headers: extraHeaders = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    try {
        const response = await fetch(url, {
            method,
            headers: { ...headers, ...extraHeaders },
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: 'manual',
            signal: controller.signal,
        });
        if (!response.ok) throw errorForStatus(response.status);

        const text = await response.text();
        if (text === '') return null;
        try {
            return JSON.parse(text);
        } catch {
            throw new AgentError('bad_output', { status: response.status });
        }
    } catch (error) {
        if (error instanceof AgentError) throw error;
        if (error.name === 'AbortError') throw new AgentError('timeout');
        throw new AgentError('unreachable');
    } finally {
        clearTimeout(timer);
    }
}

function extractOutputText(body) {
    for (const field of OUTPUT_FIELDS) {
        const value = body[field];
        if (value === undefined || value === null) continue;
        return typeof value === 'string' ? value : JSON.stringify(value);
    }
    return null;
}

async function createRun({
    settings,
    apiKey,
    profile,
    input,
    idempotencyKey,
    timeoutMs,
}) {
    requireConfigured(settings, apiKey, profile);
    const body = await request({
        url: serverUrl(settings, profilePath(profile, '/runs')),
        method: 'POST',
        apiKey,
        body: { input },
        timeoutMs,
        headers: { 'Idempotency-Key': idempotencyKey },
    });
    const runId = body?.id ?? body?.run_id;
    if (typeof runId !== 'string' || runId === '') {
        throw new AgentError('bad_output');
    }
    logger.info({ runId }, 'Agent run created');
    return { runId };
}

async function getRun({ settings, apiKey, profile, runId, timeoutMs }) {
    requireConfigured(settings, apiKey, profile);
    const body = await request({
        url: serverUrl(
            settings,
            profilePath(profile, `/runs/${encodeURIComponent(runId)}`)
        ),
        apiKey,
        timeoutMs,
    });
    if (typeof body?.status !== 'string') {
        throw new AgentError('bad_output', { runId });
    }
    return {
        runId,
        status: body.status,
        output: extractOutputText(body),
    };
}

async function denyApproval({ settings, apiKey, profile, runId }) {
    requireConfigured(settings, apiKey, profile);
    await request({
        url: serverUrl(
            settings,
            profilePath(profile, `/runs/${encodeURIComponent(runId)}/approval`)
        ),
        method: 'POST',
        apiKey,
        body: { choice: 'deny' },
    });
    logger.info({ runId }, 'Agent approval denied');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls until the run completes. Resolves with { runId, status, output }.
// Rejects with AgentError: needs_approval (not approved here), failed,
// timeout, or the error of a status request.
async function waitForRun({
    settings,
    apiKey,
    profile,
    runId,
    timeoutMs = (settings?.timeoutSeconds ?? 120) * 1000,
    pollMs = DEFAULT_POLL_MS,
}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const run = await getRun({ settings, apiKey, profile, runId });

        if (run.status === 'completed') {
            logger.info({ runId, status: run.status }, 'Agent run finished');
            return run;
        }
        if (run.status === 'waiting_for_approval') {
            logger.info({ runId, status: run.status }, 'Agent run paused');
            throw new AgentError('needs_approval', { runId, profile });
        }
        if (FAILED_STATUSES.has(run.status)) {
            logger.info({ runId, status: run.status }, 'Agent run finished');
            throw new AgentError('failed', { runId });
        }
        if (!ACTIVE_STATUSES.has(run.status)) {
            throw new AgentError('failed', { runId });
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new AgentError('timeout', { runId });
        await sleep(Math.min(pollMs, remaining));
    }
}

// Connection test: GET /health, no key needed.
async function checkHealth(settings) {
    if (!settings?.baseUrl) throw new AgentError('not_configured');
    await request({ url: serverUrl(settings, '/health') });
}

// Authentication and profile test: GET /p/<profile>/v1/models with the key.
async function listModels({ settings, apiKey, profile }) {
    requireConfigured(settings, apiKey, profile);
    return request({
        url: serverUrl(settings, profilePath(profile, '/models')),
        apiKey,
    });
}

module.exports = {
    AgentError,
    REQUEST_TIMEOUT_MS,
    createRun,
    getRun,
    denyApproval,
    waitForRun,
    checkHealth,
    listModels,
    extractOutputText,
};
