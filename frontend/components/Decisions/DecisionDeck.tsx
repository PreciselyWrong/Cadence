import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import {
    decideDecision,
    DecisionCard,
    fetchDecisions,
} from '../../utils/decisionsService';
import { OfflineQueuedError } from '../../utils/authUtils';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import {
    DeckAction,
    deckButtons,
    deckCards,
    DecisionDeckButton,
    deckProgress,
    deckReducer,
    DeckState,
    HeldDecision,
    initialDeck,
    isSafeDecisionUrl,
} from './decisionDeck';

// How long « Annuler » can take the last decision back before it is sent.
const UNDO_MS = 5000;
const LEAVE_MS = 180;
// Past this, the card's body starts folded under « Lire la suite ».
const LONG_BODY = 420;
const LONG_BODY_LINES = 7;
const NOTE_MAX = 500;

type Phase = 'in' | 'right' | 'left' | 'down' | 'enter';
const PHASE_CLASS: Record<Phase, string> = {
    in: 'translate-x-0 translate-y-0 opacity-100',
    right: 'translate-x-16 opacity-0',
    left: '-translate-x-16 opacity-0',
    down: 'translate-y-10 opacity-0',
    enter: 'translate-y-3 opacity-0',
};

const reducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const longText = (text: string) =>
    text.length > LONG_BODY || text.split('\n').length > LONG_BODY_LINES;

// Typing in the note never drives the deck.
const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const QUIET_LINK =
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-body-m font-medium hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]';

const newIdempotencyKey = () =>
    `decision:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const choiceButtonStyle = (button: DecisionDeckButton): string => {
    const danger = button.tone === 'danger';
    if (button.recommended && danger) {
        return 'bg-danger-container/60 text-danger ring-2 ring-inset ring-danger hover:bg-danger-container';
    }
    if (button.recommended) {
        return 'bg-primary/10 text-surface-on ring-2 ring-inset ring-primary hover:bg-primary/15';
    }
    if (danger) {
        return 'text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-container/60';
    }
    return 'text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high active:bg-surface-highest';
};

interface DecisionDeckProps {
    items?: DecisionCard[];
    // Receives the sending of the decision still held when the deck closed.
    onClose: (sent: Promise<void>) => void;
}

// Agent decisions deck (docs/49-agent-decisions.md): one card at a time,
// ordered by kind then oldest first; the last decision waits a moment so
// « Annuler » can take it back.
const DecisionDeck: React.FC<DecisionDeckProps> = ({
    items: initialItems,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [items, setItems] = useState<DecisionCard[]>(initialItems ?? []);
    const [loading, setLoading] = useState(initialItems === undefined);
    const [loadError, setLoadError] = useState(false);
    const [deck, setDeck] = useState<DeckState>(initialDeck);
    const deckRef = useRef(deck);
    const [phase, setPhase] = useState<Phase>('in');
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');
    const [bodyOpen, setBodyOpen] = useState(false);
    const busy = useRef(false);

    useEffect(() => {
        if (initialItems !== undefined) {
            setItems(initialItems);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(false);
        fetchDecisions()
            .then((data) => {
                if (!cancelled) {
                    setItems(data.items ?? []);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoadError(true);
                    setLoading(false);
                    showErrorToast(
                        t(
                            'decisions.deck.loadError',
                            'Les décisions n’ont pas pu être lues.'
                        )
                    );
                }
            });
        return () => {
            cancelled = true;
        };
        // Fetch once on mount when initialItems is not supplied.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialItems]);

    const send = useCallback(
        (held: HeldDecision): Promise<void> =>
            decideDecision(
                held.uid,
                held.decision,
                {
                    ...(held.note !== undefined ? { note: held.note } : {}),
                    ...(held.until !== undefined ? { until: held.until } : {}),
                },
                held.idempotencyKey
            )
                .then(() => undefined)
                .catch((error) => {
                    if (error instanceof OfflineQueuedError) return;
                    // Settled on another device meanwhile: nothing left to ask.
                    if ((error as { status?: number })?.status === 409) {
                        showErrorToast(
                            t('triage.alreadySettled', 'Déjà traité ailleurs.')
                        );
                        return;
                    }
                    step({ type: 'failed', uid: held.uid });
                    showErrorToast(
                        t('triage.actionError', 'Action impossible, réessayez.')
                    );
                }),
        // step is stable: it only touches refs and setters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [t, showErrorToast]
    );

    const step = (action: DeckAction) => {
        const { state, flush } = deckReducer(deckRef.current, action);
        deckRef.current = state;
        setDeck(state);
        if (flush) send(flush);
    };

    // Sends the held decision now: it can no longer be taken back.
    const release = (): Promise<void> => {
        const held = deckRef.current.held;
        if (!held) return Promise.resolve();
        step({ type: 'sent', uid: held.uid });
        return send(held);
    };

    useEffect(() => {
        if (!deck.held) return undefined;
        const timer = window.setTimeout(release, UNDO_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deck.held]);

    // Leaving the deck sends what is still held.
    const sendRef = useRef(send);
    sendRef.current = send;
    useEffect(
        () => () => {
            const held = deckRef.current.held;
            if (held) {
                deckRef.current = { ...deckRef.current, held: null };
                sendRef.current(held);
            }
        },
        []
    );

    // The next card comes in just after it is drawn.
    useEffect(() => {
        if (phase !== 'enter') return undefined;
        const timer = window.setTimeout(() => setPhase('in'), 20);
        return () => window.clearTimeout(timer);
    }, [phase]);

    const cards = deckCards(items, deck);
    const progress = deckProgress(items, deck);
    const card = cards[0];
    const buttons = card ? deckButtons(card) : [];
    const advised = buttons.find((button) => button.recommended);
    const safeUrl = isSafeDecisionUrl(card?.url) ? card.url : null;

    const leave = (direction: Phase, then: () => void) => {
        if (busy.current) return;
        busy.current = true;
        const finish = () => {
            then();
            setNoteOpen(false);
            setNote('');
            setBodyOpen(false);
            setPhase('enter');
            busy.current = false;
        };
        if (reducedMotion()) {
            finish();
            return;
        }
        setPhase(direction);
        window.setTimeout(finish, LEAVE_MS);
    };

    const decide = (
        decision: string,
        options: { note?: string; until?: string } = {},
        direction: Phase = decision === 'later' || decision === 'note'
            ? 'left'
            : 'right'
    ) => {
        if (!card) return;
        const held: HeldDecision = {
            uid: card.uid,
            decision,
            ...(options.note !== undefined ? { note: options.note } : {}),
            ...(options.until !== undefined ? { until: options.until } : {}),
            idempotencyKey: newIdempotencyKey(),
        };
        leave(direction, () => step({ type: 'decide', held }));
    };

    const choose = (button: DecisionDeckButton | undefined) => {
        if (!button) return;
        decide(button.id, {}, button.tone === 'danger' ? 'left' : 'right');
    };

    const sendNote = () => {
        const text = note.trim();
        if (text) decide('note', { note: text }, 'left');
    };

    const skip = () => {
        if (card) leave('down', () => step({ type: 'skip', uid: card.uid }));
    };

    const undo = () => {
        if (!deckRef.current.held || busy.current) return;
        setNoteOpen(false);
        step({ type: 'undo' });
    };

    const close = () => onClose(release());

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (noteOpen) setNoteOpen(false);
                else close();
                return;
            }
            if (typing(event.target)) return;
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'z'
            ) {
                event.preventDefault();
                undo();
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (!card) return;
            // A focused button keeps its own Enter.
            const onButton =
                event.target instanceof HTMLElement &&
                ['BUTTON', 'A'].includes(event.target.tagName);
            if (/^[1-5]$/.test(event.key)) {
                const button = buttons[Number(event.key) - 1];
                if (button) {
                    event.preventDefault();
                    choose(button);
                }
            } else if (
                (event.key === 'Enter' && !onButton) ||
                event.key === 'ArrowRight'
            ) {
                if (advised) {
                    event.preventDefault();
                    choose(advised);
                }
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                decide('later', {}, 'left');
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                skip();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const undoButton = (
        <Button variant="ghost" size="md" disabled={!deck.held} onClick={undo}>
            {t('decisions.deck.undo', 'Annuler')}
        </Button>
    );

    const statusText = (held: HeldDecision) => {
        if (held.decision === 'note') {
            return t('decisions.deck.noteSent', 'Renvoyé à l’agent');
        }
        if (held.decision === 'later') {
            return t('decisions.deck.postponed', 'Revient demain');
        }
        return t('decisions.deck.decided', 'Décision enregistrée');
    };

    const body = card?.body?.trim() || null;
    const folded = body ? longText(body) && !bodyOpen : false;
    const percent =
        progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('decisions.deck.title', 'Décisions')}
            data-testid="decision-deck"
            className="fixed inset-0 z-50 flex flex-col bg-surface text-surface-on"
        >
            <header className="flex items-center gap-3 px-6 pb-2 pt-4 max-sm:px-4">
                <h1 className="text-title-m font-semibold">
                    {t('decisions.deck.title', 'Décisions')}
                </h1>
                {progress.total > 0 && (
                    <span
                        className="text-body-m tabular-nums text-surface-on-variant"
                        data-testid="decision-deck-progress"
                    >
                        {progress.position} / {progress.total}
                    </span>
                )}
                <span className="flex-1" />
                <IconButton
                    label={t('decisions.deck.close', 'Fermer')}
                    onClick={close}
                >
                    <XMarkIcon />
                </IconButton>
            </header>
            <div
                role="progressbar"
                aria-label={t(
                    'decisions.deck.progressLabel',
                    'Décision {{position}} sur {{total}}',
                    progress
                )}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="mx-6 h-0.5 overflow-hidden rounded-full bg-outline-variant/40 max-sm:mx-4"
            >
                <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${percent}%` }}
                />
            </div>

            <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 pb-6 pt-4 max-sm:px-4 sm:items-center">
                {loading ? (
                    <p className="text-body-m text-surface-on-variant">
                        {t('common.loading', 'Loading...')}
                    </p>
                ) : loadError ? (
                    <div className="text-center">
                        <p className="text-body text-danger">
                            {t(
                                'decisions.deck.loadError',
                                'Les décisions n’ont pas pu être lues.'
                            )}
                        </p>
                        <div className="mt-4 flex justify-center">
                            <Button variant="primary" size="md" onClick={close}>
                                {t(
                                    'decisions.deck.back',
                                    'Retour à « À trier »'
                                )}
                            </Button>
                        </div>
                    </div>
                ) : !card || buttons.length === 0 ? (
                    <div
                        className="text-center"
                        data-testid="decision-deck-done"
                    >
                        <p className="text-title-m font-semibold">
                            {t('decisions.deck.done', 'Tout est décidé')}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {deck.held && undoButton}
                            <Button variant="primary" size="md" onClick={close}>
                                {t(
                                    'decisions.deck.back',
                                    'Retour à « À trier »'
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <article
                        key={card.uid}
                        data-testid="decision-deck-card"
                        className={`w-full max-w-xl rounded-2xl bg-surface-low p-6 shadow-sm ring-1 ring-inset ring-outline-variant/60 transition-all duration-200 ease-out motion-reduce:transition-none max-sm:p-4 ${PHASE_CLASS[phase]}`}
                    >
                        <p className="text-label-m font-medium uppercase tracking-wide text-surface-on-variant">
                            {card.kind_label}
                        </p>
                        <h2 className="mt-1 text-title font-semibold text-surface-on">
                            {card.title}
                        </h2>
                        {card.context && (
                            <p className="mt-2 text-body text-surface-on">
                                {card.context}
                            </p>
                        )}
                        {body && (
                            <div className="mt-4 rounded-xl bg-surface px-4 py-3">
                                <p
                                    data-testid="decision-deck-body"
                                    className={`whitespace-pre-line break-words text-body-m text-surface-on ${folded ? 'line-clamp-[7]' : ''}`}
                                >
                                    {body}
                                </p>
                                {longText(body) && (
                                    <button
                                        type="button"
                                        aria-expanded={bodyOpen}
                                        onClick={() =>
                                            setBodyOpen((open) => !open)
                                        }
                                        className="-mx-1 mt-1 rounded px-1 text-body-m font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]"
                                    >
                                        {bodyOpen
                                            ? t(
                                                  'decisions.deck.collapse',
                                                  'Réduire'
                                              )
                                            : t(
                                                  'decisions.deck.readMore',
                                                  'Lire la suite'
                                              )}
                                    </button>
                                )}
                            </div>
                        )}
                        {safeUrl && (
                            <a
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${QUIET_LINK} -ml-3 mt-2 text-primary`}
                            >
                                {t('decisions.deck.openUrl', 'Ouvrir')}
                                <ArrowTopRightOnSquareIcon
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </a>
                        )}

                        <div
                            className="mt-5 grid gap-2 max-sm:gap-1.5"
                            style={{
                                gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))`,
                            }}
                        >
                            {buttons.map((button, index) => (
                                <button
                                    key={button.id}
                                    type="button"
                                    data-choice={button.id}
                                    data-recommended={
                                        button.recommended || undefined
                                    }
                                    data-tone={button.tone}
                                    aria-keyshortcuts={String(index + 1)}
                                    onClick={() => choose(button)}
                                    className={`relative flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-low max-sm:min-h-[64px] max-sm:px-1 ${choiceButtonStyle(button)}`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="absolute left-2 top-1.5 text-label-m tabular-nums text-surface-on-variant/70 max-sm:hidden"
                                    >
                                        {index + 1}
                                    </span>
                                    <span className="max-w-full truncate text-label font-medium max-sm:text-label-m">
                                        {button.label}
                                    </span>
                                    {button.recommended && (
                                        <span className="sr-only">
                                            {t(
                                                'decisions.deck.recommended',
                                                'Conseillé'
                                            )}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        {card.reason && (
                            <p className="mt-2 text-body-m text-surface-on-variant">
                                {card.reason}
                            </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-1">
                            <Button
                                variant="ghost"
                                size="md"
                                aria-expanded={noteOpen}
                                onClick={() => setNoteOpen((open) => !open)}
                            >
                                {t(
                                    'decisions.deck.noteOpen',
                                    'Répondre par un mot'
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="md"
                                onClick={() => decide('later', {}, 'left')}
                            >
                                {t('decisions.deck.later', 'Plus tard')}
                            </Button>
                            <span className="flex-1" />
                            <Button variant="ghost" size="md" onClick={skip}>
                                {t('decisions.deck.skip', 'Passer')}
                            </Button>
                            {undoButton}
                        </div>

                        {noteOpen && (
                            <form
                                className="mt-2 flex items-end gap-2"
                                onSubmit={(formEvent) => {
                                    formEvent.preventDefault();
                                    sendNote();
                                }}
                            >
                                <textarea
                                    autoFocus
                                    rows={2}
                                    maxLength={NOTE_MAX}
                                    value={note}
                                    aria-label={t(
                                        'decisions.deck.noteOpen',
                                        'Répondre par un mot'
                                    )}
                                    placeholder={t(
                                        'decisions.deck.notePlaceholder',
                                        'Un mot pour l’agent'
                                    )}
                                    onChange={(changeEvent) =>
                                        setNote(changeEvent.target.value)
                                    }
                                    onKeyDown={(keyEvent) => {
                                        if (
                                            keyEvent.key === 'Enter' &&
                                            !keyEvent.shiftKey
                                        ) {
                                            keyEvent.preventDefault();
                                            sendNote();
                                        }
                                    }}
                                    className="min-h-[44px] flex-1 resize-none rounded-lg bg-surface px-3 py-2 text-body-m text-surface-on ring-1 ring-inset ring-outline-variant placeholder:text-surface-on-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                />
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="md"
                                    disabled={!note.trim()}
                                >
                                    {t('decisions.deck.noteSend', 'Envoyer')}
                                </Button>
                            </form>
                        )}
                    </article>
                )}
            </main>

            <footer className="flex min-h-[56px] items-center gap-3 border-t border-outline-variant/60 px-6 py-2 max-sm:px-4">
                {deck.held && (
                    <span className="text-body-m" role="status">
                        {statusText(deck.held)}
                    </span>
                )}
                <span className="flex-1" />
                <span className="text-label-m text-surface-on-variant max-sm:hidden">
                    {t(
                        'decisions.deck.keys',
                        'Entrée ou → : conseil · 1–5 : choisir · ← : plus tard · ↓ : passer · Ctrl+Z : annuler · Échap : fermer'
                    )}
                </span>
            </footer>
        </div>
    );
};

export default DecisionDeck;
