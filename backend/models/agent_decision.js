const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A decision card an agent proposed for the user (docs/49-agent-decisions.md).
module.exports = (sequelize) => {
    const AgentDecision = sequelize.define(
        'AgentDecision',
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
            kind: { type: DataTypes.STRING(32), allowNull: false },
            kind_label: { type: DataTypes.STRING(40), allowNull: false },
            key: { type: DataTypes.STRING(128), allowNull: false },
            title: { type: DataTypes.STRING(120), allowNull: false },
            context: { type: DataTypes.STRING(280), allowNull: true },
            body: { type: DataTypes.TEXT, allowNull: true },
            url: { type: DataTypes.STRING(2000), allowNull: true },
            choices: { type: DataTypes.JSON, allowNull: false },
            recommended: { type: DataTypes.STRING(24), allowNull: true },
            reason: { type: DataTypes.STRING(140), allowNull: true },
            data: { type: DataTypes.JSON, allowNull: true },
            // pending | later | reviewing | deciding | done
            status: { type: DataTypes.STRING(16), allowNull: false },
            decision: { type: DataTypes.STRING(24), allowNull: true },
            note: { type: DataTypes.JSON, allowNull: true },
            later_until: { type: DataTypes.DATE, allowNull: true },
            decided_at: { type: DataTypes.DATE, allowNull: true },
            decide_key: { type: DataTypes.STRING(150), allowNull: true },
            result: { type: DataTypes.JSON, allowNull: true },
        },
        {
            tableName: 'agent_decisions',
            indexes: [
                {
                    name: 'agent_decisions_user_kind_key_unique',
                    unique: true,
                    fields: ['user_id', 'kind', 'key'],
                },
                {
                    name: 'agent_decisions_user_status_idx',
                    fields: ['user_id', 'status'],
                },
            ],
        }
    );
    return AgentDecision;
};
