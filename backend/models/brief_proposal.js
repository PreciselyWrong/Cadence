const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A proposal the daily brief showed, or an answer or feedback the user gave.
// Unused since the brief was retired on 2026-11-12: the table stays so the
// schema of migrated and new databases still match (docs/database.md).
module.exports = (sequelize) => {
    const BriefProposal = sequelize.define(
        'BriefProposal',
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
            // The user's local date of the brief the proposal belongs to.
            brief_date: { type: DataTypes.DATEONLY, allowNull: false },
            // move | tonight | anticipate | question | mail | feedback
            kind: { type: DataTypes.STRING(16), allowNull: false },
            target_type: { type: DataTypes.STRING(16), allowNull: false },
            target_ref: { type: DataTypes.STRING(255), allowNull: false },
            proposal: { type: DataTypes.JSON, allowNull: true },
            fingerprint: { type: DataTypes.STRING(255), allowNull: true },
            // pending | accepted | refused | ignored
            decision: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'pending',
            },
            reason: { type: DataTypes.TEXT, allowNull: true },
            rule: { type: DataTypes.STRING(100), allowNull: true },
            agent: { type: DataTypes.STRING(40), allowNull: true },
            run_id: { type: DataTypes.STRING(100), allowNull: true },
            execution_status: { type: DataTypes.STRING(16), allowNull: true },
            execution_ref: { type: DataTypes.STRING(255), allowNull: true },
            idempotency_key: {
                type: DataTypes.STRING(150),
                allowNull: true,
                unique: true,
            },
            decided_at: { type: DataTypes.DATE, allowNull: true },
        },
        {
            tableName: 'brief_proposals',
            indexes: [
                {
                    fields: ['user_id', 'brief_date'],
                    name: 'brief_proposals_user_date_idx',
                },
                {
                    fields: ['user_id', 'kind', 'target_ref'],
                    name: 'brief_proposals_user_kind_target_idx',
                },
            ],
        }
    );

    return BriefProposal;
};
