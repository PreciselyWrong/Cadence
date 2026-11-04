'use strict';

// The brief audio end to end on the database: generation renders the audio
// through a fake Piper server on 127.0.0.1, the owner streams it with byte
// ranges, the uploads route refuses it, the purge expires it, and the status,
// voices and preview routes ask Piper. Names and addresses are fictitious.
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../app');
const { getConfig } = require('../../config/config');
const { createTestUser } = require('../helpers/testUtils');
const { DailyPlan, Task } = require('../../models');
const briefService = require('../../modules/daily-plan/brief/service');
const {
    generateBrief,
    settlePendingReplies,
} = require('../../modules/daily-plan/brief/generate');
const {
    generateDueBriefs,
    purgeBriefMemory,
} = require('../../modules/daily-plan/brief/job');
const { encodeWav, parseWav } = require('../../modules/daily-plan/brief/wav');

const SESSION_SECRET = 'brief-audio-test-session-secret';
const TODAY = '2026-11-04';
const NOW = new Date('2026-11-04T06:30:00Z');
const VOICE = 'fr_FR-fictif-medium';

const wavOfSeconds = (seconds) => {
    const sampleRate = 22050;
    const data = Buffer.alloc(Math.round(seconds * sampleRate) * 2);
    return encodeWav({ channels: 1, sampleRate, bitsPerSample: 16, data });
};

// A fake Piper server. `requests` keeps the bodies it received.
function startFakePiper() {
    const fake = { requests: [] };
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            fake.requests.push({ method: req.method, url: req.url, body });
            if (req.method === 'POST' && req.url === '/synthesize') {
                const { text } = JSON.parse(body);
                // Longer text, longer clip: the durations are checkable.
                const seconds = Math.max(1, Math.round(text.length / 40));
                res.writeHead(200, { 'Content-Type': 'audio/wav' });
                res.end(wavOfSeconds(seconds));
                return;
            }
            if (req.method === 'GET' && req.url === '/voices') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ [VOICE]: {}, 'fr_FR-autre-low': {} }));
                return;
            }
            res.writeHead(404).end();
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                fake,
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

// A closed port: nothing answers there.
async function unusedPiperUrl() {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    return `http://127.0.0.1:${port}`;
}

const binaryParser = (res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('daily brief audio', () => {
    let saved;
    let piper;
    let uploads;
    let owner;
    let agent;

    const row = async () => {
        const found = await DailyPlan.findOne({
            where: { user_id: owner.id, plan_date: TODAY },
        });
        return found.get({ plain: true });
    };

    const audioOf = async () => (await row()).brief.audio;

    beforeAll(async () => {
        saved = {
            session: process.env.TUDUDI_SESSION_SECRET,
            uploadPath: getConfig().uploadPath,
        };
        process.env.TUDUDI_SESSION_SECRET = SESSION_SECRET;
        uploads = await fsp.mkdtemp(
            path.join(os.tmpdir(), 'cadence-brief-audio-')
        );
        getConfig().uploadPath = uploads;
        piper = await startFakePiper();
    });

    afterAll(async () => {
        await piper.close();
        getConfig().uploadPath = saved.uploadPath;
        if (saved.session === undefined)
            delete process.env.TUDUDI_SESSION_SECRET;
        else process.env.TUDUDI_SESSION_SECRET = saved.session;
        await fsp.rm(uploads, { recursive: true, force: true });
    });

    beforeEach(async () => {
        piper.fake.requests.length = 0;
        owner = await createTestUser({
            email: `brief-audio-${Math.random().toString(36).slice(2, 8)}@example.com`,
            timezone: 'Europe/Paris',
        });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: owner.email,
            password: 'password123',
        });
        await Task.create({
            name: 'Payer la facture fictive',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
            estimated_minutes: 15,
        });
        await briefService.saveBriefSettings(owner, {
            voice: {
                enabled: true,
                piperUrl: piper.url,
                voice: VOICE,
                speed: 1,
            },
        });
    });

    const generate = async () => {
        await generateBrief(owner, TODAY, { reason: 'manual', now: NOW });
        await settlePendingReplies();
    };

    it('builds the script with the brief and renders the audio of the version', async () => {
        await generate();

        const stored = await row();
        expect(stored.brief.audio_script.chapters.map((c) => c.id)).toEqual(
            expect.arrayContaining(['intro', 'tonight'])
        );
        expect(stored.brief.audio_script.chapters[0].text).toMatch(
            /^Nous sommes mercredi quatre novembre\./
        );
        expect(stored.brief.audio).toMatchObject({
            status: 'ready',
            path: `briefs/${owner.uid}/${TODAY}-v1.mp3`,
            voice: VOICE,
            error: null,
        });
        expect(stored.brief.audio.chapters[0]).toEqual({
            id: 'intro',
            start_seconds: 0,
        });
        expect(stored.brief.audio.duration_seconds).toBeGreaterThan(0);

        const file = path.join(uploads, stored.brief.audio.path);
        expect(fs.existsSync(file)).toBe(true);
        expect((await fsp.stat(file)).mode & 0o777).toBe(0o600);
        expect((await fsp.stat(path.dirname(file))).mode & 0o777).toBe(0o700);
    });

    it('renders the audio of the scheduled run too', async () => {
        await briefService.saveBriefSettings(owner, {
            enabled: true,
            days: [3],
            time: '07:00',
        });
        await generateDueBriefs({ now: NOW });
        await settlePendingReplies();

        expect(await audioOf()).toMatchObject({
            status: 'ready',
            path: `briefs/${owner.uid}/${TODAY}-v1.mp3`,
        });
    });

    it('sends the script only to the configured Piper address', async () => {
        const calls = [];
        const realFetch = global.fetch;
        const spy = jest
            .spyOn(global, 'fetch')
            .mockImplementation((url, init) => {
                calls.push(String(url));
                return realFetch(url, init);
            });
        try {
            await generate();
        } finally {
            spy.mockRestore();
        }
        expect(calls.length).toBeGreaterThan(0);
        const origin = new URL(piper.url).origin;
        for (const url of calls) {
            expect(new URL(url).origin).toBe(origin);
        }
        const synth = piper.fake.requests.filter(
            (r) => r.url === '/synthesize'
        );
        expect(synth.length).toBeGreaterThan(0);
        expect(JSON.parse(synth[0].body)).toMatchObject({
            voice: VOICE,
            length_scale: 1,
        });
    });

    it('keeps the brief usable and marks the audio failed when Piper does not answer', async () => {
        await briefService.saveBriefSettings(owner, {
            voice: { piperUrl: await unusedPiperUrl() },
        });
        await generate();

        const stored = await row();
        expect(stored.brief_status).toBe('ready');
        expect(stored.brief.audio).toMatchObject({
            status: 'failed',
            path: null,
            error: 'piper_unreachable',
        });
        expect(stored.brief.audio_script.chapters.length).toBeGreaterThan(0);
    });

    it('stays off when the voice is disabled', async () => {
        await briefService.saveBriefSettings(owner, {
            voice: { enabled: false },
        });
        await generate();
        expect(await audioOf()).toMatchObject({ status: 'none', path: null });
        expect(piper.fake.requests).toHaveLength(0);
    });

    describe('streaming the audio', () => {
        const url = () => `/api/daily-plan/${TODAY}/brief/audio`;

        beforeEach(async () => {
            await generate();
        });

        it('streams the MP3 of the current version', async () => {
            const res = await agent.get(url()).buffer(true).parse(binaryParser);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('audio/mpeg');
            expect(res.headers['accept-ranges']).toBe('bytes');
            expect(res.body.length).toBe(Number(res.headers['content-length']));
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('answers byte ranges for seeking', async () => {
            const full = await agent
                .get(url())
                .buffer(true)
                .parse(binaryParser);
            const size = full.body.length;

            const part = await agent
                .get(url())
                .set('Range', 'bytes=10-19')
                .buffer(true)
                .parse(binaryParser);
            expect(part.status).toBe(206);
            expect(part.headers['content-range']).toBe(`bytes 10-19/${size}`);
            expect(part.body.equals(full.body.subarray(10, 20))).toBe(true);

            const tail = await agent
                .get(url())
                .set('Range', 'bytes=-5')
                .buffer(true)
                .parse(binaryParser);
            expect(tail.status).toBe(206);
            expect(tail.body.equals(full.body.subarray(size - 5))).toBe(true);
        });

        it('answers 416 for a range outside the file', async () => {
            const res = await agent
                .get(url())
                .set('Range', 'bytes=99999999-')
                .buffer(true)
                .parse(binaryParser);
            expect(res.status).toBe(416);
        });

        it('keeps the audio off the static uploads route', async () => {
            const res = await agent.get(
                `/api/uploads/briefs/${owner.uid}/${TODAY}-v1.mp3`
            );
            expect(res.status).toBe(403);
        });

        it('answers 404 for another day or a missing version', async () => {
            const res = await agent.get(
                '/api/daily-plan/2026-11-05/brief/audio'
            );
            expect(res.status).toBe(404);
        });

        it('expires the file past retention and marks the brief', async () => {
            await briefService.saveBriefSettings(owner, {
                retention: { audioDays: 1 },
            });
            const stored = await row();
            const file = path.join(uploads, stored.brief.audio.path);
            const old = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
            await fsp.utimes(file, old, old);

            const result = await purgeBriefMemory({ now: NOW });

            expect(result.audio).toBe(1);
            expect(fs.existsSync(file)).toBe(false);
            expect(await audioOf()).toMatchObject({ status: 'expired' });
            const res = await agent.get(url());
            expect(res.status).toBe(404);
        });

        it('keeps a recent file', async () => {
            const result = await purgeBriefMemory({ now: NOW });
            expect(result.audio).toBe(0);
            expect(await audioOf()).toMatchObject({ status: 'ready' });
        });
    });

    describe('Piper routes', () => {
        it('lists the voices of the Piper server', async () => {
            const res = await agent.get('/api/daily-plan/brief/voices');
            expect(res.status).toBe(200);
            expect(res.body.voices).toEqual([VOICE, 'fr_FR-autre-low'].sort());
        });

        it('answers 502 when the Piper server does not answer', async () => {
            await briefService.saveBriefSettings(owner, {
                voice: { piperUrl: await unusedPiperUrl() },
            });
            const res = await agent.get('/api/daily-plan/brief/voices');
            expect(res.status).toBe(502);
            expect(res.body).toEqual({ error: 'piper_unreachable' });
        });

        it('reports the voice source as working through the status route', async () => {
            const res = await agent.get('/api/daily-plan/brief/status');
            const voice = res.body.sources.find((s) => s.id === 'voice');
            expect(voice).toEqual({
                id: 'voice',
                configured: true,
                working: true,
                detail: null,
            });
        });

        it('reports an unreachable voice source through the status route', async () => {
            await briefService.saveBriefSettings(owner, {
                voice: { piperUrl: await unusedPiperUrl() },
            });
            const res = await agent.get('/api/daily-plan/brief/status');
            const voice = res.body.sources.find((s) => s.id === 'voice');
            expect(voice).toMatchObject({
                configured: true,
                working: false,
                detail: 'piper_unreachable',
            });
        });

        it('previews a voice without storing anything', async () => {
            const res = await agent
                .post('/api/daily-plan/brief/voice-preview')
                .send({ voice: VOICE, speed: 1.1 })
                .buffer(true)
                .parse(binaryParser);
            expect(res.status).toBe(200);
            const isWav = res.body.toString('ascii', 0, 4) === 'RIFF';
            const isMp3 =
                res.body.toString('ascii', 0, 3) === 'ID3' ||
                (res.body[0] === 0xff && (res.body[1] & 0xe0) === 0xe0);
            expect(isWav || isMp3).toBe(true);
            expect(
                isWav ? parseWav(res.body).durationSeconds : 1
            ).toBeGreaterThan(0);
            expect(res.headers['content-type']).toMatch(/^audio\/(mpeg|wav)$/);
            const synth = piper.fake.requests.find(
                (r) => r.url === '/synthesize'
            );
            expect(JSON.parse(synth.body).length_scale).toBeCloseTo(1 / 1.1, 5);
        });

        it('refuses a preview text longer than 200 characters', async () => {
            const res = await agent
                .post('/api/daily-plan/brief/voice-preview')
                .send({ voice: VOICE, text: 'a'.repeat(201) });
            expect(res.status).toBe(400);
        });
    });
});
