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

    // Per listed tag, the ids of that tag and of every tag under it at any
    // depth (same user). A tag name is a path, so a descendant's name starts
    // with the tag's name followed by "/". Matched without LIKE, whose
    // wildcards and case rules differ between engines.
    async findTagGroups(userId, tagIds) {
        const groups = new Map(tagIds.map((id) => [id, new Set()]));
        if (tagIds.length === 0) return groups;

        const rows = await sequelize.query(
            `SELECT listed.id AS listed_id, child.id AS tag_id
               FROM tags listed
               JOIN tags child
                 ON child.user_id = listed.user_id
                AND (child.name = listed.name
                     OR SUBSTR(child.name, 1, LENGTH(listed.name) + 1) = listed.name || '/')
              WHERE listed.id IN (:tagIds)
                AND listed.user_id = :userId`,
            {
                replacements: { tagIds, userId },
                type: QueryTypes.SELECT,
            }
        );
        rows.forEach((row) => groups.get(row.listed_id)?.add(row.tag_id));
        return groups;
    }

    // tagIds plus the ids of every tag under them, so a listed tag also
    // matches items tagged with any of its descendants.
    async expandWithChildTagIds(userId, tagIds) {
        const groups = await this.findTagGroups(userId, tagIds);
        return [...new Set([...groups.values()].flatMap((ids) => [...ids]))];
    }

    // Find ids of owner rows in a tag join table that match every listed tag
    // (AND semantics). A listed tag is matched by itself or by any tag under
    // it, so a row tagged only with a descendant still satisfies it.
    async findIdsWithAllTags(joinTable, ownerColumn, userId, tagIds) {
        const groups = await this.findTagGroups(userId, tagIds);
        const candidateTagIds = [
            ...new Set([...groups.values()].flatMap((ids) => [...ids])),
        ];
        if (candidateTagIds.length === 0) return [];

        const rows = await sequelize.query(
            `SELECT jt.${ownerColumn} AS owner_id, jt.tag_id AS tag_id
               FROM ${joinTable} jt
              WHERE jt.tag_id IN (:candidateTagIds)`,
            {
                replacements: { candidateTagIds },
                type: QueryTypes.SELECT,
            }
        );

        const carriedByOwner = new Map();
        for (const row of rows) {
            if (!carriedByOwner.has(row.owner_id)) {
                carriedByOwner.set(row.owner_id, new Set());
            }
            carriedByOwner.get(row.owner_id).add(row.tag_id);
        }

        const matchingOwners = [];
        for (const [ownerId, carried] of carriedByOwner) {
            const matchesAll = [...groups.values()].every((ids) =>
                [...ids].some((id) => carried.has(id))
            );
            if (matchesAll) matchingOwners.push(ownerId);
        }
        return matchingOwners;
    }

    async findTaskIdsWithAllTags(userId, tagIds) {
        return this.findIdsWithAllTags('tasks_tags', 'task_id', userId, tagIds);
    }

    async findProjectIdsWithAllTags(userId, tagIds) {
        return this.findIdsWithAllTags(
            'projects_tags',
            'project_id',
            userId,
            tagIds
        );
    }

    async findNoteIdsWithAllTags(userId, tagIds) {
        return this.findIdsWithAllTags('notes_tags', 'note_id', userId, tagIds);
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
