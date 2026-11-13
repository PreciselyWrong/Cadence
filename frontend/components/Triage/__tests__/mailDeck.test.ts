import {
    deckCards,
    deckReducer,
    initialDeck,
    recommendation,
} from '../mailDeck';
import { MailPayload, TriageItem } from '../../../utils/triageService';

const payload = (fields: Partial<MailPayload> = {}): MailPayload => ({
    mail_uid: 'm1',
    account: 'perso',
    from_name: 'Alice',
    from_address: 'alice@example.com',
    subject: 'Devis cuisine',
    received_at: '2026-11-10T09:00:00Z',
    summary: 'Valider le devis',
    suggestion: null,
    draft_excerpt: null,
    gmail_url: 'https://mail.google.com/mail/u/0/#inbox/abc',
    ...fields,
});

const mailItem = (uid: string): TriageItem =>
    ({
        key: `mail:${uid}`,
        type: 'mail',
        source: 'mail',
        task_uid: null,
        action: 'decide_mail',
        payload: payload({ mail_uid: uid }),
        reason: 'x',
        details: [],
        question: null,
    }) as unknown as TriageItem;

const taskItem = {
    key: 'task:1',
    type: 'stale',
    task_uid: 't1',
} as unknown as TriageItem;

describe('mail deck › order', () => {
    it('keeps only mail cards, in the order of the queue', () => {
        const items = [mailItem('a'), taskItem, mailItem('b')];
        expect(deckCards(items, initialDeck).map((i) => i.key)).toEqual([
            'mail:a',
            'mail:b',
        ]);
    });

    it('puts a skipped card at the end and drops decided ones', () => {
        const items = [mailItem('a'), mailItem('b'), mailItem('c')];
        let state = deckReducer(initialDeck, {
            type: 'skip',
            key: 'mail:a',
        }).state;
        state = deckReducer(state, {
            type: 'decide',
            held: {
                key: 'mail:b',
                mailUid: 'b',
                decision: 'dismiss',
                payload: {},
                archive: false,
            },
        }).state;
        expect(deckCards(items, state).map((i) => i.key)).toEqual([
            'mail:c',
            'mail:a',
        ]);
    });
});

describe('mail deck › undo', () => {
    const held = (key: string) => ({
        key,
        mailUid: key.slice(5),
        decision: 'dismiss' as const,
        payload: {},
        archive: false,
    });

    it('holds the last decision and hands back the one before to be sent', () => {
        const first = deckReducer(initialDeck, {
            type: 'decide',
            held: held('mail:a'),
        });
        expect(first.flush).toBeNull();
        const second = deckReducer(first.state, {
            type: 'decide',
            held: held('mail:b'),
        });
        expect(second.flush?.key).toBe('mail:a');
        expect(second.state.held?.key).toBe('mail:b');
    });

    it('brings the last decided card back first, and only that one', () => {
        const items = [mailItem('a'), mailItem('b'), mailItem('c')];
        let state = deckReducer(initialDeck, {
            type: 'decide',
            held: held('mail:a'),
        }).state;
        state = deckReducer(state, {
            type: 'decide',
            held: held('mail:b'),
        }).state;
        state = deckReducer(state, { type: 'undo' }).state;
        expect(state.held).toBeNull();
        expect(deckCards(items, state).map((i) => i.key)).toEqual([
            'mail:b',
            'mail:c',
        ]);
        // Nothing left to undo: a second undo changes nothing.
        expect(deckReducer(state, { type: 'undo' }).state).toBe(state);
    });

    it('brings back first a card that had been skipped before', () => {
        const items = [mailItem('a'), mailItem('b')];
        let state = deckReducer(initialDeck, {
            type: 'skip',
            key: 'mail:a',
        }).state;
        state = deckReducer(state, {
            type: 'decide',
            held: held('mail:a'),
        }).state;
        state = deckReducer(state, { type: 'undo' }).state;
        expect(deckCards(items, state)[0].key).toBe('mail:a');
    });

    it('forgets the held decision once it is sent', () => {
        const state = deckReducer(initialDeck, {
            type: 'decide',
            held: held('mail:a'),
        }).state;
        expect(
            deckReducer(state, { type: 'sent', key: 'mail:a' }).state.held
        ).toBeNull();
        expect(
            deckReducer(state, { type: 'sent', key: 'mail:z' }).state.held?.key
        ).toBe('mail:a');
    });

    it('drops a card sent back as already settled elsewhere for good', () => {
        const items = [mailItem('a')];
        const state = deckReducer(initialDeck, {
            type: 'decide',
            held: held('mail:a'),
        }).state;
        const sent = deckReducer(state, { type: 'sent', key: 'mail:a' }).state;
        expect(deckCards(items, sent)).toEqual([]);
    });

    it('puts a card back when its decision failed', () => {
        const items = [mailItem('a'), mailItem('b')];
        let state = deckReducer(initialDeck, {
            type: 'decide',
            held: held('mail:a'),
        }).state;
        state = deckReducer(state, {
            type: 'decide',
            held: held('mail:b'),
        }).state;
        state = deckReducer(state, { type: 'failed', key: 'mail:a' }).state;
        expect(deckCards(items, state).map((i) => i.key)).toEqual(['mail:a']);
    });
});

describe('mail deck › recommendation', () => {
    it('creates the suggested task in one tap', () => {
        expect(
            recommendation(
                payload({
                    suggestion: {
                        kind: 'task',
                        task_name: 'Valider',
                        due_date: '2026-11-14',
                    },
                })
            )
        ).toEqual({
            decision: 'task',
            payload: { name: 'Valider', due_date: '2026-11-14' },
            opensMail: false,
        });
    });

    it('falls back to a task named after the subject without a suggestion', () => {
        expect(recommendation(payload())).toMatchObject({
            decision: 'task',
            payload: { name: 'Devis cuisine' },
        });
    });

    it('opens Gmail for a reply, and for a mail to read', () => {
        expect(
            recommendation(payload({ suggestion: { kind: 'reply' } }))
        ).toEqual({
            decision: 'reply',
            payload: {},
            opensMail: true,
        });
        expect(
            recommendation(payload({ suggestion: { kind: 'read' } }))
        ).toEqual({
            decision: 'dismiss',
            payload: {},
            opensMail: true,
        });
    });

    it('asks the agent for the appointment when the mail sets one', () => {
        const event = {
            title: 'Visite',
            start: '2026-11-20T14:00:00+01:00',
            end: null,
            all_day: false,
        };
        expect(
            recommendation(payload({ suggestion: { kind: 'event', event } }))
        ).toEqual({
            decision: 'event',
            payload: {},
            opensMail: false,
        });
    });

    it('never opens an address outside Gmail', () => {
        expect(
            recommendation(
                payload({
                    suggestion: { kind: 'reply' },
                    gmail_url: 'https://evil.example/',
                })
            ).decision
        ).toBe('task');
    });
});
