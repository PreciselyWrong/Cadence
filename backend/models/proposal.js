const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// An agent proposal (docs/47-proposals.md): the facts Cadence computed, the
// agent's validated answer, and where the proposal stands.
module.exports = (sequelize) => {
    const Proposal = sequelize.define(
        'Proposal',
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
            // week | review | career | weekend
            kind: { type: DataTypes.STRING(16), allowNull: false },
            // pending | ready | failed | applied | dismissed
            status: { type: DataTypes.STRING(16), allowNull: false },
            period_start: { type: DataTypes.DATEONLY, allowNull: true },
            period_end: { type: DataTypes.DATEONLY, allowNull: true },
            facts: { type: DataTypes.JSON, allowNull: false },
            answer: { type: DataTypes.JSON, allowNull: true },
            error: { type: DataTypes.STRING(64), allowNull: true },
            reply_text: { type: DataTypes.TEXT, allowNull: true },
        },
        {
            tableName: 'proposals',
            indexes: [
                {
                    name: 'proposals_user_kind_idx',
                    fields: ['user_id', 'kind'],
                },
            ],
        }
    );
    return Proposal;
};
