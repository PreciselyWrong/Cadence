'use strict';

const express = require('express');
const holidaysService = require('./service');
const { logError } = require('../../services/logService');

const router = express.Router();

const handle = (action) => (req, res) => {
    try {
        res.json(action(req));
    } catch (error) {
        logError('Error listing holidays:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get(
    '/holidays/countries',
    handle((req) => ({
        countries: holidaysService.listCountries(req.currentUser.language),
    }))
);

router.get(
    '/holidays/regions',
    handle((req) => ({
        regions: holidaysService.listRegions(
            req.query.country,
            req.currentUser.language
        ),
    }))
);

router.get(
    '/holidays',
    handle((req) => ({
        holidays: holidaysService.listHolidays({
            country: req.query.country,
            region: req.query.region,
            start: req.query.start,
            end: req.query.end,
            language: req.currentUser.language,
        }),
    }))
);

module.exports = router;
