'use strict';

const tagsRepository = require('./repository');
const { validateTagName } = require('./validation');
const { normalizeIcon } = require('../../utils/icon-validation');
const scopeService = require('../../services/scopeService');
const {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
} = require('../../shared/errors');

/**
 * Resolve a parent_uid from a request into the parent tag.
 * Returns undefined when parent_uid was not sent, null to clear the parent.
 * Tag names are paths, so the parent must not be the tag itself or one of its
 * descendants (a descendant's name starts with the tag's name and a "/").
 */
async function resolveParent(userId, parentUid, tag = null) {
    if (parentUid === undefined) return undefined;
    if (parentUid === null || parentUid === '') return null;
    if (typeof parentUid !== 'string') {
        throw new ValidationError('parent_uid must be a string');
    }

    const parent = await tagsRepository.findAnyByUid(parentUid);
    if (!parent) {
        throw new ValidationError('Parent tag not found');
    }
    if (parent.user_id !== userId) {
        throw new ForbiddenError('Parent tag belongs to another user');
    }
    if (tag && parent.id === tag.id) {
        throw new ValidationError('A tag cannot be its own parent');
    }
    if (tag && parent.name.startsWith(`${tag.name}/`)) {
        throw new ValidationError(
            'A tag cannot be moved under one of its own children'
        );
    }
    return parent;
}

async function parentUidFor(parentId) {
    if (!parentId) return null;
    const [parent] = await tagsRepository.findUidsByIds([parentId]);
    return parent ? parent.uid : null;
}

class TagsService {
    /**
     * Get all tags for a user.
     */
    async getAllForUser(userId, query = {}) {
        let tags = await tagsRepository.findAllByUser(userId);
        // Built before scoping so a child's parent_uid still resolves when
        // the parent tag itself is not used inside the scope.
        const uidById = new Map(tags.map((tag) => [tag.id, tag.uid]));
        // area_uid / project_uid narrow the list to tags used inside that
        // scope, so the Focus picker only offers tags of the Focus project.
        const scope = await scopeService.resolveScope(
            { area_uid: query.area_uid, project_uid: query.project_uid },
            userId
        );
        if (scope) {
            if (scope.matchesNothing) return [];
            const usedIds = new Set(
                await tagsRepository.findIdsUsedBy(userId, {
                    taskWhere: await scopeService.taskScopeWhere(scope),
                    noteWhere: await scopeService.noteScopeWhere(scope),
                    projectWhere: await scopeService.projectScopeWhere(scope),
                })
            );
            tags = tags.filter((tag) => usedIds.has(tag.id));
        }
        return tags.map((tag) => ({
            uid: tag.uid,
            name: tag.name,
            tag_type: tag.tag_type,
            pinned: tag.pinned,
            color: tag.color || null,
            icon: tag.icon || null,
            parent_uid: tag.parent_id
                ? (uidById.get(tag.parent_id) ?? null)
                : null,
            usage_count: Number(tag.get('usage_count') ?? 0),
            tasks_count: Number(tag.get('tasks_count') ?? 0),
            notes_count: Number(tag.get('notes_count') ?? 0),
            projects_count: Number(tag.get('projects_count') ?? 0),
        }));
    }

    /**
     * Get a single tag by uid or name.
     */
    async getByQuery(userId, { uid, name }) {
        let tag = null;

        if (uid) {
            tag = await tagsRepository.findByUid(userId, uid);
        } else if (name) {
            tag = await tagsRepository.findByName(
                userId,
                decodeURIComponent(name)
            );
        }

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        return {
            uid: tag.uid,
            name: tag.name,
            tag_type: tag.tag_type,
            pinned: tag.pinned,
            color: tag.color || null,
            icon: tag.icon || null,
            parent_uid: await parentUidFor(tag.parent_id),
        };
    }

    /**
     * Create a new tag. With parent_uid, `name` is the leaf under that parent.
     * Missing ancestors of a path are created by the Tag model hooks.
     */
    async create(userId, name, { parent_uid, icon } = {}) {
        const validatedName = validateTagName(name);
        const validatedIcon = normalizeIcon(icon);
        const parent = await resolveParent(userId, parent_uid);
        if (parent && validatedName.includes('/')) {
            throw new ValidationError(
                'A tag nested under a parent cannot have "/" in its name'
            );
        }
        const fullName = parent
            ? `${parent.name}/${validatedName}`
            : validatedName;

        const exists = await tagsRepository.nameExists(userId, fullName);
        if (exists) {
            throw new ConflictError(
                `A tag with the name "${fullName}" already exists.`
            );
        }

        const tag = await tagsRepository.createForUser(
            userId,
            fullName,
            parent ? parent.id : null,
            validatedIcon
        );

        return {
            uid: tag.uid,
            name: tag.name,
            icon: tag.icon,
            parent_uid: parent ? parent.uid : null,
        };
    }

    /**
     * Update a tag's name, parent, pinned and color.
     * A rename cascades to the subtree in the Tag model hooks; moving a tag
     * with parent_uid rebuilds its name from the new parent.
     */
    async update(
        userId,
        identifier,
        { name, pinned, color, icon, parent_uid } = {}
    ) {
        const decodedIdentifier = decodeURIComponent(identifier);
        const tag = await tagsRepository.findByIdentifier(
            userId,
            decodedIdentifier
        );

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const parent = await resolveParent(userId, parent_uid, tag);
        const updates = {};

        if (name !== undefined && tag.tag_type !== 'system') {
            let newName = validateTagName(name);
            if (parent && newName.includes('/')) {
                throw new ValidationError(
                    'A tag nested under a parent cannot have "/" in its name'
                );
            }
            if (parent) newName = `${parent.name}/${newName}`;

            if (newName !== tag.name) {
                const exists = await tagsRepository.nameExists(
                    userId,
                    newName,
                    tag.id
                );
                if (exists) {
                    throw new ConflictError(
                        `A tag with the name "${newName}" already exists.`
                    );
                }
                updates.name = newName;
            }
        }

        if (pinned !== undefined) {
            updates.pinned = Boolean(pinned);
        }

        if (color !== undefined) {
            updates.color = color === '' ? null : color;
        }

        if (icon !== undefined) {
            updates.icon = normalizeIcon(icon);
        }

        if (parent !== undefined) {
            updates.parent_id = parent ? parent.id : null;
        }

        if (Object.keys(updates).length > 0) {
            await tagsRepository.update(tag, updates);
        }

        return {
            id: tag.id,
            uid: tag.uid,
            name: tag.name,
            pinned: tag.pinned,
            color: tag.color,
            icon: tag.icon,
            parent_uid: await parentUidFor(tag.parent_id),
        };
    }

    /**
     * Delete a tag and all its associations.
     */
    async delete(userId, identifier) {
        const decodedIdentifier = decodeURIComponent(identifier);
        const tag = await tagsRepository.findByIdentifier(
            userId,
            decodedIdentifier
        );

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        if (tag.tag_type === 'system') {
            throw new ForbiddenError('System tags cannot be deleted');
        }

        await tagsRepository.deleteWithAssociations(tag);

        return { message: 'Tag successfully deleted' };
    }
}

// Export singleton instance
module.exports = new TagsService();
