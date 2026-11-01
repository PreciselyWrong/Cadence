'use strict';

const express = require('express');
const { ENTITIES } = require('./registry');
const syncService = require('./service');

const router = express.Router();
const MAX_OPS = 500;

function readInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(parsed, max);
}

router.get('/sync/meta', (req, res) => {
    res.json(syncService.describe());
});

router.get('/sync/pull', async (req, res, next) => {
    try {
        const page = await syncService.pull(
            req.currentUser.id,
            readInt(req.query.cursor, 0),
            readInt(req.query.limit, 500, syncService.PAGE_MAX) || 500
        );
        // 410: the journal no longer reaches back to this cursor; the device
        // takes a new snapshot and pulls from its cursor.
        if (page.reset_required) {
            return res.status(410).json({
                error: 'reset_required',
                schema_version: page.schema_version,
            });
        }
        res.json(page);
    } catch (error) {
        next(error);
    }
});

router.get('/sync/snapshot', async (req, res, next) => {
    try {
        const entity = req.query.entity;
        if (!ENTITIES[entity]) {
            return res.status(400).json({ error: 'unknown_entity' });
        }
        res.json(
            await syncService.snapshot(
                req.currentUser.id,
                entity,
                readInt(req.query.after, 0),
                readInt(req.query.limit, 500, syncService.PAGE_MAX) || 500,
                req.query.cursor === undefined
                    ? null
                    : readInt(req.query.cursor, 0)
            )
        );
    } catch (error) {
        next(error);
    }
});

router.post('/sync/push', async (req, res, next) => {
    try {
        const ops = req.body && req.body.ops;
        if (!Array.isArray(ops) || ops.length > MAX_OPS) {
            return res
                .status(400)
                .json({ error: `ops must be an array of at most ${MAX_OPS}` });
        }
        res.json(await syncService.push(req.currentUser.id, ops));
    } catch (error) {
        next(error);
    }
});

router.get('/sync/status', async (req, res, next) => {
    try {
        res.json(await syncService.status(req.currentUser.id));
    } catch (error) {
        next(error);
    }
});

const RESOLVE_ERRORS = {
    invalid_keep: 400,
    not_reapplicable: 400,
    not_found: 404,
};

router.post('/sync/conflicts/:id/resolve', async (req, res, next) => {
    try {
        const id = readInt(req.params.id, null);
        if (id === null) return res.status(404).json({ error: 'not_found' });
        const result = await syncService.resolveConflict(
            req.currentUser.id,
            id,
            req.body && req.body.keep
        );
        if (result.error) {
            return res
                .status(RESOLVE_ERRORS[result.error] ?? 409)
                .json({ error: result.error });
        }
        res.json(result);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
