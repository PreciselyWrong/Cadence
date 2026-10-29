const { DataTypes } = require('sequelize');

// The stored answer to one keyed write (Idempotency-Key header). Rows are
// kept for 24 hours; see services/idempotencyService.js. `status` and `body`
// stay null while the first request is still running.
module.exports = (sequelize) => {
    const IdempotencyKey = sequelize.define(
        'IdempotencyKey',
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
            },
            key: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            method: {
                type: DataTypes.STRING(10),
                allowNull: false,
            },
            path: {
                type: DataTypes.STRING(512),
                allowNull: false,
            },
            request_hash: {
                type: DataTypes.STRING(64),
                allowNull: false,
            },
            status: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            body: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },
        },
        {
            tableName: 'idempotency_keys',
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['user_id', 'key'],
                    name: 'idempotency_keys_user_key',
                },
                {
                    fields: ['created_at'],
                    name: 'idempotency_keys_created_at',
                },
            ],
        }
    );

    return IdempotencyKey;
};
