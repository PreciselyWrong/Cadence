const { DataTypes } = require('sequelize');

// What the triage queue knows about one task (modules/triage): the decision
// taken on it, or the proposal the assistant made. Both hold for the state of
// the task they were made on (`fingerprint`).
module.exports = (sequelize) => {
    const TaskTriage = sequelize.define(
        'TaskTriage',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
            },
            task_uid: { type: DataTypes.STRING, allowNull: false },
            fingerprint: { type: DataTypes.STRING(64), allowNull: false },
            // pending (a proposal waits) | none (nothing to propose) |
            // kept | applied
            state: { type: DataTypes.STRING(16), allowNull: false },
            proposal: { type: DataTypes.JSON, allowNull: true },
            apply_key: { type: DataTypes.STRING(150), allowNull: true },
        },
        {
            tableName: 'task_triage',
            indexes: [
                {
                    name: 'task_triage_user_task_unique',
                    unique: true,
                    fields: ['user_id', 'task_uid'],
                },
            ],
        }
    );
    return TaskTriage;
};
