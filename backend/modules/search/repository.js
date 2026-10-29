'use strict';

const { Task, Tag, Project, Area, Note, sequelize } = require('../../models');
const { Op, QueryTypes } = require('sequelize');

class SearchRepository {
    /**
     * Find tag IDs by names for a user.
     */
    async findTagIdsByNames(userId, tagNames) {
        if (tagNames.length === 0) return [];

        const tags = await Tag.findAll({
            where: {
                user_id: userId,
                name: { [Op.in]: tagNames },
            },
            attributes: ['id'],
        });
        return tags.map((tag) => tag.id);
    }

    // Return tagIds plus the ids of their child tags (nested tags are one
    // level deep), so a parent tag also matches items tagged with a child.
    async expandWithChildTagIds(tagIds) {
        if (tagIds.length === 0) return [];
        const children = await Tag.findAll({
            where: { parent_id: { [Op.in]: tagIds } },
            attributes: ['id'],
        });
        return [...new Set([...tagIds, ...children.map((tag) => tag.id)])];
    }

    // Find ids of owner rows in a tag join table that match every tag in
    // tagIds (AND semantics). Each listed tag is matched by itself or by any
    // of its child tags, so a row tagged only with a child of a listed parent
    // still satisfies that parent.
    async findIdsWithAllTags(joinTable, ownerColumn, tagIds) {
        const rows = await sequelize.query(
            `SELECT matched.owner_id AS owner_id FROM (
                 SELECT jt.${ownerColumn} AS owner_id, jt.tag_id AS group_id
                   FROM ${joinTable} jt
                  WHERE jt.tag_id IN (:tagIds)
                 UNION
                 SELECT jt.${ownerColumn} AS owner_id, t.parent_id AS group_id
                   FROM ${joinTable} jt
                   JOIN tags t ON t.id = jt.tag_id
                  WHERE t.parent_id IN (:tagIds)
             ) matched
             GROUP BY matched.owner_id
             HAVING COUNT(DISTINCT matched.group_id) = :tagCount`,
            {
                replacements: { tagIds, tagCount: tagIds.length },
                type: QueryTypes.SELECT,
            }
        );
        return rows.map((row) => row.owner_id);
    }

    async findTaskIdsWithAllTags(tagIds) {
        return this.findIdsWithAllTags('tasks_tags', 'task_id', tagIds);
    }

    async findProjectIdsWithAllTags(tagIds) {
        return this.findIdsWithAllTags('projects_tags', 'project_id', tagIds);
    }

    async findNoteIdsWithAllTags(tagIds) {
        return this.findIdsWithAllTags('notes_tags', 'note_id', tagIds);
    }

    /**
     * Count tasks matching conditions.
     */
    async countTasks(conditions, include) {
        return Task.count({
            where: conditions,
            include,
            distinct: true,
        });
    }

    /**
     * Find tasks matching conditions.
     */
    async findTasks(conditions, include, limit, offset) {
        return Task.findAll({
            where: conditions,
            include,
            limit,
            offset,
            order: [['updated_at', 'DESC']],
        });
    }

    /**
     * Count projects matching conditions.
     */
    async countProjects(conditions, include) {
        return Project.count({
            where: conditions,
            include: include?.length > 0 ? include : undefined,
            distinct: true,
        });
    }

    /**
     * Find projects matching conditions.
     */
    async findProjects(conditions, include, limit, offset) {
        return Project.findAll({
            where: conditions,
            include: include?.length > 0 ? include : undefined,
            limit,
            offset,
            order: [['updated_at', 'DESC']],
        });
    }

    /**
     * Count areas matching conditions.
     */
    async countAreas(conditions) {
        return Area.count({ where: conditions });
    }

    /**
     * Find areas matching conditions.
     */
    async findAreas(conditions, limit, offset) {
        return Area.findAll({
            where: conditions,
            limit,
            offset,
            order: [['updated_at', 'DESC']],
        });
    }

    /**
     * Count notes matching conditions.
     */
    async countNotes(conditions, include) {
        return Note.count({
            where: conditions,
            include: include?.length > 0 ? include : undefined,
            distinct: true,
        });
    }

    /**
     * Find notes matching conditions.
     */
    async findNotes(conditions, include, limit, offset) {
        return Note.findAll({
            where: conditions,
            include: include?.length > 0 ? include : undefined,
            limit,
            offset,
            order: [['updated_at', 'DESC']],
        });
    }

    /**
     * Count tags matching conditions.
     */
    async countTags(conditions) {
        return Tag.count({ where: conditions });
    }

    /**
     * Find tags matching conditions.
     */
    async findTags(conditions, limit, offset) {
        return Tag.findAll({
            where: conditions,
            limit,
            offset,
            order: [['name', 'ASC']],
        });
    }
}

module.exports = new SearchRepository();
