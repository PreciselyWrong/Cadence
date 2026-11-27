const request = require('supertest');
const app = require('../../app');

// Google's OAuth consent screen links here: the page must be public and must
// not be the app shell, which would show a login screen instead of a policy.
describe('GET /privacy', () => {
    it('serves the privacy policy without signing in', async () => {
        const res = await request(app).get('/privacy');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<h1>Privacy Policy</h1>');
        expect(res.text).toMatch(/Google Calendar/);
    });
});
