const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// Per-user mail sender rules (docs/43-mail-triage.md, Sender rule).
module.exports = (sequelize) => {
    const MailSenderRule = sequelize.define(
        'MailSenderRule',
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
            address: { type: DataTypes.STRING(254), allowNull: false },
            action: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'archive',
            },
        },
        {
            tableName: 'mail_sender_rules',
            indexes: [
                {
                    name: 'mail_sender_rules_user_address_unique',
                    unique: true,
                    fields: ['user_id', 'address'],
                },
            ],
        }
    );
    return MailSenderRule;
};
