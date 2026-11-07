const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// Automatic classification (modules/auto-classify, docs/41-auto-classify.md).
// One state per new item, the log of every change the classifier wrote, and
// the suggestions it put to the user. Items are referred to by entity + uid,
// like the sync journal, so a deleted item leaves nothing dangling.
module.exports = (sequelize) => {
    const userRef = {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
    };

    const AutoClassifyItem = sequelize.define(
        'AutoClassifyItem',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: userRef,
            entity: { type: DataTypes.STRING(16), allowNull: false },
            item_uid: { type: DataTypes.STRING, allowNull: false },
            // queued | waiting (link page not read yet) | done | skipped |
            // changed (edited before the write) | failed
            state: { type: DataTypes.STRING(16), allowNull: false },
            attempts: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            next_attempt_at: { type: DataTypes.DATE, allowNull: true },
            item_created_at: { type: DataTypes.DATE, allowNull: false },
            run_id: { type: DataTypes.STRING(40), allowNull: true },
            last_error: { type: DataTypes.STRING(255), allowNull: true },
        },
        {
            tableName: 'auto_classify_items',
            indexes: [
                {
                    name: 'auto_classify_items_user_item_unique',
                    unique: true,
                    fields: ['user_id', 'entity', 'item_uid'],
                },
                {
                    name: 'auto_classify_items_due_idx',
                    fields: ['state', 'next_attempt_at'],
                },
            ],
        }
    );

    const AutoClassifyChange = sequelize.define(
        'AutoClassifyChange',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: userRef,
            run_id: { type: DataTypes.STRING(40), allowNull: false },
            entity: { type: DataTypes.STRING(16), allowNull: false },
            item_uid: { type: DataTypes.STRING, allowNull: false },
            item_title: { type: DataTypes.STRING(255), allowNull: true },
            before: { type: DataTypes.JSON, allowNull: false },
            after: { type: DataTypes.JSON, allowNull: false },
            confidences: { type: DataTypes.JSON, allowNull: true },
            // What was put to the user, if anything (also kept in a dry run).
            asked: { type: DataTypes.JSON, allowNull: true },
            // The item's state right after the write: an undo, and the mark
            // on the item, hold only while it is unchanged.
            after_fingerprint: { type: DataTypes.STRING(64), allowNull: true },
            dry_run: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            undone_at: { type: DataTypes.DATE, allowNull: true },
        },
        {
            tableName: 'auto_classify_changes',
            indexes: [
                {
                    name: 'auto_classify_changes_user_run_idx',
                    fields: ['user_id', 'run_id'],
                },
                {
                    name: 'auto_classify_changes_user_item_idx',
                    fields: ['user_id', 'entity', 'item_uid'],
                },
            ],
        }
    );

    const AutoClassifySuggestion = sequelize.define(
        'AutoClassifySuggestion',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            uid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
                defaultValue: uid,
            },
            user_id: userRef,
            entity: { type: DataTypes.STRING(16), allowNull: false },
            item_uid: { type: DataTypes.STRING, allowNull: false },
            // classify | duplicate
            kind: { type: DataTypes.STRING(16), allowNull: false },
            payload: { type: DataTypes.JSON, allowNull: false },
            // pending | applied | dismissed | expired
            state: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'pending',
            },
            choice: { type: DataTypes.JSON, allowNull: true },
            run_id: { type: DataTypes.STRING(40), allowNull: true },
            expires_at: { type: DataTypes.DATE, allowNull: false },
            decided_at: { type: DataTypes.DATE, allowNull: true },
        },
        {
            tableName: 'auto_classify_suggestions',
            indexes: [
                {
                    name: 'auto_classify_suggestions_user_item_unique',
                    unique: true,
                    fields: ['user_id', 'entity', 'item_uid'],
                },
                {
                    name: 'auto_classify_suggestions_user_state_idx',
                    fields: ['user_id', 'state'],
                },
            ],
        }
    );

    return { AutoClassifyItem, AutoClassifyChange, AutoClassifySuggestion };
};
