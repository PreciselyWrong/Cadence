import {
    MailDecision,
    MailOption,
    MailPayload,
    TriageItem,
} from '../../utils/triageService';

// Rules of the « Trier mes mails » deck (docs/43-mail-triage.md): one mail
// card at a time, one row of the agent's choices with its advice
// highlighted, the last decision held a moment so it can be undone.

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

// « 4 / 17 »: the card shown among all the mail cards of the deck.
export function deckProgress(
    items: TriageItem[],
    state: DeckState
): { position: number; total: number; done: number } {
    const total = items.filter((item) => item.type === 'mail').length;
    const done = Math.min(deckCards(items, state).length, total);
    const decided = total - done;
    return { position: Math.min(decided + 1, total), total, done: decided };
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

// A button of the deck: the agent's options; `reply` and `read` open the
// thread in Gmail.
export type DeckChoice = MailOption | 'read';

export interface DeckButton {
    choice: DeckChoice;
    decision: MailDecision;
    payload: Record<string, unknown>;
    opensMail: boolean;
    recommended: boolean;
}

const OPTIONS: readonly MailOption[] = [
    'draft',
    'reply',
    'task',
    'event',
    'later',
    'archive',
    'dismiss',
];
const MAX_BUTTONS = 5;

const taskPayload = (mail: MailPayload) => {
    const name = mail.suggestion?.task_name ?? mail.subject ?? mail.summary;
    const due = mail.suggestion?.due_date;
    return due ? { name, due_date: due } : { name };
};

const optionButton = (
    option: MailOption,
    mail: MailPayload
): Omit<DeckButton, 'recommended'> => {
    // A mail to read without its text in the card still opens in Gmail.
    const read =
        option === 'dismiss' &&
        mail.suggestion?.kind === 'read' &&
        !mail.excerpt &&
        mail.gmail_url.startsWith(GMAIL);
    return {
        choice: read ? 'read' : option,
        decision: option,
        payload: option === 'task' ? taskPayload(mail) : {},
        opensMail: option === 'reply' || read,
    };
};

// The agent's known options, without repeats; empty on a card proposed
// before the deck v2.
const cardOptions = (mail: MailPayload): MailOption[] => {
    const hasEvent = Boolean(mail.suggestion?.event?.start);
    const gmail = mail.gmail_url.startsWith(GMAIL);
    return (mail.options ?? []).filter(
        (option, index, list) =>
            OPTIONS.includes(option) &&
            list.indexOf(option) === index &&
            // An appointment without a start would be refused, and an
            // address outside Gmail is never opened.
            (option !== 'event' || hasEvent) &&
            (option !== 'reply' || gmail)
    );
};

// The buttons of a card, in the agent's order, its advice highlighted (none
// without one). A card without options (kept from before the deck v2) gets
// today's advice first, then the task, the reply in Gmail, later, dismiss.
export function deckButtons(mail: MailPayload): DeckButton[] {
    const options = cardOptions(mail).slice(0, MAX_BUTTONS);
    if (options.length > 0) {
        return options.map((option) => ({
            ...optionButton(option, mail),
            recommended: option === mail.recommended,
        }));
    }

    const advice = recommendation(mail);
    const first: DeckChoice =
        advice.decision === 'dismiss'
            ? 'read'
            : (advice.decision as DeckChoice);
    const buttons: DeckButton[] = [
        {
            choice: first,
            decision: advice.decision,
            payload: advice.payload,
            opensMail: advice.opensMail,
            recommended: true,
        },
    ];
    const add = (button: Omit<DeckButton, 'recommended'>) => {
        if (!buttons.some((entry) => entry.choice === button.choice)) {
            buttons.push({ ...button, recommended: false });
        }
    };
    add(optionButton('task', mail));
    if (mail.gmail_url.startsWith(GMAIL)) add(optionButton('reply', mail));
    add(optionButton('later', mail));
    add({
        ...optionButton('dismiss', mail),
        choice: 'dismiss',
        opensMail: false,
    });
    return buttons.slice(0, MAX_BUTTONS);
}
