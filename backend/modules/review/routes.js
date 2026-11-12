'use strict';

const express = require('express');
const review = require('./service');
const weeklyRoutine = require('./weeklyRoutine');
const taskRepository = require('../tasks/repository');
const { hasAccess } = require('../../middleware/authorize');
const { logError } = require('../../services/logService');

const router = express.Router();

const handle = (action) => async (req, res) => {
    try {
        res.json(await action(req));
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        logError('Error handling review:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get(
    '/review',
    handle((req) => review.getSummary(req.currentUser))
);
router.get(
    '/review/week',
    handle((req) => review.getWeek(req.currentUser))
);
router.put(
    '/review/week/capacity',
    handle((req) =>
        review.saveWeekCapacity(
            req.currentUser,
            req.body?.capacity_minutes ?? null
        )
    )
);
router.get(
    '/review/weekly-routine',
    handle((req) => weeklyRoutine.exists(req.currentUser))
);
// Idempotent: 201 when the routine was created, 200 when it already existed.
router.post('/review/weekly-routine', async (req, res) => {
    try {
        const result = await weeklyRoutine.ensure(
            req.currentUser,
            req.body?.name
        );
        res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
        logError('Error creating the weekly review routine:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get(
    '/review/:category',
    handle((req) =>
        review.getCategory(req.currentUser, req.params.category, req.query)
    )
);

router.get(
    '/task/:uid/postponements',
    hasAccess('ro', 'task', (req) => req.params.uid, {
        notFoundMessage: 'Task not found.',
    }),
    handle(async (req) => {
        const task = await taskRepository.findByUid(req.params.uid);
        return review.getTaskHistory(req.currentUser, task);
    })
);

// Projects nobody touched for 30 days (« Pas touché depuis 30 jours »).
router.get(
    '/projects/dormant',
    handle(async (req) => ({
        projects: await review.computeDormantProjects(req.currentUser),
    }))
);

// "Keep as it is" for a project in the review.
router.post(
    '/project/:uid/reviewed',
    hasAccess('rw', 'project', (req) => req.params.uid, {
        notFoundMessage: 'Project not found.',
    }),
    handle((req) => review.markProjectReviewed(req.params.uid))
);

module.exports = router;
