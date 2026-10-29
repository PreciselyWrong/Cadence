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
        res.json(
            await syncService.pull(
                req.currentUser.id,
                readInt(req.query.cursor, 0),
                readInt(req.query.limit, 500, syncService.PAGE_MAX) || 500
            )
        );
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

module.exports = router;
