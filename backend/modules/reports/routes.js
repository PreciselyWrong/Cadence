'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { getAuthenticatedUserId } = require('../../utils/request-utils');
const { getGtdReport } = require('./service');
const { getSummary, SummaryRangeError } = require('./summary');
const { logError } = require('../../services/logService');

router.get('/reports/gtd', requireAuth, async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const timezone = req.currentUser?.timezone || 'UTC';
        const report = await getGtdReport(userId, timezone);
        res.json(report);
    } catch (err) {
        logError('Error generating GTD report:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

router.get('/reports/summary', requireAuth, async (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const timezone = req.currentUser?.timezone || 'UTC';
        const includeOpen =
            req.query.include_open === 'true' || req.query.include_open === '1';
        const summary = await getSummary(
            userId,
            { start: req.query.start, end: req.query.end, includeOpen },
            timezone
        );
        res.json(summary);
    } catch (err) {
        if (err instanceof SummaryRangeError) {
            return res.status(400).json({ error: err.message });
        }
        logError('Error generating summary:', err);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

module.exports = router;
