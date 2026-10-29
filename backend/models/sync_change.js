const { DataTypes } = require('sequelize');

// Append-only journal of every change to a syncable row. Its id is the
// cursor clients pull from, so a clock skew between devices can never hide
// a change. A delete stays here as a tombstone.
module.exports = (sequelize) => {
    const SyncChange = sequelize.define(
        'SyncChange',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            entity: {
                type: DataTypes.STRING(40),
                allowNull: false,
            },
            uid: {
                type: DataTypes.STRING(64),
                allowNull: false,
            },
            op: {
                type: DataTypes.STRING(10),
                allowNull: false,
            },
            data: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            op_id: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            // Reserved for shared projects: lets a member pull changes they
            // can see without owning the row.
            scope_key: {
                type: DataTypes.STRING(80),
                allowNull: true,
            },
        },
        {
            tableName: 'sync_changes',
            updatedAt: false,
            indexes: [
                { fields: ['user_id', 'id'] },
                { fields: ['user_id', 'entity', 'uid'] },
            ],
        }
    );

    return SyncChange;
};
