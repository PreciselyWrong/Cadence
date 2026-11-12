const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A mail thread an agent proposed to the triage queue (docs/43-mail-triage.md).
// It holds what the card shows, never the body of a message.
module.exports = (sequelize) => {
    const MailItem = sequelize.define(
        'MailItem',
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
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            account: { type: DataTypes.STRING(64), allowNull: false },
            thread_id: { type: DataTypes.STRING(128), allowNull: false },
            from_name: { type: DataTypes.STRING(255), allowNull: true },
            from_address: { type: DataTypes.STRING(320), allowNull: true },
            subject: { type: DataTypes.STRING(500), allowNull: true },
            received_at: { type: DataTypes.DATE, allowNull: false },
            summary: { type: DataTypes.STRING(200), allowNull: false },
            suggestion: { type: DataTypes.JSON, allowNull: true },
            draft_excerpt: { type: DataTypes.STRING(280), allowNull: true },
            gmail_url: { type: DataTypes.STRING(2048), allowNull: false },
            // pending | later | done
            status: { type: DataTypes.STRING(16), allowNull: false },
            later_until: { type: DataTypes.DATE, allowNull: true },
            // task | reply | later | dismiss | resolved (by the agent)
            decision: { type: DataTypes.STRING(16), allowNull: true },
            decided_at: { type: DataTypes.DATE, allowNull: true },
            decide_key: { type: DataTypes.STRING(150), allowNull: true },
            task_uid: { type: DataTypes.STRING, allowNull: true },
            archived_at: { type: DataTypes.DATE, allowNull: true },
        },
        {
            tableName: 'mail_items',
            indexes: [
                {
                    name: 'mail_items_user_thread_unique',
                    unique: true,
                    fields: ['user_id', 'account', 'thread_id'],
                },
                {
                    name: 'mail_items_user_status_idx',
                    fields: ['user_id', 'status'],
                },
            ],
        }
    );
    return MailItem;
};
