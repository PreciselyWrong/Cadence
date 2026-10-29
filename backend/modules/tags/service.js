'use strict';

const tagsRepository = require('./repository');
const { validateTagName } = require('./validation');
const {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
} = require('../../shared/errors');

/**
 * Resolve a parent_uid from a request into a parent tag id.
 * Returns undefined when parent_uid was not sent, null to clear the parent.
 * One level of nesting only: a parent cannot have a parent itself, and a tag
 * that already has children cannot be put under another tag.
 */
async function resolveParentId(userId, parentUid, tag = null) {
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
    if (parent.parent_id) {
        throw new ValidationError(
            'Tags can only be nested one level deep: the parent tag is itself nested'
        );
    }
    if (tag && (await tagsRepository.hasChildren(tag.id))) {
        throw new ValidationError(
            'Tags can only be nested one level deep: this tag has child tags'
        );
    }
    return parent.id;
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
    async getAllForUser(userId) {
        const tags = await tagsRepository.findAllByUser(userId);
        const uidById = new Map(tags.map((tag) => [tag.id, tag.uid]));
        return tags.map((tag) => ({
            uid: tag.uid,
            name: tag.name,
            tag_type: tag.tag_type,
            pinned: tag.pinned,
            color: tag.color || null,
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
            parent_uid: await parentUidFor(tag.parent_id),
        };
    }

    /**
     * Create a new tag.
     */
    async create(userId, name, { parent_uid } = {}) {
        const validatedName = validateTagName(name);

        const exists = await tagsRepository.nameExists(userId, validatedName);
        if (exists) {
            throw new ConflictError(
                `A tag with the name "${validatedName}" already exists.`
            );
        }

        const parentId = await resolveParentId(userId, parent_uid);

        const tag = await tagsRepository.createForUser(
            userId,
            validatedName,
            parentId ?? null
        );

        return {
            uid: tag.uid,
            name: tag.name,
            parent_uid: parentId ? parent_uid : null,
        };
    }

    /**
     * Update a tag's name and/or pinned state.
     */
    async update(userId, identifier, { name, pinned, color, parent_uid } = {}) {
        const decodedIdentifier = decodeURIComponent(identifier);
        const tag = await tagsRepository.findByIdentifier(
            userId,
            decodedIdentifier
        );

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const updates = {};

        if (name !== undefined) {
            if (tag.tag_type === 'system') {
                // Silently ignore name field for system tags - the form always sends it
            } else {
                const validatedName = validateTagName(name);
                if (validatedName !== tag.name) {
                    const exists = await tagsRepository.nameExists(
                        userId,
                        validatedName,
                        tag.id
                    );
                    if (exists) {
                        throw new ConflictError(
                            `A tag with the name "${validatedName}" already exists.`
                        );
                    }
                    updates.name = validatedName;
                }
            }
        }

        if (pinned !== undefined) {
            updates.pinned = Boolean(pinned);
        }

        if (color !== undefined) {
            updates.color = color === '' ? null : color;
        }

        const parentId = await resolveParentId(userId, parent_uid, tag);
        if (parentId !== undefined) {
            updates.parent_id = parentId;
        }

        if (Object.keys(updates).length > 0) {
            await tagsRepository.update(tag, updates);
        }

        return {
            id: tag.id,
            uid: tag.uid,
            name: updates.name ?? tag.name,
            pinned: updates.pinned !== undefined ? updates.pinned : tag.pinned,
            color: updates.color !== undefined ? updates.color : tag.color,
            parent_uid: await parentUidFor(
                updates.parent_id !== undefined
                    ? updates.parent_id
                    : tag.parent_id
            ),
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
