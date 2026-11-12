'use strict';

// « Vérifier les pages » of a project (docs/37-links.md): each address is
// asked once, through the SSRF guard. 404 and 410 or a host that does not
// answer mean dead; 401 and 403 are pages behind a sign-in, never dead.
// Nothing is deleted: the user decides.

const http = require('http');
const https = require('https');
const { assertSafeUrl, publicOnlyLookup } = require('../url/ssrfGuard');

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;
const UNREACHABLE = new Set([
    'ENOTFOUND',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
]);

const state = { probe: null };

function configure(options = {}) {
    if ('probe' in options) state.probe = options.probe;
}

// ok | dead | unknown, from what the address answered: `{ code }` or
// `{ error: 'unreachable' | 'timeout' | … }`.
function stateOf(answer) {
    if (!answer) return 'unknown';
    if (answer.error === 'unreachable') return 'dead';
    if (answer.error) return 'unknown';
    if (answer.code === 404 || answer.code === 410) return 'dead';
    if (answer.code === 401 || answer.code === 403 || answer.code < 400) {
        return 'ok';
    }
    return 'unknown';
}

function request(url, method) {
    return new Promise((resolve) => {
        const target = new URL(url);
        const client = target.protocol === 'https:' ? https : http;
        const req = client.request(
            {
                hostname: target.hostname,
                port: target.port || (target.protocol === 'https:' ? 443 : 80),
                path: target.pathname + target.search || '/',
                method,
                timeout: TIMEOUT_MS,
                lookup: publicOnlyLookup,
                headers: { 'User-Agent': 'Cadence-pages-check' },
            },
            (res) => {
                res.resume();
                resolve({
                    code: res.statusCode,
                    location: res.headers.location,
                });
            }
        );
        req.on('timeout', () => {
            req.destroy();
            resolve({ error: 'timeout' });
        });
        req.on('error', (error) =>
            resolve({
                error: UNREACHABLE.has(error.code) ? 'unreachable' : 'failed',
            })
        );
        req.end();
    });
}

// HEAD first, GET when the site refuses HEAD; redirects followed.
async function defaultProbe(url) {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        try {
            await assertSafeUrl(current);
        } catch {
            return { error: 'blocked' };
        }
        let answer = await request(current, 'HEAD');
        if (answer.code === 405 || answer.code === 501) {
            answer = await request(current, 'GET');
        }
        if (answer.code >= 300 && answer.code < 400 && answer.location) {
            current = new URL(answer.location, current).href;
            continue;
        }
        return answer;
    }
    return { error: 'redirects' };
}

async function checkUrl(url) {
    const probe = state.probe ?? defaultProbe;
    const answer = await probe(url).catch(() => null);
    return { state: stateOf(answer), code: answer?.code ?? null };
}

module.exports = { configure, stateOf, checkUrl };
