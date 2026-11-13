import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
    decideMail,
    MailDecision,
    MailEvent,
    MailPayload,
    TriageItem,
} from '../../utils/triageService';
import { usePluginMenuStore } from '../../store/pluginMenuStore';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import MailTaskForm from './MailTaskForm';
import {
    DeckAction,
    deckCards,
    deckReducer,
    DeckState,
    GMAIL,
    HeldDecision,
    initialDeck,
    recommendation,
} from './mailDeck';

// How long « Annuler » can take the last decision back before it is sent.
const UNDO_MS = 5000;
const LEAVE_MS = 180;
// The Hermes plugin's page has the chat with the agents (docs/46-plugins.md).
const CHAT_PLUGIN = 'hermes';

type Phase = 'in' | 'right' | 'left' | 'down' | 'enter';
const PHASE_CLASS: Record<Phase, string> = {
    in: 'translate-x-0 translate-y-0 opacity-100',
    right: 'translate-x-16 opacity-0',
    left: '-translate-x-16 opacity-0',
    down: 'translate-y-10 opacity-0',
    enter: 'translate-y-3 opacity-0',
};

const DONE: Record<MailDecision, [string, string]> = {
    task: ['triage.mail.taskCreated', 'Tâche créée'],
    reply: ['triage.mail.replied', 'Réponse ouverte dans Gmail'],
    event: ['triage.mail.eventRequested', 'Rendez-vous demandé à l’agent'],
    later: ['triage.mail.postponed', 'Revient demain'],
    dismiss: ['triage.mail.dismissed', 'Mail ignoré'],
};

const reducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const receivedOn = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? null
        : date.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
          });
};

const eventWhen = (event: MailEvent) => {
    const start = new Date(
        event.all_day ? `${event.start}T12:00:00` : event.start
    );
    if (Number.isNaN(start.getTime())) return event.start;
    const day = start.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
    return event.all_day
        ? day
        : `${day}, ${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

// Typing in the task form never drives the deck.
const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const ChatLink: React.FC<{ href: string; label: string }> = ({
    href,
    label,
}) => {
    const navigate = useNavigate();
    return (
        <a
            href={href}
            onClick={(event) => {
                event.preventDefault();
                navigate(href);
            }}
            className="inline-flex h-9 items-center rounded-lg px-3.5 text-body-m font-medium text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]"
        >
            {label}
        </a>
    );
};

interface MailDeckProps {
    items: TriageItem[];
    archiveAvailable: boolean;
    // Receives the sending of the decision still held when the deck closed.
    onClose: (sent: Promise<void>) => void;
}

// « Trier mes mails » (docs/43-mail-triage.md): the mail cards of « À trier »
// as a full-screen deck, one at a time. The agent's advice is the main
// button; the last decision waits a moment so « Annuler » can take it back.
const MailDeck: React.FC<MailDeckProps> = ({
    items,
    archiveAvailable,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const chat = usePluginMenuStore((state) =>
        state.items.find((item) => item.id === CHAT_PLUGIN)
    );
    const [deck, setDeck] = useState<DeckState>(initialDeck);
    const deckRef = useRef(deck);
    const [phase, setPhase] = useState<Phase>('in');
    const [archive, setArchive] = useState(false);
    const [taskForm, setTaskForm] = useState(false);
    const busy = useRef(false);

    const send = useCallback(
        (held: HeldDecision): Promise<void> =>
            decideMail(held.mailUid, held.decision, held.payload, held.archive)
                .then((outcome) => {
                    if (held.archive && outcome?.archived === false) {
                        showErrorToast(
                            t(
                                'triage.mail.notArchived',
                                'Pas archivé dans Gmail'
                            )
                        );
                    }
                })
                .catch((error) => {
                    // Settled on another device meanwhile: nothing left to ask.
                    if ((error as { status?: number })?.status === 409) {
                        showErrorToast(
                            t('triage.alreadySettled', 'Déjà traité ailleurs.')
                        );
                        return;
                    }
                    step({ type: 'failed', key: held.key });
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
        step({ type: 'sent', key: held.key });
        return send(held);
    };

    useEffect(() => {
        if (!deck.held) return undefined;
        const timer = window.setTimeout(release, UNDO_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deck.held]);

    // Leaving the deck (Discuter, another page) sends what is still held.
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
    const item = cards[0];
    const mail = item?.payload as unknown as MailPayload | undefined;
    const advice = mail ? recommendation(mail) : null;
    const gmail = mail?.gmail_url.startsWith(GMAIL) ? mail.gmail_url : null;

    // The card leaves in the direction of the gesture, then the next comes in.
    const leave = (direction: Phase, then: () => void) => {
        if (busy.current) return;
        busy.current = true;
        const finish = () => {
            then();
            setTaskForm(false);
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
        decision: MailDecision,
        payload: Record<string, unknown>,
        direction: Phase = 'right'
    ) => {
        if (!item || !mail) return;
        const held: HeldDecision = {
            key: item.key,
            mailUid: mail.mail_uid,
            decision,
            payload,
            // Putting a mail off keeps it in the inbox.
            archive: archive && decision !== 'later',
        };
        leave(direction, () => step({ type: 'decide', held }));
    };

    const openMail = () => {
        if (gmail) window.open(gmail, '_blank', 'noopener,noreferrer');
    };

    const accept = () => {
        if (!advice) return;
        if (advice.opensMail) openMail();
        decide(advice.decision, advice.payload);
    };

    const skip = () => {
        if (item) leave('down', () => step({ type: 'skip', key: item.key }));
    };

    const undo = () => {
        if (!deckRef.current.held || busy.current) return;
        setTaskForm(false);
        step({ type: 'undo' });
    };

    const close = () => onClose(release());

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (taskForm) setTaskForm(false);
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
            if (!item) return;
            // A focused button keeps its own Enter.
            const onButton =
                event.target instanceof HTMLElement &&
                ['BUTTON', 'A'].includes(event.target.tagName);
            if (event.key === 'Enter' && !onButton) {
                event.preventDefault();
                accept();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                accept();
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

    const adviceLabel = () => {
        if (!advice || !mail) return '';
        switch (advice.decision) {
            case 'reply':
                return t('triage.deck.replyInGmail', 'Répondre dans Gmail');
            case 'dismiss':
                return t('triage.deck.readInGmail', 'Lire dans Gmail');
            case 'event':
                return t(
                    'triage.deck.addEvent',
                    'Ajouter à l’agenda : {{when}}',
                    {
                        when: eventWhen(mail.suggestion?.event as MailEvent),
                    }
                );
            default:
                return t(
                    'triage.deck.createTask',
                    'Créer la tâche : {{name}}',
                    {
                        name: String(advice.payload.name),
                    }
                );
        }
    };

    const sender = mail ? mail.from_name || mail.from_address : null;
    const meta = mail
        ? [sender, receivedOn(mail.received_at)].filter(Boolean).join(' · ')
        : '';
    const event =
        mail?.suggestion?.kind === 'event' ? mail.suggestion.event : null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('triage.deck.title', 'Trier mes mails')}
            data-testid="mail-deck"
            className="fixed inset-0 z-50 flex flex-col bg-surface text-surface-on"
        >
            <header className="flex items-center gap-3 px-6 pb-2 pt-4 max-sm:px-4">
                <h1 className="text-title-m font-semibold">
                    {t('triage.deck.title', 'Trier mes mails')}
                </h1>
                {cards.length > 0 && (
                    <span className="text-body-m text-surface-on-variant">
                        {t('triage.left', '{{count}} à voir', {
                            count: cards.length,
                        })}
                    </span>
                )}
                <span className="flex-1" />
                <IconButton
                    label={t('triage.deck.close', 'Fermer')}
                    onClick={close}
                >
                    <XMarkIcon />
                </IconButton>
            </header>

            <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 pb-6 pt-4 max-sm:px-4 sm:items-center">
                {!item || !mail || !advice ? (
                    <div className="text-center" data-testid="mail-deck-done">
                        <p className="text-title-m font-semibold">
                            {t('triage.deck.done', 'Tout est trié')}
                        </p>
                        <Button
                            variant="primary"
                            size="md"
                            className="mt-4"
                            onClick={close}
                        >
                            {t('triage.deck.back', 'Retour à « À trier »')}
                        </Button>
                    </div>
                ) : (
                    <article
                        key={item.key}
                        data-testid="mail-deck-card"
                        className={`w-full max-w-xl rounded-2xl bg-surface-low p-6 shadow-sm ring-1 ring-inset ring-outline-variant/60 transition-all duration-200 ease-out motion-reduce:transition-none max-sm:p-5 ${PHASE_CLASS[phase]}`}
                    >
                        {meta && (
                            <p className="text-body-m text-surface-on-variant">
                                {meta}
                            </p>
                        )}
                        <h2 className="mt-1 text-title font-semibold text-surface-on">
                            {mail.subject ||
                                t('triage.mail.noSubject', '(sans objet)')}
                        </h2>
                        <p className="mt-3 text-body text-surface-on">
                            {mail.summary}
                        </p>
                        {event && (
                            <p className="mt-2 text-body-m text-surface-on-variant">
                                {[event.title, eventWhen(event), event.location]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        )}
                        {mail.draft_excerpt && (
                            <p className="mt-3 whitespace-pre-line border-l-2 border-outline-variant pl-3 text-body-m text-surface-on-variant">
                                <span className="font-semibold">
                                    {t('triage.mail.draft', 'Brouillon prêt :')}
                                </span>{' '}
                                {mail.draft_excerpt}
                            </p>
                        )}

                        <Button
                            variant="primary"
                            size="lg"
                            className="mt-5 w-full whitespace-normal py-3 text-left"
                            onClick={accept}
                        >
                            {adviceLabel()}
                        </Button>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                size="md"
                                aria-expanded={taskForm}
                                onClick={() => setTaskForm((open) => !open)}
                            >
                                {advice.decision === 'task'
                                    ? t(
                                          'triage.deck.editTask',
                                          'Modifier la tâche'
                                      )
                                    : t('triage.mail.task', 'Tâche')}
                            </Button>
                            {gmail && advice.decision !== 'reply' && (
                                <Button
                                    variant="secondary"
                                    size="md"
                                    onClick={() => {
                                        openMail();
                                        decide('reply', {});
                                    }}
                                >
                                    {t('triage.mail.reply', 'Répondre')}
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => decide('later', {}, 'left')}
                            >
                                {t('triage.mail.later', 'Plus tard')}
                            </Button>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => decide('dismiss', {}, 'left')}
                            >
                                {t('triage.mail.dismiss', 'Ignorer')}
                            </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {gmail && (
                                <a
                                    href={gmail}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 items-center rounded-lg px-3.5 text-body-m font-medium text-primary hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]"
                                >
                                    {t(
                                        'triage.deck.openMail',
                                        'Ouvrir le mail'
                                    )}
                                </a>
                            )}
                            {chat && (
                                <ChatLink
                                    href={`${chat.path}?${new URLSearchParams({
                                        view: 'chat',
                                        mail: mail.mail_uid,
                                    })}`}
                                    label={t('triage.deck.chat', 'Discuter')}
                                />
                            )}
                            <Button variant="ghost" size="md" onClick={skip}>
                                {t('triage.skip', 'Passer')}
                            </Button>
                        </div>
                        {archiveAvailable && (
                            <label className="mt-2 flex min-h-[40px] items-center gap-2 text-sm text-surface-on">
                                <input
                                    type="checkbox"
                                    checked={archive}
                                    onChange={(e) =>
                                        setArchive(e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                {t(
                                    'triage.mail.archive',
                                    'Archiver dans Gmail'
                                )}
                            </label>
                        )}
                        {taskForm && (
                            <MailTaskForm
                                initialName={
                                    mail.suggestion?.task_name ??
                                    mail.subject ??
                                    mail.summary
                                }
                                initialDue={mail.suggestion?.due_date ?? ''}
                                onSubmit={(task) => decide('task', task)}
                            />
                        )}
                    </article>
                )}
            </main>

            <footer className="flex min-h-[56px] items-center gap-3 border-t border-outline-variant/60 px-6 py-2 max-sm:px-4">
                {deck.held && (
                    <>
                        <span className="text-body-m" role="status">
                            {t(
                                DONE[deck.held.decision][0],
                                DONE[deck.held.decision][1]
                            )}
                        </span>
                        <Button variant="secondary" size="sm" onClick={undo}>
                            {t('triage.deck.undo', 'Annuler')}
                        </Button>
                    </>
                )}
                <span className="flex-1" />
                <span className="text-label-m text-surface-on-variant max-sm:hidden">
                    {t(
                        'triage.deck.keys',
                        'Entrée ou → : conseil · ← : plus tard · ↓ : passer · Ctrl+Z : annuler · Échap : fermer'
                    )}
                </span>
            </footer>
        </div>
    );
};

export default MailDeck;
