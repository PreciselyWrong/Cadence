'use strict';

const secretCipher = require('../shared/crypto/secretCipher');

// Telegram bot tokens were stored in plaintext; the User model now encrypts
// them on save. This encrypts the rows already there. Without key material
// (TUDUDI_SESSION_SECRET or TUDUDI_OIDC_SECRET_ENCRYPTION_KEY) the rows stay
// as they are and are encrypted the next time the token is saved.
async function rewrite(queryInterface, shouldRewrite, transform) {
    if (!secretCipher.hasKeyMaterial()) return;

    const [rows] = await queryInterface.sequelize.query(
        'SELECT id, telegram_bot_token FROM users WHERE telegram_bot_token IS NOT NULL'
    );
    for (const row of rows) {
        const value = row.telegram_bot_token;
        if (!value || !shouldRewrite(value)) continue;
        await queryInterface.sequelize.query(
            'UPDATE users SET telegram_bot_token = :value WHERE id = :id',
            { replacements: { value: transform(value), id: row.id } }
        );
    }
}

module.exports = {
    async up(queryInterface) {
        await rewrite(
            queryInterface,
            (value) => !secretCipher.isEncrypted(value),
            secretCipher.encrypt
        );
    },

    async down(queryInterface) {
        await rewrite(
            queryInterface,
            secretCipher.isEncrypted,
            secretCipher.decrypt
        );
    },
};
