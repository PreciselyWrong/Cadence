const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');

describe('Holidays API', () => {
    let agent;

    beforeEach(async () => {
        await createTestUser({ email: 'holidays@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'holidays@example.com',
            password: 'password123',
        });
    });

    it('lists countries and the regions of one', async () => {
        const countries = await agent.get('/api/holidays/countries');
        expect(countries.status).toBe(200);
        expect(countries.body.countries).toContainEqual(
            expect.objectContaining({ code: 'CH' })
        );
        const regions = await agent.get('/api/holidays/regions?country=CH');
        expect(regions.body.regions).toContainEqual(
            expect.objectContaining({ code: 'VD' })
        );
    });

    it('lists public holidays in a range, with the region ones', async () => {
        const national = await agent.get(
            '/api/holidays?country=CH&start=2026-12-01&end=2027-01-03'
        );
        // Country-wide list, Stephanstag included; Vaud drops it but adds
        // 2 January.
        expect(national.body.holidays.map((h) => h.date)).toEqual([
            '2026-12-25',
            '2026-12-26',
            '2027-01-01',
        ]);

        const vaud = await agent.get(
            '/api/holidays?country=CH&region=VD&start=2026-12-01&end=2027-01-03'
        );
        expect(vaud.body.holidays.map((h) => h.date)).toEqual([
            '2026-12-25',
            '2027-01-01',
            '2027-01-02',
        ]);
    });

    it('returns nothing for bad input', async () => {
        for (const query of [
            'country=ch&start=2026-01-01&end=2026-02-01',
            'country=CH&start=2026-02-01&end=2026-01-01',
            'country=CH&start=2026-01-01&end=2028-01-01',
            'country=CH',
        ]) {
            const res = await agent.get(`/api/holidays?${query}`);
            expect(res.body.holidays).toEqual([]);
        }
    });

    it('needs a signed-in user', async () => {
        const res = await request(app).get('/api/holidays/countries');
        expect(res.status).toBe(401);
    });

    it('saves the holiday country and region in the calendar settings', async () => {
        await agent.put('/api/profile/ui-settings').send({
            calendar: { holidayCountry: 'CH', holidayRegion: 'VD' },
        });
        let profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.calendar).toMatchObject({
            holidayCountry: 'CH',
            holidayRegion: 'VD',
        });

        await agent.put('/api/profile/ui-settings').send({
            calendar: { holidayCountry: 'FR' },
        });
        profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.calendar).toMatchObject({
            holidayCountry: 'FR',
            holidayRegion: '',
        });

        await agent.put('/api/profile/ui-settings').send({
            calendar: { holidayCountry: 'nowhere', holidayRegion: '<x>' },
        });
        profile = await agent.get('/api/profile');
        expect(profile.body.ui_settings.calendar.holidayCountry).toBe('FR');
    });
});
