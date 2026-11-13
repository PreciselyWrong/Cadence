'use strict';

// Triage questions end to end on the database: answers that become linked
// contexts, context lifetimes and purge, isolation between users, and the
// triage settings. Names, addresses and calendars are fictitious.
const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');
const { LinkedContext, Task, User } = require('../../models');
const dailyPlanService = require('../../modules/daily-plan/service');
const calendarFeedsService = require('../../modules/calendar-feeds/service');
const triageSettings = require('../../modules/triage/settings');
const { collectInput } = require('../../modules/triage/collect');
const { ruleItems } = require('../../modules/triage/core/items');
const contexts = require('../../modules/triage/contexts');

const TODAY = '2026-11-04'; // a Wednesday
const NOW = new Date('2026-11-04T06:30:00Z'); // 07:30 in Paris
const NEXT_DAY = '2026-11-05';
const NEXT_DAY_NOW = new Date('2026-11-05T06:30:00Z');
const WEDNESDAY_AFTER = '2026-11-11';
const WEDNESDAY_AFTER_NOW = new Date('2026-11-11T06:30:00Z');
const ICS_URL = 'https://calendar.example.test/memoire-fictive.ics';

// The calendar feed is read from this text instead of the network.
let mockIcsText = '';
jest.mock('../../modules/calendar-feeds/fetcher', () => {
    const actual = jest.requireActual('../../modules/calendar-feeds/fetcher');
    return { ...actual, fetchFeed: async () => mockIcsText };
});

const vevent = ({ uid, start, end, summary, rrule }) =>
    [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        'DTSTAMP:20261101T000000Z',
        `DTSTART;TZID=Europe/Paris:${start}`,
        `DTEND;TZID=Europe/Paris:${end}`,
        ...(rrule ? [`RRULE:${rrule}`] : []),
        `SUMMARY:${summary}`,
        'END:VEVENT',
    ].join('\r\n');

const calendarText = (...events) =>
    [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cadence test//FR',
        ...events,
        'END:VCALENDAR',
    ].join('\r\n');

// A meeting inside the focus hours of that Wednesday, and a weekly series on
// Wednesdays at 09:00, also inside the focus hours.
const MEETING = {
    uid: 'reunion-fictive@example.test',
    start: '20261104T100000',
    end: '20261104T110000',
    summary: 'Réunion fictive',
};
const SERIES = {
    uid: 'point-fictif@example.test',
    start: '20261104T090000',
    end: '20261104T091500',
    summary: 'Point fictif',
    rrule: 'FREQ=WEEKLY;BYDAY=WE',
};
const ICS = calendarText(vevent(MEETING), vevent(SERIES));

describe('triage questions and linked contexts', () => {
    let user;
    let other;
    let feedUid;
    let agent;
    let savedSecret;

    beforeAll(() => {
        savedSecret = process.env.TUDUDI_SESSION_SECRET;
        process.env.TUDUDI_SESSION_SECRET =
            'triage-contexts-test-session-secret';
    });

    afterAll(() => {
        if (savedSecret === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = savedSecret;
        }
    });

    const seriesRef = () => `series:${feedUid}:${SERIES.uid}`;

    const questions = async (date, now) => {
        const settings = await triageSettings.getTriageSettings(user);
        const input = await collectInput(user, settings, { today: date, now });
        return ruleItems(input, settings).filter((item) => item.question);
    };

    async function seed(owner) {
        const overdue = await Task.create({
            name: 'Relancer le devis fictif',
            user_id: owner.id,
            due_date: new Date('2026-11-02T12:00:00Z'),
        });
        const payment = await Task.create({
            name: 'Payer la facture fictive',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
        });
        const recurring = await Task.create({
            name: 'Revue hebdo fictive',
            user_id: owner.id,
            due_date: new Date('2026-11-04T12:00:00Z'),
            recurrence_type: 'weekly',
        });
        const feed = await calendarFeedsService.create(owner.id, {
            name: 'Agenda fictif',
            url: ICS_URL,
        });
        feedUid = feed.uid;
        await triageSettings.saveTriageSettings(owner, {
            calendarFeedUids: [feed.uid],
        });
        await dailyPlanService.saveFocusBlocks(owner, {
            blocks: [
                { days: [3], start: 540, end: 720, label: 'Focus fictif' },
            ],
        });
        return { overdue, payment, recurring };
    }

    let tasks;

    beforeEach(async () => {
        calendarFeedsService.clearCache();
        mockIcsText = ICS;
        user = await createTestUser({
            email: 'triage-contexts@example.com',
            timezone: 'Europe/Paris',
        });
        other = await createTestUser({
            email: 'triage-contexts-other@example.com',
            timezone: 'Europe/Paris',
        });
        tasks = await seed(user);
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'triage-contexts@example.com',
            password: 'password123',
        });
    });

    describe('answers and linked contexts', () => {
        it('answers a series question once, and it stays silent on later occurrences', async () => {
            const card = (await questions(TODAY, NOW)).find(
                (item) =>
                    item.question.target.scope === 'series' &&
                    item.question.target.ref === seriesRef()
            );
            expect(card).toBeDefined();

            const answered = await agent.post('/api/triage/answers').send({
                target: card.question.target,
                answer: 'yes',
            });
            expect(answered.status).toBe(200);
            expect(answered.body.context).toMatchObject({
                scope: 'series',
                target_ref: seriesRef(),
                text: 'Oui',
            });

            const later = await questions(WEDNESDAY_AFTER, WEDNESDAY_AFTER_NOW);
            expect(
                later.some((item) => item.question.target.ref === seriesRef())
            ).toBe(false);
        });

        it('keeps one context when the same answer is sent twice', async () => {
            const body = {
                target: { scope: 'task', ref: tasks.payment.uid },
                answer: 'Salle partagée fictive',
            };
            await agent.post('/api/triage/answers').send(body);
            const again = await agent.post('/api/triage/answers').send(body);
            expect(again.status).toBe(200);
            expect(
                await LinkedContext.count({ where: { user_id: user.id } })
            ).toBe(1);
        });

        it('keeps an event context until the end of the event day, then purges it', async () => {
            const card = (await questions(TODAY, NOW)).find(
                (item) => item.question.target.scope === 'event'
            );
            expect(card).toBeDefined();
            const eventRef = card.question.target.ref;

            await agent.post('/api/triage/answers').send({
                target: card.question.target,
                answer: 'no',
            });
            expect(
                (await questions(TODAY, NOW)).some(
                    (item) => item.question.target.ref === eventRef
                )
            ).toBe(false);

            const sameDay = await contexts.liveContexts(user, {
                now: new Date('2026-11-04T23:30:00+01:00'),
                timezone: 'Europe/Paris',
                today: TODAY,
                lookaheadDays: 7,
            });
            expect(sameDay.map((item) => item.target_ref)).toContain(eventRef);

            const nextDay = new Date('2026-11-05T00:30:00+01:00');
            const after = await contexts.liveContexts(user, {
                now: nextDay,
                timezone: 'Europe/Paris',
                today: NEXT_DAY,
                lookaheadDays: 7,
            });
            expect(after.map((item) => item.target_ref)).not.toContain(
                eventRef
            );

            await contexts.purgeContexts(nextDay);
            expect(
                await LinkedContext.count({ where: { user_id: user.id } })
            ).toBe(0);
        });

        it('drops a task context when the task closes, and a series context when recurrence is removed', async () => {
            await contexts.createContext(user, {
                scope: 'task',
                target_ref: tasks.payment.uid,
                text: 'Déjà réglé fictivement',
            });
            await contexts.createContext(user, {
                scope: 'series',
                target_ref: tasks.recurring.uid,
                text: 'Revue gardée fictive',
            });
            const day = {
                timezone: 'Europe/Paris',
                today: TODAY,
                lookaheadDays: 7,
            };
            expect(
                (await contexts.liveContexts(user, { now: NOW, ...day })).length
            ).toBe(2);

            await tasks.payment.update({
                status: Task.STATUS.DONE,
                completed_at: new Date('2026-11-04T08:00:00Z'),
            });
            await tasks.recurring.update({ recurrence_type: 'none' });

            expect(
                await contexts.liveContexts(user, { now: NOW, ...day })
            ).toEqual([]);
            await contexts.purgeContexts(NOW);
            expect(
                await LinkedContext.count({ where: { user_id: user.id } })
            ).toBe(0);
        });

        it('keeps a calendar series context after a time change, and drops it when the series is gone', async () => {
            await contexts.createContext(user, {
                scope: 'series',
                target_ref: seriesRef(),
                text: 'Salle partagée fictive',
            });
            const day = {
                now: NEXT_DAY_NOW,
                timezone: 'Europe/Paris',
                today: NEXT_DAY,
                lookaheadDays: 7,
            };

            mockIcsText = calendarText(
                vevent(MEETING),
                vevent({
                    ...SERIES,
                    start: '20261104T100000',
                    end: '20261104T101500',
                })
            );
            calendarFeedsService.clearCache();
            expect(await contexts.liveContexts(user, day)).toHaveLength(1);

            mockIcsText = calendarText(vevent(MEETING));
            calendarFeedsService.clearCache();
            expect(await contexts.liveContexts(user, day)).toEqual([]);
        });

        it('keeps a series context when its calendar cannot be read', async () => {
            await contexts.createContext(user, {
                scope: 'series',
                target_ref: seriesRef(),
                text: 'Salle partagée fictive',
            });
            mockIcsText = 'ce n’est pas un agenda';
            calendarFeedsService.clearCache();
            const live = await contexts.liveContexts(user, {
                now: NEXT_DAY_NOW,
                timezone: 'Europe/Paris',
                today: NEXT_DAY,
                lookaheadDays: 7,
            });
            expect(live).toHaveLength(1);
        });
    });

    describe('isolation and routes', () => {
        it("never shows, changes or deletes another user's context", async () => {
            const otherTask = await Task.create({
                name: 'Tâche fictive d’un autre',
                user_id: other.id,
            });
            const mine = await contexts.createContext(other, {
                scope: 'task',
                target_ref: otherTask.uid,
                text: 'Note fictive',
            });

            const list = await agent.get('/api/triage/contexts');
            expect(list.body.contexts).toEqual([]);

            const patched = await agent
                .patch(`/api/triage/contexts/${mine.uid}`)
                .send({ text: 'Changée' });
            const deleted = await agent.delete(
                `/api/triage/contexts/${mine.uid}`
            );
            expect([patched.status, deleted.status]).toEqual([404, 404]);

            await expect(
                contexts.createContext(user, {
                    scope: 'task',
                    target_ref: otherTask.uid,
                    text: 'Pas à moi',
                })
            ).rejects.toThrow();
            const answer = await agent.post('/api/triage/answers').send({
                target: { scope: 'task', ref: otherTask.uid },
                answer: 'yes',
            });
            expect(answer.status).toBe(400);
        });

        it("lists, edits and deletes the user's own contexts", async () => {
            const created = await contexts.createContext(user, {
                scope: 'task',
                target_ref: tasks.payment.uid,
                text: 'Premier texte',
            });

            const listed = await agent.get(
                `/api/triage/contexts?scope=task&target_ref=${tasks.payment.uid}`
            );
            expect(listed.body.contexts.map((item) => item.uid)).toEqual([
                created.uid,
            ]);

            const patched = await agent
                .patch(`/api/triage/contexts/${created.uid}`)
                .send({ text: '   ' });
            expect(patched.status).toBe(400);
            const edited = await agent
                .patch(`/api/triage/contexts/${created.uid}`)
                .send({ text: '  Texte modifié  ' });
            expect(edited.body.text).toBe('Texte modifié');

            const removed = await agent.delete(
                `/api/triage/contexts/${created.uid}`
            );
            expect(removed.status).toBe(204);
        });
    });

    describe('legacy answer path', () => {
        it('still takes an answer on the daily brief path of older Android apps', async () => {
            const res = await agent
                .post(`/api/daily-plan/${TODAY}/brief/answers`)
                .send({
                    question_key: 'question-fictive-3',
                    target: { scope: 'task', ref: tasks.payment.uid },
                    answer: 'yes',
                    idempotency_key: 'reponse-fictive-5',
                });
            expect(res.status).toBe(200);
            expect(res.body.context).toMatchObject({
                scope: 'task',
                target_ref: tasks.payment.uid,
                text: 'Oui',
            });
        });
    });

    describe('settings', () => {
        it('reads and saves the triage settings under the old brief key, keeping the rest', async () => {
            await User.update(
                {
                    ui_settings: {
                        brief: {
                            calendarFeedUids: [feedUid],
                            voice: { enabled: true },
                        },
                        theme: 'dark',
                    },
                },
                { where: { id: user.id } }
            );

            const read = await agent.get('/api/triage/settings');
            expect(read.status).toBe(200);
            expect(read.body).toEqual({
                ...triageSettings.DEFAULTS,
                calendarFeedUids: [feedUid],
            });

            const saved = await agent.put('/api/triage/settings').send({
                triage: { enabled: true },
                alerts: { disabled: ['postponed'] },
            });
            expect(saved.status).toBe(200);
            expect(saved.body.triage).toEqual({
                enabled: true,
                dailyLimit: 20,
            });
            expect(saved.body.alerts.disabled).toEqual(['postponed']);

            const stored = (await User.findByPk(user.id)).ui_settings;
            const parsed =
                typeof stored === 'string' ? JSON.parse(stored) : stored;
            expect(parsed.theme).toBe('dark');
            expect(parsed.brief.voice).toEqual({ enabled: true });
            expect(parsed.brief.calendarFeedUids).toEqual([feedUid]);
        });

        it('refuses an unknown or invalid setting', async () => {
            const unknown = await agent
                .put('/api/triage/settings')
                .send({ voice: { enabled: true } });
            expect(unknown.status).toBe(400);
            const invalid = await agent
                .put('/api/triage/settings')
                .send({ alerts: { disabled: ['overload'] } });
            expect(invalid.status).toBe(400);
        });
    });
});
