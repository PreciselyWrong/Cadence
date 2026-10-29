'use strict';

const { Op } = require('sequelize');
const { Project } = require('../../models');
const { ValidationError, ForbiddenError } = require('../../shared/errors');

// Sub-projects: a project may name a parent project it owns. The parent link
// is unlimited in depth; the area follows the parent (see service.update).

// The parent project the user owns, or a 400 when there is none. Parents owned
// by someone else are refused, so a sub-project never sits in another user's
// tree.
async function resolveParent(userId, parentUid) {
    const parent = await Project.findOne({
        where: { uid: parentUid, user_id: userId },
        attributes: ['id', 'uid', 'area_id'],
    });
    if (!parent) {
        throw new ValidationError('Parent project not found.');
    }
    return parent;
}

// Ids of every project below projectId, breadth first. The seen set makes a
// corrupt loop in the data finish instead of spinning.
async function descendantIds(projectId) {
    const seen = new Set([projectId]);
    const ids = [];
    let frontier = [projectId];
    while (frontier.length > 0) {
        const children = await Project.findAll({
            where: { parent_project_id: { [Op.in]: frontier } },
            attributes: ['id'],
            raw: true,
        });
        frontier = children
            .map((child) => child.id)
            .filter((id) => !seen.has(id));
        frontier.forEach((id) => seen.add(id));
        ids.push(...frontier);
    }
    return ids;
}

async function assertNoCycle(projectId, parentId) {
    if (parentId === projectId) {
        throw new ValidationError('A project cannot be its own parent.');
    }
    const descendants = await descendantIds(projectId);
    if (descendants.includes(parentId)) {
        throw new ValidationError(
            'A project cannot be moved under one of its own sub-projects.'
        );
    }
}

// The parent change a write asks for: { parent_project_id } (null detaches),
// or undefined when the parent does not change. Only the owner may move a
// project; a no-op request from anyone is accepted.
async function resolveParentChange(project, userId, parentUid) {
    if (parentUid === undefined) return undefined;

    const parent =
        parentUid === null || parentUid === ''
            ? null
            : await resolveParent(userId, parentUid);
    const parentId = parent ? parent.id : null;
    if (parentId === (project.parent_project_id ?? null)) return undefined;

    if (project.user_id !== userId) {
        throw new ForbiddenError(
            'Only the project owner can change its parent project.'
        );
    }
    if (parent) {
        await assertNoCycle(project.id, parent.id);
    }
    return { parent_project_id: parentId };
}

// The area a sub-project takes from its parent.
async function areaFollowingParent(parentId) {
    const parent = await Project.findByPk(parentId, {
        attributes: ['area_id'],
    });
    return parent ? parent.area_id : null;
}

// Moves every descendant of projectId to areaId and returns their rows as they
// were before, so the caller can re-sync the shares of each one.
async function cascadeArea(projectId, areaId) {
    const ids = await descendantIds(projectId);
    if (ids.length === 0) return [];

    const rows = await Project.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id', 'area_id', 'goal_id', 'visibility'],
    });
    await Project.update(
        { area_id: areaId },
        { where: { id: { [Op.in]: ids } } }
    );
    return rows;
}

module.exports = {
    resolveParent,
    descendantIds,
    assertNoCycle,
    resolveParentChange,
    areaFollowingParent,
    cascadeArea,
};
