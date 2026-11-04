'use strict';

// Generating the daily brief end to end on the database: inputs read from the
// planner, calendar, mail agent and focus blocks; versions; the job's
// selection; the routes. Names, addresses and calendars are fictitious.
const http = require('http');
const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');
const {
    DailyPlan,
    DailyPlanItem,
    InboxItem,
    Project,
    Tag,
    Task,
    TaskRelation,
} = require('../../models');
const dailyPlanService = require('../../modules/daily-plan/service');
const briefService = require('../../modules/daily-plan/brief/service');
const briefRepository = require('../../modules/daily-plan/brief/repository');
const calendarFeedsService = require('../../modules/calendar-feeds/service');
const agentsService = require('../../modules/agents/service');
const { collectInput } = require('../../modules/daily-plan/brief/collect');
const {
    generateBrief,
    settlePendingReplies,
} = require('../../modules/daily-plan/brief/generate');
const { generateDueBriefs } = require('../../modules/daily-plan/brief/job');

const SESSION_SECRET = 'brief-generate-test-session-secret';
const API_KEY = 'hermes-brief-test-key-WXYZ';
const TODAY = '2026-11-04'; // a Wednesday
const NOW = new Date('2026-11-04T06:30:00Z'); // 07:30 in Paris
const ICS_URL = 'https://calendar.example.test/agenda-fictif.ics';
const REPLY = {
    account: 'me@example.test',
    thread_ref: 'thread-fictif-1',
    from: 'colleague@example.test',
    subject: 'Sujet fictif',
    date: '2026-11-03T08:00:00Z',
    summary: 'Résumé fictif.',
    link: 'https://mail.example.test/thread/fictif-1',
};

// The calendar feed is read from this text instead of the network.
let mockIcsText = '';
jest.mock('../../modules/calendar-feeds/fetcher', () => {
    const actual = jest.requireActual('../../modules/calendar-feeds/fetcher');
    return { ...actual, fetchFeed: async () => mockIcsText };
});

const ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence test//FR',
    'BEGIN:VEVENT',
    'UID:meeting-fictif@example.test',
    'DTSTAMP:20261101T000000Z',
    'DTSTART;TZID=Europe/Paris:20261104T100000',
    'DTEND;TZID=Europe/Paris:20261104T110000',
    'SUMMARY:Réunion fictive',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:standup-fictif@example.test',
    'DTSTAMP:20261101T000000Z',
    'DTSTART;TZID=Europe/Paris:20261104T090000',
    'DTEND;TZID=Europe/Paris:20261104T091500',
    'RRULE:FREQ=DAILY;COUNT=5',
    'SUMMARY:Point fictif',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

// A fake mail agent on 127.0.0.1. `scenario.delayMs` holds the answer back so
// a test can observe the brief before the replies arrive.
function startFakeAgent() {
    const fake = {
        requests: [],
        scenario: { delayMs: 0, output: JSON.stringify({ replies: [REPLY] }) },
    };
    let runs = 0;
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const url = new URL(req.url, 'http://127.0.0.1');
            fake.requests.push({
                method: req.method,
                path: url.pathname,
                idempotencyKey: req.headers['idempotency-key'] || null,
                body: body ? JSON.parse(body) : null,
            });
            const send = (status, payload, delay = 0) =>
                setTimeout(() => {
                    res.writeHead(status, {
                        'Content-Type': 'application/json',
                    });
                    res.end(JSON.stringify(payload));
                }, delay);
            if (req.headers.authorization !== `Bearer ${API_KEY}`) {
                return send(401, { error: 'unauthorized' });
            }
            if (req.method === 'POST' && url.pathname === '/p/mail/v1/runs') {
                runs += 1;
                return send(
                    202,
                    { id: `run-fictif-${runs}` },
                    fake.scenario.delayMs
                );
            }
            const run = url.pathname.match(/^\/p\/mail\/v1\/runs\/(.+)$/);
            if (req.method === 'GET' && run) {
                return send(200, {
                    id: run[1],
                    status: 'completed',
                    output: fake.scenario.output,
                });
            }
            return send(404, { error: 'not found' });
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

// The row as the app reads it: the JSON brief column comes back parsed.
const briefRow = async (userId) => {
    const row = await DailyPlan.findOne({
        where: { user_id: userId, plan_date: TODAY },
    });
    return row ? row.get({ plain: true }) : null;
};

// Every column of the user's tasks, to show that nothing was written to them.
const taskSnapshot = async (userId) => {
    const rows = await Task.findAll({
        where: { user_id: userId },
        raw: true,
        order: [['id', 'ASC']],
    });
    return JSON.stringify(rows);
};

describe('daily brief generation', () => {
    let saved;
    let hermes;
    let user;
    let feedUid;

    beforeAll(async () => {
        saved = {
            session: process.env.TUDUDI_SESSION_SECRET,
            explicit: process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY,
        };
        process.env.TUDUDI_SESSION_SECRET = SESSION_SECRET;
        delete process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY;
        hermes = await startFakeAgent();
    });

    afterAll(async () => {
        await hermes.close();
        if (saved.session === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = saved.session;
        }
        if (saved.explicit !== undefined) {
            process.env.TUDUDI_OIDC_SECRET_ENCRYPTION_KEY = saved.explicit;
        }
    });

    // Tasks, a project, a block, an inbox item, a calendar and focus hours.
    async function seedWorkday(owner) {
        const project = await Project.create({
            name: 'Projet fictif',
            user_id: owner.id,
        });
        const tag = await Tag.create({ name: 'Facture', user_id: owner.id });
        const overdue = await Task.create({
            name: 'Relancer le devis fictif',
            user_id: owner.id,
            status: Task.STATUS.IN_PROGRESS,
            due_date: new Date('2026-11-02T12:00:00Z'),
            estimated_minutes: 20,
            project_id: project.id,
        });
        const due = await Task.create({
            name: 'Payer la facture fictive',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
            priority: 2,
            estimated_minutes: 15,
        });
        await due.setTags([tag]);
        const blocker = await Task.create({
            name: 'Bloquant fictif',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
        });
        const blocked = await Task.create({
            name: 'Bloqué fictif',
            user_id: owner.id,
            due_date: new Date('2026-11-06T12:00:00Z'),
        });
        await TaskRelation.create({
            source_task_id: blocker.id,
            target_task_id: blocked.id,
            relation_type: 'blocks',
            created_by_user_id: owner.id,
        });
        await Task.create({
            name: 'Habitude fictive',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
            habit_mode: true,
        });
        await Task.create({
            name: 'Lointaine fictive',
            user_id: owner.id,
            due_date: new Date('2026-12-20T12:00:00Z'),
        });
        await Task.create({
            name: 'Tâche close fictive',
            user_id: owner.id,
            status: Task.STATUS.DONE,
            completed_at: new Date('2026-11-03T10:00:00Z'),
        });
        const planDay = await DailyPlan.create({
            user_id: owner.id,
            plan_date: '2026-11-05',
        });
        await DailyPlanItem.create({
            daily_plan_id: planDay.id,
            task_id: due.id,
            position: 0,
            duration_minutes: 30,
        });
        await InboxItem.create({
            user_id: owner.id,
            title: 'Idée fictive',
            content: 'Texte fictif',
            source: 'test',
        });
        const feed = await calendarFeedsService.create(owner.id, {
            name: 'Agenda fictif',
            url: ICS_URL,
        });
        feedUid = feed.uid;
        await briefService.saveBriefSettings(owner, {
            calendarFeedUids: [feed.uid],
        });
        await dailyPlanService.saveFocusBlocks(owner, {
            blocks: [
                { days: [3], start: 540, end: 720, label: 'Focus fictif' },
            ],
        });
    }

    beforeEach(async () => {
        mockIcsText = ICS;
        hermes.fake.requests.length = 0;
        hermes.fake.scenario = {
            delayMs: 0,
            output: JSON.stringify({ replies: [REPLY] }),
        };
        user = await createTestUser({
            email: 'brief-generate@example.com',
            timezone: 'Europe/Paris',
        });
        await seedWorkday(user);
    });

    describe('collect and build', () => {
        it('maps tasks, relations, events, focus hours and inbox to the engine input', async () => {
            const settings = await briefService.getBriefSettings(user);
            const input = await collectInput(user, settings, {
                today: TODAY,
                now: NOW,
            });
            const byName = (name) => input.tasks.find((t) => t.name === name);

            expect(input.tasks.map((t) => t.name)).not.toContain(
                'Habitude fictive'
            );
            expect(input.tasks.map((t) => t.name)).not.toContain(
                'Lointaine fictive'
            );
            expect(input.tasks.map((t) => t.name)).not.toContain(
                'Tâche close fictive'
            );

            const overdue = byName('Relancer le devis fictif');
            expect(overdue).toMatchObject({
                status: 'in_progress',
                due_date: '2026-11-02',
                project_name: 'Projet fictif',
                estimated_minutes: 20,
            });

            const payment = byName('Payer la facture fictive');
            expect(payment).toMatchObject({
                due_date: TODAY,
                money: true,
                tags: ['Facture'],
                priority: 2,
            });
            expect(payment.planned_on).toEqual(['2026-11-05']);

            const blocker = byName('Bloquant fictif');
            const blocked = byName('Bloqué fictif');
            expect(blocker.blocks_uids).toEqual([blocked.uid]);
            expect(blocked.blocked_by_uids).toEqual([blocker.uid]);

            expect(input.closedTasks.map((t) => t.name)).toEqual([
                'Tâche close fictive',
            ]);
            expect(input.closedTasks[0].completed_at).toBe(
                '2026-11-03T10:00:00.000Z'
            );
            expect(input.inboxItems.map((item) => item.title)).toEqual([
                'Idée fictive',
            ]);

            expect(input.focusBlocksByDate[TODAY]).toEqual([
                { start: 540, end: 720, label: 'Focus fictif' },
            ]);
            expect(input.events.map((e) => e.title)).toEqual(
                expect.arrayContaining(['Réunion fictive', 'Point fictif'])
            );
            const meeting = input.events.find(
                (e) => e.title === 'Réunion fictive'
            );
            expect(meeting).toMatchObject({
                feed_uid: feedUid,
                date: TODAY,
                all_day: false,
                start_minute: 600,
                end_minute: 660,
                busy: true,
                calendar: 'Agenda fictif',
                series_ref: null,
            });
            expect(meeting.ref).toMatch(
                new RegExp(`^event:${feedUid}:meeting-fictif@example\\.test:`)
            );
            const standup = input.events.find(
                (e) => e.title === 'Point fictif'
            );
            expect(standup.series_ref).toBe(
                `series:${feedUid}:standup-fictif@example.test`
            );

            expect(input.contexts).toEqual([]);
            expect(input.decisions).toEqual([]);
            expect(input.replies).toBeNull();
            expect(input.sources).toEqual([
                { id: 'tasks', status: 'read', detail: null },
                { id: 'calendar', status: 'read', detail: null },
                { id: 'mail', status: 'not_configured', detail: null },
            ]);
        });

        it('reports the calendar as not configured when no calendar is selected', async () => {
            const settings = await briefService.getBriefSettings(user);
            const input = await collectInput(
                user,
                { ...settings, calendarFeedUids: [] },
                {
                    today: TODAY,
                    now: NOW,
                }
            );

            expect(input.events).toEqual([]);
            expect(input.sources).toContainEqual({
                id: 'calendar',
                status: 'not_configured',
                detail: null,
            });
        });

        it('builds a ready brief whose timeline shows the calendar conflicting with focus hours', async () => {
            const result = await generateBrief(user, TODAY, { now: NOW });

            expect(result.brief_version).toBe(1);
            expect(result.brief_status).toBe('ready');
            expect(result.brief.schema).toBe(1);
            expect(result.brief.sources).toEqual(
                expect.arrayContaining([
                    { id: 'tasks', status: 'read', detail: null },
                    { id: 'calendar', status: 'read', detail: null },
                    { id: 'mail', status: 'not_configured', detail: null },
                    { id: 'llm', status: 'off', detail: null },
                ])
            );
            expect(result.brief.counters.overdue).toBeGreaterThanOrEqual(1);
            const today = result.brief.timeline[0];
            expect(today.date).toBe(TODAY);
            const meeting = today.events.find(
                (e) => e.title === 'Réunion fictive'
            );
            expect(meeting.conflict).toBe(true);
            expect(result.brief.anticipate.map((card) => card.type)).toContain(
                'event_in_work_hours'
            );
            expect(result.brief.timeline[0].work).toEqual([
                { start: 540, end: 720, label: 'Focus fictif' },
            ]);
        });
    });

    describe('propose only', () => {
        it('never changes a task while the brief is generated', async () => {
            const before = await taskSnapshot(user.id);

            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });
            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });

            expect(await taskSnapshot(user.id)).toBe(before);
        });
    });

    describe('versions', () => {
        it('keeps the brief of a job run that finds one already built', async () => {
            const first = await generateBrief(user, TODAY, {
                reason: 'manual',
                now: NOW,
            });
            const before = await briefRow(user.id);

            const again = await generateBrief(user, TODAY, {
                reason: 'job',
                now: new Date(),
            });

            expect(again.brief_version).toBe(first.brief_version);
            expect(await briefRow(user.id)).toEqual(before);
        });

        it('makes a new version on each manual generation', async () => {
            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });
            const second = await generateBrief(user, TODAY, {
                reason: 'manual',
                now: NOW,
            });

            expect(second.brief_version).toBe(2);
            expect(second.brief_status).toBe('ready');
        });

        it('keeps the previous good brief when a generation fails', async () => {
            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });
            const good = await briefRow(user.id);
            jest.spyOn(briefRepository, 'saveBrief').mockRejectedValueOnce(
                new Error('write failed')
            );

            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });

            const row = await briefRow(user.id);
            expect(row.brief_status).toBe('failed');
            expect(row.brief_version).toBe(good.brief_version);
            expect(row.brief).toEqual(good.brief);
        });

        it('leaves started_at alone when it creates the day row', async () => {
            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });

            expect((await briefRow(user.id)).started_at).toBeNull();
        });
    });

    describe('mail replies', () => {
        beforeEach(async () => {
            await agentsService.saveSettings(user, {
                baseUrl: hermes.url,
                timeoutSeconds: 10,
                profiles: { mail: 'mail', drafting: '' },
                api_key: API_KEY,
            });
            await briefService.saveBriefSettings(user, {
                mail: {
                    enabled: true,
                    accounts: ['me@example.test'],
                    excludedAccounts: [],
                    replyWindowDays: 14,
                },
            });
        });

        it('fills only the replies, the counter and the mail source, asynchronously', async () => {
            hermes.fake.scenario.delayMs = 300;
            const pending = await generateBrief(user, TODAY, {
                reason: 'manual',
                now: NOW,
            });

            expect(pending.brief_status).toBe('partial');
            expect(pending.brief.sources).toContainEqual({
                id: 'mail',
                status: 'pending',
                detail: null,
            });
            const before = pending.brief;

            await settlePendingReplies();

            const after = await briefRow(user.id);
            expect(after.brief_status).toBe('ready');
            expect(after.brief_version).toBe(1);
            expect(after.brief.replies).toEqual([REPLY]);
            expect(after.brief.counters.replies).toBe(1);
            expect(after.brief.sources).toContainEqual({
                id: 'mail',
                status: 'read',
                detail: null,
            });
            expect(after.brief.timeline).toEqual(before.timeline);
            expect(after.brief.tonight).toEqual(before.tonight);
            expect(after.brief.verdict).toEqual(before.verdict);
            expect(after.brief.anticipate).toEqual(before.anticipate);

            const run = hermes.fake.requests.find(
                (r) => r.path === '/p/mail/v1/runs'
            );
            expect(run.idempotencyKey).toBe(
                `brief:${user.id}:${TODAY}:v1:replies`
            );
            expect(run.body.input).toContain('"windowDays": 14');
        });

        it('records the error code and keeps the brief ready when the agent refuses', async () => {
            await agentsService.saveSettings(user, {
                api_key: 'wrong-fictive-key',
            });

            await generateBrief(user, TODAY, { reason: 'manual', now: NOW });
            await settlePendingReplies();

            const row = await briefRow(user.id);
            expect(row.brief_status).toBe('ready');
            expect(row.brief.sources).toContainEqual({
                id: 'mail',
                status: 'unavailable',
                detail: 'unauthorized',
            });
            expect(row.brief.replies).toEqual([]);
        });
    });

    describe('scheduled job', () => {
        const briefSettings = {
            enabled: true,
            time: '07:00',
            days: [1, 2, 3, 4, 5],
        };

        it('builds the brief of each user whose local time and weekday have come, once', async () => {
            const paris = await createTestUser({
                email: 'paris-job@example.com',
                timezone: 'Europe/Paris',
            });
            const newYork = await createTestUser({
                email: 'newyork-job@example.com',
                timezone: 'America/New_York',
            });
            const late = await createTestUser({
                email: 'late-job@example.com',
                timezone: 'Europe/Paris',
            });
            const offDay = await createTestUser({
                email: 'offday-job@example.com',
                timezone: 'Europe/Paris',
            });
            const disabled = await createTestUser({
                email: 'disabled-job@example.com',
                timezone: 'Europe/Paris',
            });
            await briefService.saveBriefSettings(paris, briefSettings);
            await briefService.saveBriefSettings(newYork, briefSettings);
            await briefService.saveBriefSettings(late, {
                ...briefSettings,
                time: '08:00',
            });
            await briefService.saveBriefSettings(offDay, {
                ...briefSettings,
                days: [1],
            });
            await briefService.saveBriefSettings(disabled, {
                ...briefSettings,
                enabled: false,
            });

            // 06:30 UTC: 07:30 in Paris, 01:30 in New York (no brief there yet).
            const first = await generateDueBriefs({ now: NOW });
            expect(first.generated).toBe(1);

            const parisRow = await briefRow(paris.id);
            expect(parisRow.brief_version).toBe(1);
            expect(parisRow.brief_status).toBe('ready');
            expect(await briefRow(newYork.id)).toBeFalsy();
            expect(await briefRow(late.id)).toBeFalsy();
            expect(await briefRow(offDay.id)).toBeFalsy();
            expect(await briefRow(disabled.id)).toBeFalsy();

            // Later runs of the same day do not rewrite the brief.
            const second = await generateDueBriefs({
                now: new Date('2026-11-04T06:40:00Z'),
            });
            expect(second.generated).toBe(0);
            expect((await briefRow(paris.id)).brief_version).toBe(1);
        });

        it('builds nothing before the local time, even when the UTC clock is past it', async () => {
            const newYork = await createTestUser({
                email: 'early-job@example.com',
                timezone: 'America/New_York',
            });
            await briefService.saveBriefSettings(newYork, briefSettings);

            const result = await generateDueBriefs({ now: NOW });

            expect(result.generated).toBe(0);
            expect(await briefRow(newYork.id)).toBeFalsy();
        });
    });

    describe('routes', () => {
        let agent;

        beforeEach(async () => {
            agent = request.agent(app);
            await agent.post('/api/login').send({
                email: 'brief-generate@example.com',
                password: 'password123',
            });
        });

        it('POST regenerates the day and answers with the GET payload', async () => {
            const first = await agent.post(`/api/daily-plan/${TODAY}/brief`);
            expect(first.status).toBe(200);
            expect(first.body).toMatchObject({
                date: TODAY,
                version: 1,
                status: expect.stringMatching(/^(ready|partial)$/),
            });
            expect(first.body.brief).not.toBeNull();
            expect(first.body.tasks).toEqual(expect.any(Object));

            const second = await agent.post(`/api/daily-plan/${TODAY}/brief`);
            expect(second.body.version).toBe(2);

            const get = await agent.get(`/api/daily-plan/${TODAY}/brief`);
            expect(get.body).toEqual(second.body);
        });

        it('rejects a malformed date on POST', async () => {
            const res = await agent.post('/api/daily-plan/04-11-2026/brief');

            expect(res.status).toBe(400);
        });

        it('GET status lists each source, with the timezone check', async () => {
            const res = await agent.get('/api/daily-plan/brief/status');

            expect(res.status).toBe(200);
            expect(res.body.sources.map((source) => source.id)).toEqual([
                'calendar',
                'mail',
                'llm',
                'voice',
                'agent',
            ]);
            expect(res.body.sources[0]).toEqual({
                id: 'calendar',
                configured: true,
                working: true,
                detail: null,
            });
            expect(res.body.sources[1]).toMatchObject({
                id: 'mail',
                configured: false,
            });
            expect(res.body.sources[2]).toMatchObject({
                id: 'llm',
                configured: false,
            });
            expect(res.body.sources[3]).toEqual({
                id: 'voice',
                configured: false,
                working: null,
                detail: null,
            });
            expect(res.body.sources[4]).toMatchObject({
                id: 'agent',
                configured: false,
            });
            expect(res.body.timezone_set).toBe(true);
        });

        it('GET status reports the timezone as not set for UTC', async () => {
            await createTestUser({
                email: 'utc-status@example.com',
                timezone: 'UTC',
            });
            const utcAgent = request.agent(app);
            await utcAgent.post('/api/login').send({
                email: 'utc-status@example.com',
                password: 'password123',
            });

            const res = await utcAgent.get('/api/daily-plan/brief/status');

            expect(res.body.timezone_set).toBe(false);
        });
    });
});
