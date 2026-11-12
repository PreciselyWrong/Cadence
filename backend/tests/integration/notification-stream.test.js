process.env.TUDUDI_SESSION_SECRET =
    process.env.TUDUDI_SESSION_SECRET || 'stream-test-session-secret';

const http = require('http');
const request = require('supertest');
const app = require('../../app');
const { Notification, User } = require('../../models');
const stream = require('../../utils/notificationStream');
const { createTestUser } = require('../helpers/testUtils');

const login = async (user) => {
    const agent = request.agent(app);
    await agent
        .post('/api/login')
        .send({ email: user.email, password: 'password123' });
    return agent;
};

describe('notification stream', () => {
    let user, other;

    beforeEach(async () => {
        const stamp = `${Date.now()}_${Math.random()}`;
        user = await createTestUser({ email: `stream_a_${stamp}@example.com` });
        other = await createTestUser({
            email: `stream_b_${stamp}@example.com`,
        });
    });

    describe('hub', () => {
        it('hands a notification to its owner only', async () => {
            const mine = [];
            const theirs = [];
            const off1 = stream.subscribe(user.id, (n) => mine.push(n.title));
            const off2 = stream.subscribe(other.id, (n) =>
                theirs.push(n.title)
            );
            await Notification.createNotification({
                userId: user.id,
                type: 'system',
                title: 'Hello',
                sources: ['desktop'],
            });
            off1();
            off2();
            expect(mine).toEqual(['Hello']);
            expect(theirs).toEqual([]);
        });

        it('skips a notification that no live client reads', async () => {
            const seen = [];
            const off = stream.subscribe(user.id, (n) => seen.push(n.title));
            await Notification.createNotification({
                userId: user.id,
                type: 'system',
                title: 'In-app only',
                sources: ['telegram'],
            });
            off();
            expect(seen).toEqual([]);
        });

        it('holds a notification until its quiet hours end, then hands it over', async () => {
            await User.update(
                {
                    timezone: 'UTC',
                    quiet_hours: {
                        enabled: true,
                        start: '00:00',
                        end: '23:59',
                    },
                },
                { where: { id: user.id } }
            );
            const seen = [];
            const off = stream.subscribe(user.id, (n) => seen.push(n.title));
            const created = await Notification.createNotification({
                userId: user.id,
                type: 'system',
                title: 'Held',
                sources: ['mobile'],
            });
            expect(created.deliver_after).not.toBeNull();
            expect(seen).toEqual([]);
            await Notification.flushDeferred(
                new Date(created.deliver_after.getTime() + 1000)
            );
            off();
            expect(seen).toEqual(['Held']);
        });

        it('serializes without internal fields', async () => {
            const seen = [];
            const off = stream.subscribe(user.id, (n) => seen.push(n));
            await Notification.createNotification({
                userId: user.id,
                type: 'system',
                title: 'Shape',
                message: 'Body',
                data: { pluginId: 'hermes' },
                sources: ['desktop', 'mobile'],
            });
            off();
            expect(Object.keys(seen[0]).sort()).toEqual(
                [
                    'created_at',
                    'data',
                    'level',
                    'message',
                    'sources',
                    'title',
                    'type',
                    'uid',
                ].sort()
            );
        });
    });

    describe('GET /api/notifications/stream', () => {
        let server;
        let base;

        beforeAll(
            () =>
                new Promise((resolve) => {
                    server = http
                        .createServer(app)
                        .listen(0, '127.0.0.1', () => {
                            base = `http://127.0.0.1:${server.address().port}`;
                            resolve();
                        });
                })
        );

        afterAll(
            () =>
                new Promise((resolve) => {
                    server.closeAllConnections?.();
                    server.close(resolve);
                })
        );

        it('needs a signed-in user', async () => {
            const res = await request(app).get('/api/notifications/stream');
            expect(res.status).toBe(401);
        });

        it('streams a new notification as it is created', async () => {
            const agent = await login(user);
            const cookie = agent.jar
                .getCookies({
                    path: '/',
                    domain: '127.0.0.1',
                    secure: false,
                    script: false,
                })
                .map((c) => c.toString())
                .join('; ');

            const received = await new Promise((resolve, reject) => {
                const req = http.get(
                    `${base}/api/notifications/stream`,
                    { headers: { Cookie: cookie } },
                    (res) => {
                        expect(res.statusCode).toBe(200);
                        expect(res.headers['content-type']).toMatch(
                            /text\/event-stream/
                        );
                        let buffer = '';
                        res.setEncoding('utf8');
                        res.on('data', (chunk) => {
                            buffer += chunk;
                            if (buffer.includes('event: ready')) {
                                Notification.createNotification({
                                    userId: user.id,
                                    type: 'system',
                                    title: 'Live',
                                    sources: ['desktop'],
                                }).catch(reject);
                            }
                            if (buffer.includes('event: notification')) {
                                req.destroy();
                                resolve(buffer);
                            }
                        });
                    }
                );
                req.on('error', (error) => {
                    if (error.code !== 'ECONNRESET') reject(error);
                });
                setTimeout(() => reject(new Error('timeout')), 5000);
            });

            const data = received
                .split('\n')
                .find(
                    (line) => line.startsWith('data: ') && line.includes('Live')
                );
            expect(JSON.parse(data.slice(6))).toMatchObject({
                title: 'Live',
                type: 'system',
            });
        });
    });
});
