'use strict';

// The brief's memory end to end on the database: decisions and their
// idempotency, refused and ignored proposals, answers that become linked
// contexts, context lifetimes, feedback, retention and isolation between users.
// Names, addresses and calendars are fictitious.
const request = require('supertest');
const app = require('../../app');
const { createTestUser } = require('../helpers/testUtils');
const {
    BriefProposal,
    DailyPlan,
    DailyPlanItem,
    LinkedContext,
    Task,
} = require('../../models');
const dailyPlanService = require('../../modules/daily-plan/service');
const briefService = require('../../modules/daily-plan/brief/service');
const calendarFeedsService = require('../../modules/calendar-feeds/service');
const { generateBrief } = require('../../modules/daily-plan/brief/generate');
const decisions = require('../../modules/daily-plan/brief/decisions');
const contexts = require('../../modules/daily-plan/brief/contexts');
const { purgeBriefMemory } = require('../../modules/daily-plan/brief/job');

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

describe('daily brief memory', () => {
    let user;
    let other;
    let feedUid;
    let agent;
    let savedSecret;

    beforeAll(() => {
        savedSecret = process.env.TUDUDI_SESSION_SECRET;
        process.env.TUDUDI_SESSION_SECRET = 'brief-memory-test-session-secret';
    });

    afterAll(() => {
        if (savedSecret === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = savedSecret;
        }
    });

    const seriesRef = () => `series:${feedUid}:${SERIES.uid}`;

    const generate = async (date, now) =>
        (await generateBrief(user, date, { reason: 'manual', now })).brief;

    async function seed(owner) {
        const overdue = await Task.create({
            name: 'Relancer le devis fictif',
            user_id: owner.id,
            due_date: new Date('2026-11-02T12:00:00Z'),
            estimated_minutes: 20,
        });
        const planDay = await DailyPlan.create({
            user_id: owner.id,
            plan_date: TODAY,
        });
        await DailyPlanItem.create({
            daily_plan_id: planDay.id,
            task_id: overdue.id,
            position: 0,
            duration_minutes: 20,
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
        await briefService.saveBriefSettings(owner, {
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
            email: 'brief-memory@example.com',
            timezone: 'Europe/Paris',
        });
        other = await createTestUser({
            email: 'brief-memory-other@example.com',
            timezone: 'Europe/Paris',
        });
        tasks = await seed(user);
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'brief-memory@example.com',
            password: 'password123',
        });
    });

    describe('decisions', () => {
        it('stores a decision once per idempotency key', async () => {
            const body = {
                kind: 'feedback',
                target_type: 'card',
                target_ref: 'card-fictive-1',
                proposal: { card_type: 'conflict', vote: 'useful' },
                decision: 'accepted',
                idempotency_key: 'vote-fictif-1',
            };
            const first = await agent
                .post(`/api/daily-plan/${TODAY}/brief/decisions`)
                .send(body);
            const again = await agent
                .post(`/api/daily-plan/${TODAY}/brief/decisions`)
                .send(body);
            expect(first.status).toBe(200);
            expect(again.body.uid).toBe(first.body.uid);
            expect(
                await BriefProposal.count({ where: { user_id: user.id } })
            ).toBe(1);
        });

        it('refuses a decision without an idempotency key or an unknown decision', async () => {
            const noKey = await agent
                .post(`/api/daily-plan/${TODAY}/brief/decisions`)
                .send({
                    kind: 'feedback',
                    target_type: 'card',
                    target_ref: 'card-fictive-2',
                    proposal: { card_type: 'conflict', vote: 'noise' },
                    decision: 'accepted',
                });
            const pending = await agent
                .post(`/api/daily-plan/${TODAY}/brief/decisions`)
                .send({
                    kind: 'move',
                    target_type: 'task',
                    target_ref: tasks.overdue.uid,
                    decision: 'pending',
                    idempotency_key: 'k-fictive-3',
                });
            expect(noKey.status).toBe(400);
            expect(pending.status).toBe(400);
        });

        it('refuses a date in a refused move, then does not propose it again', async () => {
            const first = await generate(TODAY, NOW);
            const move = first.moves.find(
                (item) => item.task_uid === tasks.overdue.uid
            );
            expect(move.to).toBe(NEXT_DAY);

            const refused = await agent
                .post(`/api/daily-plan/${TODAY}/brief/decisions`)
                .send({
                    kind: 'move',
                    target_type: 'task',
                    target_ref: tasks.overdue.uid,
                    proposal: { from: move.from, to: move.to },
                    fingerprint: move.proposal_key,
                    decision: 'refused',
                    idempotency_key: 'refuse-fictif-1',
                });
            expect(refused.status).toBe(200);
            // The proposal shown as pending became the decision: one row.
            expect(
                await BriefProposal.count({
                    where: { user_id: user.id, fingerprint: move.proposal_key },
                })
            ).toBe(1);

            const regenerated = await generate(TODAY, NOW);
            const next = regenerated.moves.find(
                (item) => item.task_uid === tasks.overdue.uid
            );
            expect(next?.to).not.toBe(NEXT_DAY);
            expect(next?.to).toBe('2026-11-06');
        });

        it('marks a proposal left unanswered as ignored, and does not repeat it identically', async () => {
            const shown = await generate(TODAY, NOW);
            const move = shown.moves.find(
                (item) => item.task_uid === tasks.overdue.uid
            );
            expect(move.to).toBe(NEXT_DAY);

            const next = await generate(NEXT_DAY, NEXT_DAY_NOW);
            const ignored = await BriefProposal.findOne({
                where: { user_id: user.id, fingerprint: move.proposal_key },
            });
            expect(ignored.decision).toBe('ignored');

            const repeated = next.moves.find(
                (item) => item.task_uid === tasks.overdue.uid
            );
            expect(repeated?.to).toBe('2026-11-06');
        });

        it('purges decisions past their retention and keeps the recent ones', async () => {
            await briefService.saveBriefSettings(user, {
                retention: { decisionsDays: 30 },
            });
            const old = new Date(NOW.getTime() - 40 * 86400000);
            const aged = await BriefProposal.create({
                user_id: user.id,
                brief_date: '2026-09-25',
                kind: 'feedback',
                target_type: 'card',
                target_ref: 'card-ancien',
                proposal: { card_type: 'conflict', vote: 'noise' },
                decision: 'accepted',
                idempotency_key: 'ancien-fictif',
            });
            // Sequelize stamps created_at itself, so the age is set in SQL.
            await BriefProposal.sequelize.query(
                'UPDATE brief_proposals SET created_at = ? WHERE id = ?',
                { replacements: [old, aged.id] }
            );
            await decisions.recordDecision(user, {
                brief_date: TODAY,
                kind: 'feedback',
                target_type: 'card',
                target_ref: 'card-recent',
                proposal: { card_type: 'conflict', vote: 'useful' },
                decision: 'accepted',
                idempotency_key: 'recent-fictif',
            });

            const result = await purgeBriefMemory({ now: NOW });
            expect(result.decisions).toBe(1);
            const left = await BriefProposal.findAll({
                where: { user_id: user.id },
                attributes: ['idempotency_key'],
            });
            expect(left.map((row) => row.idempotency_key)).toEqual([
                'recent-fictif',
            ]);
        });

        it('drops a noisy card type from the next brief', async () => {
            const before = await generate(TODAY, NOW);
            expect(
                before.anticipate.some(
                    (card) => card.type === 'event_in_work_hours'
                )
            ).toBe(true);

            for (const index of [1, 2, 3]) {
                await decisions.recordDecision(user, {
                    brief_date: TODAY,
                    kind: 'feedback',
                    target_type: 'card',
                    target_ref: `card-bruit-${index}`,
                    proposal: {
                        card_type: 'event_in_work_hours',
                        vote: 'noise',
                    },
                    decision: 'accepted',
                    idempotency_key: `bruit-fictif-${index}`,
                });
            }

            const after = await generate(TODAY, NOW);
            expect(
                after.anticipate.some(
                    (card) => card.type === 'event_in_work_hours'
                )
            ).toBe(false);
        });
    });

    describe('answers and linked contexts', () => {
        it('answers a series question once, and it stays silent on later occurrences', async () => {
            const first = await generate(TODAY, NOW);
            const card = first.anticipate.find(
                (item) =>
                    item.question?.target?.scope === 'series' &&
                    item.question.target.ref === seriesRef()
            );
            expect(card).toBeDefined();

            const answered = await agent
                .post(`/api/daily-plan/${TODAY}/brief/answers`)
                .send({
                    question_key: card.question.key,
                    target: card.question.target,
                    answer: 'yes',
                    idempotency_key: 'reponse-fictive-1',
                });
            expect(answered.status).toBe(200);
            expect(answered.body.context).toMatchObject({
                scope: 'series',
                target_ref: seriesRef(),
                text: 'Oui',
            });
            expect(answered.body.decision).toMatchObject({
                kind: 'question',
                decision: 'accepted',
            });

            const later = await generate(WEDNESDAY_AFTER, WEDNESDAY_AFTER_NOW);
            expect(
                later.anticipate.some(
                    (item) => item.question?.target?.ref === seriesRef()
                )
            ).toBe(false);
        });

        it('records one answer and one context for a repeated idempotency key', async () => {
            const body = {
                question_key: 'question-fictive-1',
                target: { scope: 'task', ref: tasks.payment.uid },
                answer: 'Salle partagée fictive',
                idempotency_key: 'reponse-fictive-2',
            };
            await agent
                .post(`/api/daily-plan/${TODAY}/brief/answers`)
                .send(body);
            const again = await agent
                .post(`/api/daily-plan/${TODAY}/brief/answers`)
                .send(body);
            expect(again.status).toBe(200);
            expect(
                await BriefProposal.count({
                    where: { user_id: user.id, kind: 'question' },
                })
            ).toBe(1);
            expect(
                await LinkedContext.count({ where: { user_id: user.id } })
            ).toBe(1);
        });

        it('keeps an event context until the end of the event day, then purges it', async () => {
            const first = await generate(TODAY, NOW);
            const card = first.anticipate.find(
                (item) => item.question?.target?.scope === 'event'
            );
            expect(card).toBeDefined();
            const eventRef = card.question.target.ref;

            await agent.post(`/api/daily-plan/${TODAY}/brief/answers`).send({
                question_key: card.question.key,
                target: card.question.target,
                answer: 'no',
                idempotency_key: 'reponse-fictive-3',
            });
            const again = await generate(TODAY, NOW);
            expect(
                again.anticipate.some(
                    (item) => item.question?.target?.ref === eventRef
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

            await purgeBriefMemory({ now: nextDay });
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
            await purgeBriefMemory({ now: NOW });
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

            const list = await agent.get('/api/daily-plan/brief/contexts');
            expect(list.body.contexts).toEqual([]);

            const patched = await agent
                .patch(`/api/daily-plan/brief/contexts/${mine.uid}`)
                .send({ text: 'Changée' });
            const deleted = await agent.delete(
                `/api/daily-plan/brief/contexts/${mine.uid}`
            );
            expect([patched.status, deleted.status]).toEqual([404, 404]);

            await expect(
                contexts.createContext(user, {
                    scope: 'task',
                    target_ref: otherTask.uid,
                    text: 'Pas à moi',
                })
            ).rejects.toThrow();
            const answer = await agent
                .post(`/api/daily-plan/${TODAY}/brief/answers`)
                .send({
                    question_key: 'question-fictive-2',
                    target: { scope: 'task', ref: otherTask.uid },
                    answer: 'yes',
                    idempotency_key: 'reponse-fictive-4',
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
                `/api/daily-plan/brief/contexts?scope=task&target_ref=${tasks.payment.uid}`
            );
            expect(listed.body.contexts.map((item) => item.uid)).toEqual([
                created.uid,
            ]);

            const patched = await agent
                .patch(`/api/daily-plan/brief/contexts/${created.uid}`)
                .send({ text: '   ' });
            expect(patched.status).toBe(400);
            const edited = await agent
                .patch(`/api/daily-plan/brief/contexts/${created.uid}`)
                .send({ text: '  Texte modifié  ' });
            expect(edited.body.text).toBe('Texte modifié');

            const removed = await agent.delete(
                `/api/daily-plan/brief/contexts/${created.uid}`
            );
            expect(removed.status).toBe(204);
        });
    });
});
