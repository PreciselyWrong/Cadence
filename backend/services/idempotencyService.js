'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { IdempotencyKey } = require('../models');

// How long a stored answer can be replayed.
const KEY_TTL_MS = 24 * 60 * 60 * 1000;
// A claim with no answer after this long belongs to a request that died;
// the next retry runs again instead of waiting for 24 hours.
const IN_FLIGHT_TTL_MS = 60 * 1000;

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const pairs = Object.keys(value)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
        return `{${pairs.join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

// The method, path and body together: the same key on another request is a
// mistake, not a retry.
function fingerprint(method, path, body) {
    return crypto
        .createHash('sha256')
        .update(`${method} ${path}\n${stableStringify(body ?? {})}`)
        .digest('hex');
}

async function purgeExpired(now = new Date()) {
    await IdempotencyKey.destroy({
        where: { created_at: { [Op.lt]: new Date(now - KEY_TTL_MS) } },
    });
}

// Returns one of:
//   { kind: 'claimed', id }          first time: run the request, then finish()
//   { kind: 'replay', status, body } the earlier answer
//   { kind: 'mismatch' }             same key, different request
//   { kind: 'in_flight' }            the first request has not answered yet
async function claim({ userId, key, method, path, body }) {
    const now = new Date();
    const requestHash = fingerprint(method, path, body);
    await purgeExpired(now);

    // Two passes: a row found abandoned is removed and the claim retried.
    for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await IdempotencyKey.findOne({
            where: { user_id: userId, key },
        });
        if (existing) {
            if (existing.request_hash !== requestHash) {
                return { kind: 'mismatch' };
            }
            if (existing.status === null) {
                if (now - new Date(existing.created_at) < IN_FLIGHT_TTL_MS) {
                    return { kind: 'in_flight' };
                }
                await existing.destroy();
                continue;
            }
            return {
                kind: 'replay',
                status: existing.status,
                body: existing.body === null ? null : JSON.parse(existing.body),
            };
        }

        try {
            const row = await IdempotencyKey.create({
                user_id: userId,
                key,
                method,
                path,
                request_hash: requestHash,
                status: null,
                body: null,
                created_at: now,
            });
            return { kind: 'claimed', id: row.id };
        } catch (error) {
            // Another request with the same key won the insert; read its row.
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        }
    }
    return { kind: 'in_flight' };
}

// Stores the answer. Server errors are not kept, so a retry runs again.
async function finish(id, status, body) {
    if (status >= 500) {
        await IdempotencyKey.destroy({ where: { id } });
        return;
    }
    await IdempotencyKey.update(
        { status, body: JSON.stringify(body ?? null) },
        { where: { id } }
    );
}

module.exports = {
    KEY_TTL_MS,
    IN_FLIGHT_TTL_MS,
    stableStringify,
    fingerprint,
    purgeExpired,
    claim,
    finish,
};
