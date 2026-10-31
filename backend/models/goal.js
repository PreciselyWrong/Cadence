const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

module.exports = (sequelize) => {
    const Goal = sequelize.define(
        'Goal',
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
            // Offline sync: the hybrid logical clock of each field's last
            // write, used to merge edits field by field.
            field_clocks: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            // A goal with a parent is a key result of that objective; the
            // hierarchy stops at one level (modules/goals/service.js).
            parent_goal_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'goals',
                    key: 'id',
                },
            },
            area_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'areas',
                    key: 'id',
                },
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            why: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            horizon: {
                type: DataTypes.ENUM('month', 'quarter', 'season', 'year'),
                allowNull: false,
                defaultValue: 'season',
            },
            target_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM('active', 'achieved', 'paused', 'dropped'),
                allowNull: false,
                defaultValue: 'active',
            },
            color: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            // Bucket list: a goal without a date, listed under Have / Be /
            // Do and kept out of Today and the daily lists.
            bucket: {
                type: DataTypes.ENUM('have', 'be', 'do'),
                allowNull: true,
            },
        },
        {
            tableName: 'goals',
            indexes: [
                { fields: ['area_id'] },
                { fields: ['user_id'] },
                { fields: ['status'] },
                {
                    fields: ['parent_goal_id'],
                    name: 'goals_parent_goal_id_idx',
                },
            ],
        }
    );

    return Goal;
};
