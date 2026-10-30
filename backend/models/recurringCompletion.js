const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

module.exports = (sequelize) => {
    const RecurringCompletion = sequelize.define(
        'RecurringCompletion',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            // Client-chosen or generated; lets an offline client retry a
            // check-in without creating a second row.
            uid: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
                defaultValue: uid,
            },
            // Nullable in the schema: rows older than this column are backfilled
            // by the migration, but the column is added to a shared table.
            updated_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            task_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'tasks',
                    key: 'id',
                },
            },
            completed_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            original_due_date: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            skipped: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            value: {
                type: DataTypes.FLOAT,
                allowNull: true,
            },
            note: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            tableName: 'recurring_completions',
            // Only updated_at: check-ins are read by updated_since.
            timestamps: true,
            createdAt: false,
            updatedAt: 'updated_at',
        }
    );

    RecurringCompletion.associate = function (models) {
        RecurringCompletion.belongsTo(models.Task, {
            foreignKey: 'task_id',
            as: 'Task',
        });
    };

    return RecurringCompletion;
};
