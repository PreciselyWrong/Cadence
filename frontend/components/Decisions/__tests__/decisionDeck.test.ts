import { DecisionCard } from '../../../utils/decisionsService';
import {
    deckButtons,
    deckCards,
    deckProgress,
    deckReducer,
    initialDeck,
    isSafeDecisionUrl,
} from '../decisionDeck';

const makeCard = (
    uid: string,
    overrides: Partial<DecisionCard> = {}
): DecisionCard => ({
    uid,
    kind: 'subscription',
    kind_label: 'Abonnements',
    key: `key-${uid}`,
    title: `Title ${uid}`,
    context: null,
    body: null,
    url: null,
    choices: [
        { id: 'keep', label: 'Garder' },
        { id: 'cancel', label: 'Résilier', tone: 'danger' },
    ],
    recommended: 'keep',
    reason: null,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    ...overrides,
});

describe('decisionDeck', () => {
    describe('deckCards', () => {
        it('orders by kind (oldest card of each kind first), then oldest first inside a kind', () => {
            // API returns newest first
            const items = [
                makeCard('s-new', {
                    kind: 'subscription',
                    created_at: '2026-11-12T10:00:00Z',
                }),
                makeCard('f-only', {
                    kind: 'finance',
                    created_at: '2026-11-11T10:00:00Z',
                }),
                makeCard('d-new', {
                    kind: 'docker_update',
                    created_at: '2026-11-10T12:00:00Z',
                }),
                makeCard('d-old', {
                    kind: 'docker_update',
                    created_at: '2026-11-09T10:00:00Z',
                }),
                makeCard('s-old', {
                    kind: 'subscription',
                    created_at: '2026-11-08T10:00:00Z',
                }),
            ];

            // subscription oldest = Nov 8, docker_update oldest = Nov 9, finance = Nov 11
            expect(deckCards(items, initialDeck).map((c) => c.uid)).toEqual([
                's-old',
                's-new',
                'd-old',
                'd-new',
                'f-only',
            ]);
        });

        it('puts a front card first and skipped cards last in skip order', () => {
            const items = [
                makeCard('a', { created_at: '2026-11-01T10:00:00Z' }),
                makeCard('b', { created_at: '2026-11-02T10:00:00Z' }),
                makeCard('c', { created_at: '2026-11-03T10:00:00Z' }),
            ];
            let state = deckReducer(initialDeck, {
                type: 'skip',
                uid: 'a',
            }).state;
            state = deckReducer(state, { type: 'skip', uid: 'b' }).state;
            state = { ...state, front: 'c' };
            expect(deckCards(items, state).map((c) => c.uid)).toEqual([
                'c',
                'a',
                'b',
            ]);
        });
    });

    describe('deckButtons', () => {
        it('returns up to 5 choices in display order and marks recommended', () => {
            const card = makeCard('c1', {
                choices: [
                    { id: 'keep', label: 'Garder' },
                    { id: 'renegotiate', label: 'Renégocier', tone: 'primary' },
                    { id: 'cancel', label: 'Résilier', tone: 'danger' },
                ],
                recommended: 'renegotiate',
            });
            expect(deckButtons(card)).toEqual([
                { id: 'keep', label: 'Garder', recommended: false },
                {
                    id: 'renegotiate',
                    label: 'Renégocier',
                    tone: 'primary',
                    recommended: true,
                },
                {
                    id: 'cancel',
                    label: 'Résilier',
                    tone: 'danger',
                    recommended: false,
                },
            ]);
        });
    });

    describe('deckReducer & deckProgress', () => {
        it('holds the last decision, flushes the previous one, and supports undo/failed', () => {
            const items = [makeCard('a'), makeCard('b')];
            const step1 = deckReducer(initialDeck, {
                type: 'decide',
                held: { uid: 'a', decision: 'keep', idempotencyKey: 'k1' },
            });
            expect(step1.flush).toBeNull();
            expect(deckProgress(items, step1.state)).toEqual({
                position: 2,
                total: 2,
                done: 1,
            });

            const undone = deckReducer(step1.state, { type: 'undo' });
            expect(undone.state.held).toBeNull();
            expect(undone.state.front).toBe('a');
            expect(deckProgress(items, undone.state)).toEqual({
                position: 1,
                total: 2,
                done: 0,
            });

            const step2 = deckReducer(step1.state, {
                type: 'decide',
                held: { uid: 'b', decision: 'cancel', idempotencyKey: 'k2' },
            });
            expect(step2.flush).toEqual({
                uid: 'a',
                decision: 'keep',
                idempotencyKey: 'k1',
            });

            const failed = deckReducer(step2.state, {
                type: 'failed',
                uid: 'a',
            });
            expect(failed.state.front).toBe('a');
            expect(failed.state.gone).toEqual(['b']);
        });
    });

    describe('isSafeDecisionUrl', () => {
        it('accepts only https:// URLs', () => {
            expect(isSafeDecisionUrl('https://example.com/a')).toBe(true);
            expect(isSafeDecisionUrl('http://example.com/a')).toBe(false);
            expect(isSafeDecisionUrl('javascript:alert(1)')).toBe(false);
            expect(isSafeDecisionUrl(null)).toBe(false);
        });
    });
});
