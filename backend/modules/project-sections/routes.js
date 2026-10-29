'use strict';

const express = require('express');
const router = express.Router();
const { hasAccess } = require('../../middleware/authorize');
const { numericIdParam } = require('../../middleware/numericIdParam');
const { Project } = require('../../models');
const { extractUidFromSlug } = require('../../utils/slug-utils');
const repository = require('./repository');
const { logError } = require('../../services/logService');

// Board columns of a project. Read access to the project lists them, write
// access changes them.
router.param('projectUid', numericIdParam('project', Project));

const projectUid = (req) => extractUidFromSlug(req.params.projectUid);
const access = (level) =>
    hasAccess(level, 'project', projectUid, {
        notFoundMessage: 'Project not found',
    });

async function loadProject(req, res, next) {
    try {
        const project = await repository.findProjectByUid(projectUid(req));
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        req.project = project;
        next();
    } catch (error) {
        next(error);
    }
}

async function loadSection(req, res, next) {
    try {
        const section = await repository.findInProject(
            req.project.id,
            req.params.sectionUid
        );
        if (!section) {
            return res.status(404).json({ error: 'Section not found' });
        }
        req.section = section;
        next();
    } catch (error) {
        next(error);
    }
}

function cleanName(raw) {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    if (!name || name.length > 255) return null;
    return name;
}

router.get(
    '/project/:projectUid/sections',
    access('ro'),
    loadProject,
    async (req, res) => {
        try {
            const sections = await repository.listForProject(req.project.id);
            res.json(sections.map(repository.serialize));
        } catch (error) {
            logError('Error listing project sections:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

router.post(
    '/project/:projectUid/sections',
    access('rw'),
    loadProject,
    async (req, res) => {
        try {
            const name = cleanName(req.body?.name);
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const position =
                req.body?.position === undefined
                    ? undefined
                    : Number(req.body.position);
            const section = await repository.create(
                req.project.id,
                name,
                position
            );
            res.status(201).json(repository.serialize(section));
        } catch (error) {
            logError('Error creating project section:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

router.put(
    '/project/:projectUid/sections/order',
    access('rw'),
    loadProject,
    async (req, res) => {
        try {
            const uids = req.body?.section_uids;
            if (
                !Array.isArray(uids) ||
                !uids.every((u) => typeof u === 'string')
            ) {
                return res
                    .status(400)
                    .json({ error: 'section_uids must be a list' });
            }
            const ok = await repository.reorder(req.project.id, uids);
            if (!ok) {
                return res.status(400).json({
                    error: 'section_uids must list every section once',
                });
            }
            const sections = await repository.listForProject(req.project.id);
            res.json(sections.map(repository.serialize));
        } catch (error) {
            logError('Error reordering project sections:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

router.patch(
    '/project/:projectUid/sections/:sectionUid',
    access('rw'),
    loadProject,
    loadSection,
    async (req, res) => {
        try {
            const name = cleanName(req.body?.name);
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const section = await repository.rename(req.section, name);
            res.json(repository.serialize(section));
        } catch (error) {
            logError('Error renaming project section:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

router.delete(
    '/project/:projectUid/sections/:sectionUid',
    access('rw'),
    loadProject,
    loadSection,
    async (req, res) => {
        try {
            await repository.destroy(req.section);
            res.status(204).end();
        } catch (error) {
            logError('Error deleting project section:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

module.exports = router;
