'use strict';

// Client of a local Piper HTTP server (docs/resume-matinal-plan.md §6, and
// docs/39-daily-brief.md, Audio). The text sent is the spoken brief: it is
// never logged, and it only goes to the configured address. Redirects are
// refused so the request cannot leave that host.
const { isLinkLocalOrMetadataHost } = require('../../agents/settings');

const SYNTHESIS_TIMEOUT_MS = 60000;
const CHECK_TIMEOUT_MS = 3000;

class PiperError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'PiperError';
        this.code = code;
    }
}

// The address without a trailing slash. http(s) only, no credentials, and no
// link-local or cloud metadata host. Private and loopback hosts are allowed:
// Piper is meant to run on the LAN.
function piperBase(piperUrl) {
    let url;
    try {
        url = new URL(String(piperUrl ?? '').trim());
    } catch {
        throw new PiperError('piper_url_invalid', 'Piper address is not a URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new PiperError(
            'piper_url_invalid',
            'Piper address must be http(s)'
        );
    }
    if (url.username || url.password) {
        throw new PiperError(
            'piper_url_invalid',
            'Piper address has credentials'
        );
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (isLinkLocalOrMetadataHost(host)) {
        throw new PiperError(
            'piper_url_invalid',
            'Piper address is not allowed'
        );
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

async function request(url, init, timeoutMs) {
    let response;
    try {
        response = await fetch(url, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch {
        throw new PiperError('piper_unreachable', 'Piper did not answer');
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new PiperError(
            'piper_error',
            `Piper answered ${response.status}`
        );
    }
    return response;
}

// A WAV file for `text`. `speed` 1 is the normal rate; Piper's length_scale is
// the inverse of the speed.
async function synthesize({
    piperUrl,
    voice,
    speed = 1,
    text,
    timeoutMs = SYNTHESIS_TIMEOUT_MS,
}) {
    const base = piperBase(piperUrl);
    const response = await request(
        `${base}/synthesize`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'audio/wav',
            },
            body: JSON.stringify({
                text,
                voice,
                length_scale: 1 / speed,
            }),
        },
        timeoutMs
    );
    const wav = Buffer.from(await response.arrayBuffer());
    if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF') {
        throw new PiperError(
            'piper_error',
            'Piper did not answer with a WAV file'
        );
    }
    return wav;
}

// Voice ids the server has, sorted.
async function listVoices(piperUrl, { timeoutMs = CHECK_TIMEOUT_MS } = {}) {
    const base = piperBase(piperUrl);
    const response = await request(
        `${base}/voices`,
        { method: 'GET' },
        timeoutMs
    );
    let body;
    try {
        body = await response.json();
    } catch {
        throw new PiperError('piper_error', 'Piper voices are not JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new PiperError(
            'piper_error',
            'Piper voices have an unknown shape'
        );
    }
    return Object.keys(body).sort();
}

// Whether the configured server answers. Never throws.
async function checkPiper(piperUrl) {
    try {
        await listVoices(piperUrl);
        return { ok: true, code: null };
    } catch (error) {
        return { ok: false, code: error.code || 'piper_error' };
    }
}

module.exports = {
    PiperError,
    piperBase,
    synthesize,
    listVoices,
    checkPiper,
};
