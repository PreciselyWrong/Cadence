import { DecisionCard, DecisionChoice } from '../../utils/decisionsService';

// Pure rules of the agent decisions deck (docs/49-agent-decisions.md):
// one card at a time, ordered by kind (oldest card's kind first), then oldest
// first; the last decision is held a moment so « Annuler » can take it back.

export const MAX_BUTTONS = 5;

export const isSafeDecisionUrl = (url?: string | null): url is string =>
    typeof url === 'string' && url.startsWith('https://');

export interface HeldDecision {
    uid: string;
    decision: string;
    note?: string;
    until?: string;
    idempotencyKey: string;
}

export interface DeckState {
    // Decided cards, held or sent
    gone: string[];
    // Skipped cards, in the order they were skipped: they come back last
    skipped: string[];
    // The last decision, not sent yet: the one « Annuler » takes back
    held: HeldDecision | null;
    // A card brought back by « Annuler » or a failure: shown first
    front: string | null;
}

export type DeckAction =
    | { type: 'decide'; held: HeldDecision }
    | { type: 'undo' }
    | { type: 'skip'; uid: string }
    | { type: 'sent'; uid: string }
    | { type: 'failed'; uid: string };

export interface DeckStep {
    state: DeckState;
    // A decision that can no longer be undone: send it now
    flush: HeldDecision | null;
}

export const initialDeck: DeckState = {
    gone: [],
    skipped: [],
    held: null,
    front: null,
};

const without = (list: string[], uid: string) =>
    list.filter((entry) => entry !== uid);

export function deckReducer(state: DeckState, action: DeckAction): DeckStep {
    switch (action.type) {
        case 'decide': {
            const { uid } = action.held;
            return {
                state: {
                    ...state,
                    gone: [...without(state.gone, uid), uid],
                    held: action.held,
                    front: state.front === uid ? null : state.front,
                },
                flush: state.held,
            };
        }
        case 'undo': {
            if (!state.held) return { state, flush: null };
            const { uid } = state.held;
            return {
                state: {
                    ...state,
                    gone: without(state.gone, uid),
                    held: null,
                    front: uid,
                },
                flush: null,
            };
        }
        case 'skip':
            return {
                state: {
                    ...state,
                    skipped: [
                        ...without(state.skipped, action.uid),
                        action.uid,
                    ],
                    front: state.front === action.uid ? null : state.front,
                },
                flush: null,
            };
        case 'sent':
            return {
                state:
                    state.held?.uid === action.uid
                        ? { ...state, held: null }
                        : state,
                flush: null,
            };
        case 'failed':
            return {
                state: {
                    ...state,
                    gone: without(state.gone, action.uid),
                    held: state.held?.uid === action.uid ? null : state.held,
                    front: action.uid,
                },
                flush: null,
            };
        default:
            return { state, flush: null };
    }
}

const createdTime = (card: DecisionCard): number => {
    const parsed = Date.parse(card.created_at);
    return Number.isNaN(parsed) ? 0 : parsed;
};

// Kinds are ordered by their oldest card; cards inside a kind are oldest first.
// A card brought back by undo or failure goes first; skipped cards go last.
export function deckCards(
    items: DecisionCard[],
    state: DeckState
): DecisionCard[] {
    const kindOldest = new Map<string, number>();
    for (const card of items) {
        const time = createdTime(card);
        const prev = kindOldest.get(card.kind);
        if (prev === undefined || time < prev) {
            kindOldest.set(card.kind, time);
        }
    }

    const rank = (uid: string) =>
        uid === state.front ? -2 : state.skipped.indexOf(uid);

    return items
        .filter((card) => !state.gone.includes(card.uid))
        .map((card, index) => ({ card, index, time: createdTime(card) }))
        .sort((a, b) => {
            const r = rank(a.card.uid) - rank(b.card.uid);
            if (r !== 0) return r;
            const kindDiff =
                (kindOldest.get(a.card.kind) ?? 0) -
                (kindOldest.get(b.card.kind) ?? 0);
            if (kindDiff !== 0) return kindDiff;
            if (a.card.kind !== b.card.kind) {
                return a.card.kind.localeCompare(b.card.kind);
            }
            return a.time - b.time || a.index - b.index;
        })
        .map(({ card }) => card);
}

export function deckProgress(
    items: DecisionCard[],
    state: DeckState
): { position: number; total: number; done: number } {
    const total = items.length;
    const remaining = Math.min(deckCards(items, state).length, total);
    const decided = total - remaining;
    return { position: Math.min(decided + 1, total), total, done: decided };
}

export interface DecisionDeckButton extends DecisionChoice {
    recommended: boolean;
}

export function deckButtons(card: DecisionCard): DecisionDeckButton[] {
    return (card.choices ?? []).slice(0, MAX_BUTTONS).map((choice) => ({
        ...choice,
        recommended: choice.id === card.recommended,
    }));
}
