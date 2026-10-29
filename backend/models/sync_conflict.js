const { DataTypes } = require('sequelize');

// A field value that lost a merge to a newer one. Kept so nothing typed
// offline disappears silently; the clients can show and restore it.
module.exports = (sequelize) => {
    const SyncConflict = sequelize.define(
        'SyncConflict',
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
            field: {
                type: DataTypes.STRING(64),
                allowNull: false,
            },
            losing_value: {
                type: DataTypes.JSON,
                allowNull: true,
            },
            losing_hlc: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            winning_hlc: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            op_id: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
        },
        {
            tableName: 'sync_conflicts',
            updatedAt: false,
            indexes: [{ fields: ['user_id', 'created_at'] }],
        }
    );

    return SyncConflict;
};
