import {
    MailDecision,
    MailPayload,
    TriageItem,
} from '../../utils/triageService';

// Rules of the « Trier mes mails » deck (docs/43-mail-triage.md): one mail
// card at a time, the agent's advice as the main button, the last decision
// held a moment so it can be undone.

// The server only keeps Gmail addresses; checked again before one is opened.
export const GMAIL = 'https://mail.google.com/';

export interface HeldDecision {
    key: string;
    mailUid: string;
    decision: MailDecision;
    payload: Record<string, unknown>;
    archive: boolean;
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
    | { type: 'skip'; key: string }
    | { type: 'sent'; key: string }
    | { type: 'failed'; key: string };

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

const without = (list: string[], key: string) =>
    list.filter((entry) => entry !== key);

export function deckReducer(state: DeckState, action: DeckAction): DeckStep {
    switch (action.type) {
        case 'decide': {
            const { key } = action.held;
            return {
                state: {
                    ...state,
                    gone: [...without(state.gone, key), key],
                    held: action.held,
                    front: state.front === key ? null : state.front,
                },
                flush: state.held,
            };
        }
        case 'undo': {
            if (!state.held) return { state, flush: null };
            const { key } = state.held;
            return {
                state: {
                    ...state,
                    gone: without(state.gone, key),
                    held: null,
                    front: key,
                },
                flush: null,
            };
        }
        case 'skip':
            return {
                state: {
                    ...state,
                    skipped: [
                        ...without(state.skipped, action.key),
                        action.key,
                    ],
                    front: state.front === action.key ? null : state.front,
                },
                flush: null,
            };
        case 'sent':
            return {
                state:
                    state.held?.key === action.key
                        ? { ...state, held: null }
                        : state,
                flush: null,
            };
        case 'failed':
            return {
                state: {
                    ...state,
                    gone: without(state.gone, action.key),
                    held: state.held?.key === action.key ? null : state.held,
                    front: action.key,
                },
                flush: null,
            };
        default:
            return { state, flush: null };
    }
}

// The mail cards still to decide: the queue's order, a card brought back
// first, skipped ones last.
export function deckCards(items: TriageItem[], state: DeckState): TriageItem[] {
    const rank = (key: string) =>
        key === state.front ? -2 : state.skipped.indexOf(key);
    return items
        .filter(
            (item) => item.type === 'mail' && !state.gone.includes(item.key)
        )
        .map((item, index) => ({ item, index }))
        .sort(
            (a, b) => rank(a.item.key) - rank(b.item.key) || a.index - b.index
        )
        .map(({ item }) => item);
}

export interface Recommendation {
    decision: MailDecision;
    payload: Record<string, unknown>;
    // The button also opens the thread in Gmail
    opensMail: boolean;
}

// What the main button does: the agent's advice, done in one tap. A mail to
// read opens in Gmail and leaves the deck; without advice, the task.
export function recommendation(mail: MailPayload): Recommendation {
    const kind = mail.suggestion?.kind;
    const gmail = mail.gmail_url.startsWith(GMAIL);
    if (kind === 'reply' && gmail) {
        return { decision: 'reply', payload: {}, opensMail: true };
    }
    if (kind === 'read' && gmail) {
        return { decision: 'dismiss', payload: {}, opensMail: true };
    }
    if (kind === 'event' && mail.suggestion?.event?.start) {
        return { decision: 'event', payload: {}, opensMail: false };
    }
    const name = mail.suggestion?.task_name ?? mail.subject ?? mail.summary;
    const due = mail.suggestion?.due_date;
    return {
        decision: 'task',
        payload: due ? { name, due_date: due } : { name },
        opensMail: false,
    };
}
