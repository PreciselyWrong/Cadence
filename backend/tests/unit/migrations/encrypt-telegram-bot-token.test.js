const { Sequelize, QueryTypes } = require('sequelize');
const { sequelize, User } = require('../../../models');
const secretCipher = require('../../../shared/crypto/secretCipher');
const migration = require('../../../migrations/20261107100000-encrypt-telegram-bot-token');

const TOKEN = '123456789:ABCdefGHIjklMNOPQRSTUVwxyz-12345678';

describe('migration 20261107100000-encrypt-telegram-bot-token', () => {
    const qi = () => sequelize.getQueryInterface();
    const run = () => migration.up(qi(), Sequelize);
    const savedSessionSecret = process.env.TUDUDI_SESSION_SECRET;
    const savedExplicitKey = process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY;

    const setRaw = (id, value) =>
        sequelize.query(
            'UPDATE users SET telegram_bot_token = :value WHERE id = :id',
            { replacements: { value, id } }
        );
    const getRaw = async (id) => {
        const [row] = await sequelize.query(
            'SELECT telegram_bot_token FROM users WHERE id = :id',
            { replacements: { id }, type: QueryTypes.SELECT }
        );
        return row.telegram_bot_token;
    };

    let withToken, without;

    beforeEach(async () => {
        process.env.TUDUDI_SESSION_SECRET = 'x'.repeat(64);
        delete process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY;
        withToken = await User.create({ email: 'tg@example.com', name: 'tg' });
        without = await User.create({ email: 'no@example.com', name: 'no' });
        await setRaw(withToken.id, TOKEN);
    });

    afterEach(() => {
        if (savedSessionSecret === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = savedSessionSecret;
        }
        if (savedExplicitKey !== undefined) {
            process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY = savedExplicitKey;
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('encrypts a plaintext token', async () => {
        await run();

        const raw = await getRaw(withToken.id);
        expect(raw.startsWith('enc:v1:')).toBe(true);
        expect(secretCipher.decrypt(raw)).toBe(TOKEN);
    });

    it('leaves an account without a token alone', async () => {
        await run();

        expect(await getRaw(without.id)).toBe(null);
    });

    it('does nothing on a second run', async () => {
        await run();
        const first = await getRaw(withToken.id);

        await run();

        expect(await getRaw(withToken.id)).toBe(first);
    });

    it('keeps plaintext tokens when the server has no key material', async () => {
        delete process.env.TUDUDI_SESSION_SECRET;

        await run();

        expect(await getRaw(withToken.id)).toBe(TOKEN);
    });
});
