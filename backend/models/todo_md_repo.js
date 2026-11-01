const { DataTypes } = require('sequelize');

// Sync state of a git repository whose TODO.md is mirrored as a project
// (modules/todo-md/repos.js). The repository itself is configured by
// environment variables; this row only remembers what was last seen and the
// edits that could not be pushed yet.
module.exports = (sequelize) => {
    const TodoMdRepo = sequelize.define(
        'TodoMdRepo',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            slug: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },
            // Commit of the branch the project was last read from.
            head_sha: { type: DataTypes.STRING(64), allowNull: true },
            synced_at: { type: DataTypes.DATE, allowNull: true },
            // Last fetch or push failure, credentials removed.
            last_error: { type: DataTypes.TEXT, allowNull: true },
            // Edits made in Cadence that are not in the repository yet:
            // [{ id, op, ..., reason, error, at }].
            pending: { type: DataTypes.JSON, allowNull: true },
        },
        {
            tableName: 'todo_md_repos',
            timestamps: true,
            underscored: true,
        }
    );

    return TodoMdRepo;
};
