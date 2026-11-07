jest.mock('../../modules/telegram/telegramPoller', () => ({
    ...jest.requireActual('../../modules/telegram/telegramPoller'),
    sendTelegramMessage: jest.fn(),
}));

const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../../app');
const { User, sequelize } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const telegramPoller = require('../../modules/telegram/telegramPoller');
const {
    sendTelegramNotification,
} = require('../../modules/telegram/telegramNotificationService');

const TOKEN = '123456789:ABCdefGHIjklMNOPQRSTUVwxyz-12345678';

const storedToken = async (userId) => {
    const [row] = await sequelize.query(
        'SELECT telegram_bot_token FROM users WHERE id = :id',
        { replacements: { id: userId }, type: QueryTypes.SELECT }
    );
    return row.telegram_bot_token;
};

describe('Telegram bot token at rest and in the profile', () => {
    let user, agent;
    const savedSessionSecret = process.env.TUDUDI_SESSION_SECRET;

    beforeEach(async () => {
        process.env.TUDUDI_SESSION_SECRET = 'x'.repeat(64);
        user = await createTestUser({ email: 'tg-secret@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'tg-secret@example.com',
            password: 'password123',
        });
    });

    afterEach(() => {
        if (savedSessionSecret === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = savedSessionSecret;
        }
    });

    it('stores the token encrypted when saved from the profile', async () => {
        const response = await agent
            .patch('/api/profile')
            .send({ telegram_bot_token: TOKEN });

        expect(response.status).toBe(200);
        const raw = await storedToken(user.id);
        expect(raw.startsWith('enc:v1:')).toBe(true);
        expect(raw).not.toContain(TOKEN);
    });

    it('stores the token encrypted when saved by the Telegram setup', async () => {
        const response = await agent
            .post('/api/telegram/setup')
            .send({ token: TOKEN });

        expect(response.status).toBe(200);
        expect((await storedToken(user.id)).startsWith('enc:v1:')).toBe(true);
    });

    it('never sends the token back, only whether it is set and its end', async () => {
        await user.update({ telegram_bot_token: TOKEN });

        const profile = await agent.get('/api/profile');
        expect(profile.status).toBe(200);
        expect(profile.body).not.toHaveProperty('telegram_bot_token');
        expect(profile.body.telegram_bot_token_set).toBe(true);
        expect(profile.body.telegram_bot_token_last4).toBe('5678');
        expect(JSON.stringify(profile.body)).not.toContain(TOKEN);

        const updated = await agent
            .patch('/api/profile')
            .send({ telegram_bot_token: TOKEN });
        expect(updated.body).not.toHaveProperty('telegram_bot_token');
        expect(updated.body.telegram_bot_token_set).toBe(true);
        expect(JSON.stringify(updated.body)).not.toContain(TOKEN);
    });

    it('reports no token when none is saved', async () => {
        const profile = await agent.get('/api/profile');
        expect(profile.body.telegram_bot_token_set).toBe(false);
        expect(profile.body.telegram_bot_token_last4).toBe(null);
    });

    it('keeps the saved token when a profile update leaves it out', async () => {
        await user.update({ telegram_bot_token: TOKEN });

        await agent.patch('/api/profile').send({ language: 'fr' });

        expect((await User.findByPk(user.id)).telegram_bot_token).toBe(TOKEN);
    });

    it('clears the token when the profile sends an empty one', async () => {
        await user.update({ telegram_bot_token: TOKEN });

        await agent.patch('/api/profile').send({ telegram_bot_token: '' });

        const profile = await agent.get('/api/profile');
        expect(profile.body.telegram_bot_token_set).toBe(false);
    });

    it('hands the plaintext token to the Telegram sender', async () => {
        await user.update({
            telegram_bot_token: TOKEN,
            telegram_chat_id: '42',
        });
        const reader = await User.findByPk(user.id, {
            attributes: [
                'id',
                'name',
                'telegram_bot_token',
                'telegram_chat_id',
            ],
        });

        const result = await sendTelegramNotification(reader, {
            title: 'Due',
            message: 'Task due',
        });

        expect(result.success).toBe(true);
        expect(telegramPoller.sendTelegramMessage).toHaveBeenCalledWith(
            TOKEN,
            '42',
            expect.any(String)
        );
    });

    it('still reads a token saved before encryption', async () => {
        await sequelize.query(
            'UPDATE users SET telegram_bot_token = :token WHERE id = :id',
            { replacements: { token: TOKEN, id: user.id } }
        );

        expect((await User.findByPk(user.id)).telegram_bot_token).toBe(TOKEN);
    });

    it('describes the saved bot without the browser sending the token', async () => {
        await user.update({ telegram_bot_token: TOKEN });

        const response = await agent.get('/api/telegram/bot-info');

        expect(response.status).toBe(200);
        expect(response.body.bot.username).toBe('testbot');
    });

    it('refuses to describe a bot when no token is saved', async () => {
        const response = await agent.get('/api/telegram/bot-info');

        expect(response.status).toBe(400);
    });
});
