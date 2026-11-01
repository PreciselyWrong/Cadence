'use strict';

const crypto = require('crypto');
const { findRepo } = require('./repoConfig');
const { logError } = require('../../services/logService');

// POST /api/todo-md/webhook/:slug, called by Gitea or GitHub on a push.
// Mounted before body parsing and authentication: the HMAC-SHA256 of the
// raw body with the repository's secret is the authentication (GitHub
// `X-Hub-Signature-256: sha256=<hex>`, Gitea `X-Gitea-Signature: <hex>`).

const ANSWER_WITHIN_MS = 8_000;

function signatureOf(req) {
    const github = req.get('x-hub-signature-256');
    if (github) return github.replace(/^sha256=/i, '').trim();
    const gitea = req.get('x-gitea-signature');
    return gitea ? gitea.trim() : null;
}

function validSignature(secret, body, received) {
    if (!received || !/^[0-9a-f]{64}$/i.test(received)) return false;
    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    return crypto.timingSafeEqual(expected, Buffer.from(received, 'hex'));
}

// The pushed branch, when the payload says which one.
function pushedRef(body) {
    try {
        const ref = JSON.parse(body.toString('utf8'))?.ref;
        return typeof ref === 'string' ? ref : null;
    } catch {
        return null;
    }
}

function handler() {
    return async (req, res) => {
        const repo = findRepo(String(req.params.slug || '').toLowerCase());
        if (!repo || !repo.webhookSecret) {
            return res.status(404).json({
                error: 'No webhook is set up for this repository',
                code: 'todo_md_webhook_unknown',
            });
        }
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!validSignature(repo.webhookSecret, body, signatureOf(req))) {
            return res.status(401).json({
                error: 'Invalid signature',
                code: 'todo_md_webhook_signature',
            });
        }

        const ref = pushedRef(body);
        if (ref && ref !== `refs/heads/${repo.branch}`) {
            return res.status(202).json({ synced: false, ignored: ref });
        }

        const repos = require('./repos');
        const sync = repos.syncRepo(repo).then(
            (result) => ({
                synced: true,
                created: result.created,
                updated: result.updated,
                removed: result.removed,
            }),
            (error) => {
                logError(`TODO.md webhook sync failed for ${repo.slug}`, {
                    code: error.code,
                });
                return { synced: false, code: error.code || 'error' };
            }
        );
        // A forge gives up after ~10 s; a slow fetch finishes on its own.
        const late = new Promise((resolve) => {
            const timer = setTimeout(
                () => resolve({ synced: false, queued: true }),
                ANSWER_WITHIN_MS
            );
            timer.unref();
        });
        const outcome = await Promise.race([sync, late]);
        res.status(outcome.synced ? 200 : 202).json(outcome);
    };
}

module.exports = { handler, validSignature };
