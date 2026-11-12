'use strict';

const { Op } = require('sequelize');
const { Link, LinkExclusion, Project, Task } = require('../../models');
const { ciLike } = require('../../utils/db-dialect');
const { CLOSED_STATUSES } = require('../projects/nextAction');

const withProject = {
    model: Project,
    attributes: ['uid', 'name'],
    required: false,
};

function escapeLike(text) {
    return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function findByUid(userId, uid) {
    return Link.findOne({
        where: { uid, user_id: userId },
        include: [withProject],
    });
}

// The page of an address in a project; without a project, a link left
// from the former library (none after the takeover migration).
function findByUrl(userId, url, projectId = null) {
    return Link.findOne({
        where: projectId
            ? { project_id: projectId, url }
            : { user_id: userId, url, project_id: null },
    });
}

function findProject(uid) {
    return Project.findOne({ where: { uid } });
}

// The pages of a project, in the order they came.
function pagesOf(projectId) {
    return Link.findAll({
        where: { project_id: projectId },
        include: [withProject],
        order: [
            ['created_at', 'ASC'],
            ['id', 'ASC'],
        ],
    });
}

function create(fields) {
    return Link.create(fields);
}

function exclude(userId, url) {
    return LinkExclusion.findOrCreate({ where: { user_id: userId, url } });
}

function liftExclusion(userId, url) {
    return LinkExclusion.destroy({ where: { user_id: userId, url } });
}

// Open tasks of the user whose name or note may hold an address: a cheap
// prefilter on its host and path; the caller checks the exact address.
function openTasksMentioning(userId, needle) {
    const pattern = `%${escapeLike(needle)}%`;
    return Task.findAll({
        where: {
            user_id: userId,
            status: { [Op.notIn]: CLOSED_STATUSES },
            habit_mode: { [Op.not]: true },
            [Op.or]: [{ note: ciLike(pattern) }, { name: ciLike(pattern) }],
        },
        attributes: ['id', 'uid', 'name', 'note'],
        order: [['id', 'ASC']],
        limit: 50,
    });
}

// The projects of the user that hold one of these spellings of an address.
async function projectsHolding(userId, urls) {
    const rows = await Link.findAll({
        where: {
            user_id: userId,
            url: { [Op.in]: urls },
            project_id: { [Op.ne]: null },
        },
        include: [{ ...withProject, required: true }],
        order: [['id', 'ASC']],
    });
    return rows.map((row) => row.Project);
}

// Deleting keeps the page out of capture: its address may still be in a text.
async function remove(link) {
    await exclude(link.user_id, link.url);
    await link.destroy();
}

module.exports = {
    findByUid,
    findByUrl,
    findProject,
    pagesOf,
    create,
    exclude,
    lift: liftExclusion,
    openTasksMentioning,
    projectsHolding,
    remove,
};
