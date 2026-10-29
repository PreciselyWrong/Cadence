const { DataTypes } = require('sequelize');

// One row per pushed operation, keyed by the client's op_id, holding the
// answer it got. A replay after a lost response gets the same answer back
// instead of applying twice.
module.exports = (sequelize) => {
    const SyncOp = sequelize.define(
        'SyncOp',
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
            op_id: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            result: {
                type: DataTypes.JSON,
                allowNull: false,
            },
        },
        {
            tableName: 'sync_ops',
            updatedAt: false,
            indexes: [{ unique: true, fields: ['user_id', 'op_id'] }],
        }
    );

    return SyncOp;
};
