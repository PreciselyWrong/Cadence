'use strict';

// « N mails à trier » (docs/43-mail-triage.md): one notification once a burst
// of mail cards is over, replacing the unread one from the previous burst.
const { Notification, MailItem } = require('../../models');
const { toolsFor } = require('../../modules/triage/actions');
const { decide: decideMail } = require('../../modules/triage/mail');
const mailReady = require('../../modules/triage/mailReady');
const { createTestUser } = require('../helpers/testUtils');

const THREAD = '18c2f0a9b1d3e4f5';
const MINUTE = 60 * 1000;

const proposal = (fields = {}) => ({
    account: 'perso',
    thread_id: THREAD,
    from_name: 'Alice Martin',
    from_address: 'alice@example.com',
    subject: 'Devis cuisine',
    received_at: new Date(Date.now() - MINUTE).toISOString(),
    summary: 'Demande de valider le devis',
    gmail_url: `https://mail.google.com/mail/u/0/#inbox/${THREAD}`,
    ...fields,
});

const readyRows = (userId) =>
    Notification.findAll({
        where: { user_id: userId, type: 'mail_ready' },
        order: [['id', 'ASC']],
    });

describe('triage › mail ready notification', () => {
    let user;
    let run;

    const propose = async (fields) =>
        JSON.parse(
            (await run('propose_mail', proposal(fields))).content[0].text
        );

    beforeEach(async () => {
        jest.useFakeTimers({
            doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
        });
        user = await createTestUser({ email: 'mailready@example.com' });
        run = toolsFor(user);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('announces one card after two quiet minutes', async () => {
        await propose();
        jest.advanceTimersByTime(2 * MINUTE - 1);
        await mailReady.idle();
        expect(await readyRows(user.id)).toHaveLength(0);

        jest.advanceTimersByTime(1);
        await mailReady.idle();
        const rows = await readyRows(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            title: '1 mail à trier',
            level: 'info',
            sources: ['desktop', 'mobile'],
            data: { kind: 'mail_ready', count: 1 },
        });
    });

    it('waits for the burst to end, then counts every card in it once', async () => {
        await propose({ thread_id: 'thread-a' });
        jest.advanceTimersByTime(MINUTE);
        await propose({ thread_id: 'thread-b' });
        jest.advanceTimersByTime(MINUTE);
        await propose({ thread_id: 'thread-c' });

        jest.advanceTimersByTime(2 * MINUTE - 1);
        await mailReady.idle();
        expect(await readyRows(user.id)).toHaveLength(0);

        jest.advanceTimersByTime(1);
        await mailReady.idle();
        const rows = await readyRows(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            title: '3 mails à trier',
            data: { kind: 'mail_ready', count: 3 },
        });
    });

    it('replaces the unread notification of the previous burst', async () => {
        await propose({ thread_id: 'thread-a' });
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();
        await propose({ thread_id: 'thread-b' });
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();

        const rows = await readyRows(user.id);
        const unread = rows.filter(
            (row) => row.read_at === null && row.dismissed_at === null
        );
        expect(unread).toHaveLength(1);
        expect(unread[0].title).toBe('2 mails à trier');
        expect(rows).toHaveLength(2);
    });

    it('announces nothing when no card waits any more', async () => {
        const { mail_uid: uid } = await propose();
        await decideMail(user, uid, { decision: 'dismiss' });
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();
        expect(await readyRows(user.id)).toHaveLength(0);
    });

    it('announces a card reopened by a newer message', async () => {
        const { mail_uid: uid } = await propose();
        await decideMail(user, uid, { decision: 'dismiss' });
        await propose({
            received_at: new Date(Date.now() + MINUTE).toISOString(),
        });
        expect((await MailItem.findOne({ where: { uid } })).status).toBe(
            'pending'
        );
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();
        expect(await readyRows(user.id)).toHaveLength(1);
    });

    it('does not announce a card that only updates a waiting one', async () => {
        await propose();
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();
        await propose({ summary: 'Relance : le devis expire vendredi' });
        jest.advanceTimersByTime(2 * MINUTE);
        await mailReady.idle();
        expect(await readyRows(user.id)).toHaveLength(1);
    });
});
