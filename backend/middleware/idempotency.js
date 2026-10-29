'use strict';

const idempotencyService = require('../services/idempotencyService');
const { logError } = require('../services/logService');

const HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

// Makes a POST safe to retry. With an Idempotency-Key header, the first
// answer is stored for 24 hours per user; a repeat with the same key and body
// gets that answer back (marked Idempotent-Replayed: true). The same key with
// another body or path gets 422. Mount after requireAuth.
function idempotency(req, res, next) {
    const key = req.get(HEADER);
    if (key === undefined) return next();

    if (!KEY_PATTERN.test(key)) {
        return res.status(400).json({
            error: `${HEADER} must be 1-255 visible ASCII characters`,
            code: 'VALIDATION_ERROR',
        });
    }

    const path = req.originalUrl.split('?')[0];
    idempotencyService
        .claim({
            userId: req.currentUser.id,
            key,
            method: req.method,
            path,
            body: req.body,
        })
        .then((verdict) => {
            if (verdict.kind === 'replay') {
                res.set('Idempotent-Replayed', 'true');
                return res.status(verdict.status).json(verdict.body);
            }
            if (verdict.kind === 'mismatch') {
                return res.status(422).json({
                    error: `${HEADER} was already used for a different request`,
                    code: 'IDEMPOTENCY_KEY_REUSED',
                });
            }
            if (verdict.kind === 'in_flight') {
                return res.status(409).json({
                    error: 'A request with this Idempotency-Key is still being processed',
                    code: 'CONFLICT',
                });
            }

            // First time: keep the answer before it is sent, so a retry that
            // arrives right after the response finds it.
            const sendJson = res.json.bind(res);
            res.json = (body) => {
                idempotencyService
                    .finish(verdict.id, res.statusCode, body)
                    .catch((error) =>
                        logError('Idempotency key was not stored:', error)
                    )
                    .finally(() => sendJson(body));
                return res;
            };
            return next();
        })
        .catch(next);
}

module.exports = idempotency;
