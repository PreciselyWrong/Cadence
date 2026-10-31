const { DataTypes, Op } = require('sequelize');
const { uid } = require('../utils/uid');
const { ConflictError, ValidationError } = require('../shared/errors');

// A tag name is its full path (`perso/sport/course`). parent_id always points
// at the tag named by the path without its last segment, so the hooks below
// keep name and parent_id in step whichever one a caller sets.

const leafOf = (name) => name.slice(name.lastIndexOf('/') + 1);

const parentPathOf = (name) => {
    const index = name.lastIndexOf('/');
    return index < 0 ? null : name.slice(0, index);
};

// Finds the tag at `path` for this user, creating it (and its own missing
// ancestors, through the same hook) when absent.
async function findOrCreateByPath(Tag, userId, path, transaction) {
    const existing = await Tag.findOne({
        where: { user_id: userId, name: path },
        transaction,
    });
    if (existing) return existing;
    return Tag.create(
        { name: path, user_id: userId, tag_type: 'user' },
        { transaction }
    );
}

// The tag at `name` and every tag under it, at any depth, found by name prefix
// rather than LIKE, whose wildcards and case rules differ between engines.
async function subtreeOf(Tag, sequelize, userId, name, transaction) {
    const prefix = `${name}/`;
    return Tag.findAll({
        where: {
            user_id: userId,
            [Op.or]: [
                { name },
                sequelize.where(
                    sequelize.fn(
                        'SUBSTR',
                        sequelize.col('name'),
                        1,
                        prefix.length
                    ),
                    prefix
                ),
            ],
        },
        transaction,
    });
}

// Refuses a rename or move when any tag of the subtree would land on a name
// another tag of the same user already has.
async function assertNoNameCollision(
    Tag,
    sequelize,
    userId,
    previousName,
    newName,
    transaction
) {
    const subtree = await subtreeOf(
        Tag,
        sequelize,
        userId,
        previousName,
        transaction
    );
    const subtreeIds = new Set(subtree.map((tag) => tag.id));
    const targets = subtree.map(
        (tag) => newName + tag.name.slice(previousName.length)
    );
    const clashes = await Tag.findAll({
        where: { user_id: userId, name: { [Op.in]: targets } },
        transaction,
    });
    const clash = clashes.find((tag) => !subtreeIds.has(tag.id));
    if (clash) {
        throw new ConflictError(
            `A tag with the name "${clash.name}" already exists.`
        );
    }
}

// Derives the name and parent_id of a tag being saved. Setting parent_id
// (offline sync, parent_uid) rebuilds the name from the parent; otherwise the
// name is authoritative and the parent is found or created from its path.
async function resolveHierarchy(Tag, sequelize, tag, transaction) {
    const isNew = tag.isNewRecord;
    const nameChanged = isNew || tag.changed('name');
    const parentChanged = tag.changed('parent_id');
    if (!nameChanged && !parentChanged) return;

    const previousName = isNew ? null : tag.previous('name');
    let newName = tag.name;
    let parentId = tag.parent_id ?? null;
    let parentPath = null;

    if (parentChanged && tag.parent_id) {
        const parent = await Tag.findByPk(tag.parent_id, { transaction });
        if (!parent || parent.user_id !== tag.user_id) {
            throw new ValidationError('Parent tag not found');
        }
        newName = `${parent.name}/${leafOf(tag.name)}`;
        parentId = parent.id;
    } else if (parentChanged && !nameChanged) {
        newName = leafOf(tag.name);
        parentId = null;
    } else {
        parentPath = parentPathOf(tag.name);
        parentId = null;
    }

    if (
        previousName &&
        (newName === previousName || newName.startsWith(`${previousName}/`))
    ) {
        throw new ValidationError(
            'A tag cannot be moved under itself or under one of its children'
        );
    }

    if (previousName && newName !== previousName) {
        await assertNoNameCollision(
            Tag,
            sequelize,
            tag.user_id,
            previousName,
            newName,
            transaction
        );
    }

    if (parentPath) {
        const parent = await findOrCreateByPath(
            Tag,
            tag.user_id,
            parentPath,
            transaction
        );
        parentId = parent.id;
    }

    tag.name = newName;
    tag.parent_id = parentId;
    tag._renamedFrom =
        previousName && previousName !== newName ? previousName : null;
}

// Renaming a tag renames its subtree: each direct child gets the new prefix,
// and its own save cascades to deeper levels.
async function cascadeRename(Tag, tag, transaction) {
    if (!tag._renamedFrom) return;
    const children = await Tag.findAll({
        where: { parent_id: tag.id },
        transaction,
    });
    for (const child of children) {
        child.name = `${tag.name}/${leafOf(child.name)}`;
        await child.save({ transaction });
    }
    tag._renamedFrom = null;
}

module.exports = (sequelize) => {
    const Tag = sequelize.define(
        'Tag',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            // Offline sync: the hybrid logical clock of each field's last
            // write, used to merge edits field by field.
            field_clocks: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            uid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: uid,
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            tag_type: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: 'user',
            },
            pinned: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            color: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            icon: {
                type: DataTypes.STRING(40),
                allowNull: true,
            },
            parent_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'tags',
                    key: 'id',
                },
                onDelete: 'SET NULL',
            },
        },
        {
            tableName: 'tags',
            indexes: [
                {
                    fields: ['user_id'],
                },
                {
                    unique: true,
                    fields: ['user_id', 'name'],
                    name: 'tags_user_id_name_unique',
                },
            ],
            hooks: {
                beforeSave: (tag, options) =>
                    resolveHierarchy(Tag, sequelize, tag, options.transaction),
                afterSave: (tag, options) =>
                    cascadeRename(Tag, tag, options.transaction),
            },
        }
    );

    return Tag;
};
