const { DataTypes } = require('sequelize');
const { uid } = require('../utils/uid');

// A free board column inside one project. Tasks point at it via section_id.
module.exports = (sequelize) => {
    const ProjectSection = sequelize.define(
        'ProjectSection',
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
            project_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'projects', key: 'id' },
                onDelete: 'CASCADE',
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: { notEmpty: true, len: [1, 255] },
            },
            position: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: 'project_sections',
            indexes: [
                {
                    fields: ['project_id', 'position'],
                    name: 'project_sections_project_position',
                },
            ],
        }
    );

    return ProjectSection;
};
