import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    ArchiveBoxIcon,
    ArrowTopRightOnSquareIcon,
    CalendarIcon,
    CheckCircleIcon,
    ClockIcon,
    EnvelopeOpenIcon,
    PaperAirplaneIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
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
import {
    DeckAction,
    DeckButton,
    deckButtons,
    deckCards,
    DeckChoice,
    deckProgress,
    deckReducer,
    DeckState,
    GMAIL,
    HeldDecision,
    initialDeck,
} from './mailDeck';

// How long « Annuler » can take the last decision back before it is sent.
const UNDO_MS = 5000;
const LEAVE_MS = 180;
// The Hermes plugin's page has the chat with the agents (docs/46-plugins.md).
const CHAT_PLUGIN = 'hermes';
// Past this, the mail's text starts folded under « Lire le mail ».
const LONG_EXCERPT = 420;
const LONG_EXCERPT_LINES = 7;
const NOTE_MAX = 500;

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
    draft: [
        'triage.mail.draftRequested',
        'Brouillon en préparation dans Gmail',
    ],
    event: ['triage.mail.eventRequested', 'Rendez-vous demandé à l’agent'],
    later: ['triage.mail.postponed', 'Revient demain'],
    archive: ['triage.mail.archiveRequested', 'Archivage demandé'],
    dismiss: ['triage.mail.dismissed', 'Mail ignoré'],
    note: ['triage.mail.noteSent', 'Renvoyé au Trieur'],
};

type Icon = React.ComponentType<React.SVGProps<SVGSVGElement>>;
const CHOICE: Record<DeckChoice, [Icon, string, string]> = {
    draft: [PaperAirplaneIcon, 'triage.deck.option.draft', 'Brouillon'],
    reply: [PaperAirplaneIcon, 'triage.mail.reply', 'Répondre'],
    read: [EnvelopeOpenIcon, 'triage.deck.option.read', 'Lire'],
    task: [CheckCircleIcon, 'triage.mail.task', 'Tâche'],
    event: [CalendarIcon, 'triage.deck.option.event', 'Agenda'],
    later: [ClockIcon, 'triage.mail.later', 'Plus tard'],
    archive: [ArchiveBoxIcon, 'triage.deck.option.archive', 'Archiver'],
    dismiss: [XMarkIcon, 'triage.mail.dismiss', 'Ignorer'],
};

// Putting off, archiving and dismissing push the card away to the left.
const LEFT: MailDecision[] = ['later', 'archive', 'dismiss'];

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

const longText = (text: string) =>
    text.length > LONG_EXCERPT || text.split('\n').length > LONG_EXCERPT_LINES;

// Typing in the note never drives the deck.
const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const QUIET_LINK =
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-body-m font-medium hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]';

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
            className={`${QUIET_LINK} text-surface-on-variant hover:text-surface-on`}
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
// as a full-screen deck, one at a time. One row of the agent's choices, its
// advice highlighted; the last decision waits a moment so « Annuler » can
// take it back.
const MailDeck: React.FC<MailDeckProps> = ({
    items,
    archiveAvailable,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const chat = usePluginMenuStore((state) =>
        state.items.find((entry) => entry.id === CHAT_PLUGIN)
    );
    const [deck, setDeck] = useState<DeckState>(initialDeck);
    const deckRef = useRef(deck);
    const [phase, setPhase] = useState<Phase>('in');
    const [archive, setArchive] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [note, setNote] = useState('');
    const [mailOpen, setMailOpen] = useState(false);
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
    const progress = deckProgress(items, deck);
    const item = cards[0];
    const mail = item?.payload as unknown as MailPayload | undefined;
    const buttons = mail ? deckButtons(mail) : [];
    const advised = buttons.find((button) => button.recommended);
    // Without its own « Archiver » choice, a card may archive the thread
    // with its decision (the check box).
    const archiveBox =
        archiveAvailable &&
        !buttons.some((button) => button.choice === 'archive');
    const gmail = mail?.gmail_url.startsWith(GMAIL) ? mail.gmail_url : null;

    // The card leaves in the direction of the gesture, then the next comes in.
    const leave = (direction: Phase, then: () => void) => {
        if (busy.current) return;
        busy.current = true;
        const finish = () => {
            then();
            setNoteOpen(false);
            setNote('');
            setMailOpen(false);
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
        direction: Phase = LEFT.includes(decision) ? 'left' : 'right'
    ) => {
        if (!item || !mail) return;
        const held: HeldDecision = {
            key: item.key,
            mailUid: mail.mail_uid,
            decision,
            payload,
            // The check box archives with the decision; putting a mail off,
            // a draft or a word to the agent keeps it in the inbox.
            archive:
                archiveBox &&
                archive &&
                !['later', 'draft', 'archive', 'note'].includes(decision),
        };
        leave(direction, () => step({ type: 'decide', held }));
    };

    const openMail = () => {
        if (gmail) window.open(gmail, '_blank', 'noopener,noreferrer');
    };

    const choose = (button: DeckButton | undefined) => {
        if (!button) return;
        if (button.opensMail) openMail();
        decide(button.decision, button.payload);
    };

    const sendNote = () => {
        const text = note.trim();
        if (text) decide('note', { text });
    };

    const skip = () => {
        if (item) leave('down', () => step({ type: 'skip', key: item.key }));
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
            if (!item) return;
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
                event.preventDefault();
                choose(advised);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                decide('later', {});
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                skip();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const detail = (button: DeckButton) => {
        if (button.choice === 'task') return String(button.payload.name ?? '');
        if (button.choice === 'event' && mail?.suggestion?.event?.start) {
            return eventWhen(mail.suggestion.event);
        }
        return button.opensMail ? 'Gmail' : '';
    };

    const failure = () => {
        if (!mail?.action_error) return null;
        const type = mail.action?.type;
        const lead =
            type === 'draft'
                ? t(
                      'triage.deck.actionFailedDraft',
                      'Le brouillon n’a pas pu être préparé'
                  )
                : type === 'archive'
                  ? t(
                        'triage.deck.actionFailedArchive',
                        'L’archivage n’a pas abouti'
                    )
                  : t(
                        'triage.deck.actionFailed',
                        'La dernière action n’a pas abouti'
                    );
        return { lead, code: mail.action_error };
    };

    const undoButton = (
        <Button variant="ghost" size="md" disabled={!deck.held} onClick={undo}>
            {t('triage.deck.undo', 'Annuler')}
        </Button>
    );

    const sender = mail ? mail.from_name || mail.from_address : null;
    const meta = mail
        ? [sender, receivedOn(mail.received_at)].filter(Boolean).join(' · ')
        : '';
    const event =
        mail?.suggestion?.kind === 'event' ? mail.suggestion.event : null;
    const excerpt = mail?.excerpt?.trim() || null;
    const folded = excerpt ? longText(excerpt) && !mailOpen : false;
    const draft = mail?.draft?.body?.trim() || mail?.draft_excerpt || null;
    const error = failure();
    const percent =
        progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

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
                {progress.total > 0 && (
                    <span
                        className="text-body-m tabular-nums text-surface-on-variant"
                        data-testid="mail-deck-progress"
                    >
                        {progress.position} / {progress.total}
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
            <div
                role="progressbar"
                aria-label={t(
                    'triage.deck.progressLabel',
                    'Mail {{position}} sur {{total}}',
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
                {!item || !mail || buttons.length === 0 ? (
                    <div className="text-center" data-testid="mail-deck-done">
                        <p className="text-title-m font-semibold">
                            {t('triage.deck.done', 'Tout est trié')}
                        </p>
                        <div className="mt-4 flex justify-center gap-2">
                            {deck.held && undoButton}
                            <Button variant="primary" size="md" onClick={close}>
                                {t('triage.deck.back', 'Retour à « À trier »')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <article
                        key={item.key}
                        data-testid="mail-deck-card"
                        className={`w-full max-w-xl rounded-2xl bg-surface-low p-6 shadow-sm ring-1 ring-inset ring-outline-variant/60 transition-all duration-200 ease-out motion-reduce:transition-none max-sm:p-4 ${PHASE_CLASS[phase]}`}
                    >
                        {error && (
                            <p
                                data-testid="mail-deck-error"
                                className="mb-4 rounded-lg bg-danger-container/60 px-3 py-2 text-body-m text-danger-on-container"
                            >
                                {error.lead}{' '}
                                <span className="text-label-m opacity-80">
                                    ({error.code})
                                </span>
                            </p>
                        )}
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
                        {excerpt && (
                            <div className="mt-4 rounded-xl bg-surface px-4 py-3">
                                <p
                                    data-testid="mail-deck-excerpt"
                                    className={`whitespace-pre-line break-words text-body-m text-surface-on ${folded ? 'line-clamp-5' : ''}`}
                                >
                                    {excerpt}
                                </p>
                                {longText(excerpt) && (
                                    <button
                                        type="button"
                                        aria-expanded={mailOpen}
                                        onClick={() =>
                                            setMailOpen((open) => !open)
                                        }
                                        className="-mx-1 mt-1 rounded px-1 text-body-m font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]"
                                    >
                                        {mailOpen
                                            ? t(
                                                  'triage.deck.collapseMail',
                                                  'Réduire'
                                              )
                                            : t(
                                                  'triage.deck.readMail',
                                                  'Lire le mail'
                                              )}
                                    </button>
                                )}
                            </div>
                        )}
                        {gmail && (
                            <a
                                href={gmail}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${QUIET_LINK} -ml-3 mt-1 text-primary`}
                            >
                                {t(
                                    'triage.deck.openInGmail',
                                    'Ouvrir dans Gmail'
                                )}
                                <ArrowTopRightOnSquareIcon
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </a>
                        )}
                        {draft && (
                            <figure className="mt-3">
                                <figcaption className="text-label-m text-surface-on-variant">
                                    {t('triage.mail.draft', 'Brouillon prêt :')}
                                </figcaption>
                                <blockquote
                                    data-testid="mail-deck-draft"
                                    className="mt-1 whitespace-pre-line break-words border-l-2 border-primary/50 pl-3 text-body-m text-surface-on"
                                >
                                    {draft}
                                </blockquote>
                            </figure>
                        )}

                        <div
                            className="mt-5 grid gap-2 max-sm:gap-1.5"
                            style={{
                                gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))`,
                            }}
                        >
                            {buttons.map((button, index) => {
                                const [Glyph, key, fallback] =
                                    CHOICE[button.choice];
                                const sub = detail(button);
                                return (
                                    <button
                                        key={button.choice}
                                        type="button"
                                        data-choice={button.choice}
                                        data-recommended={
                                            button.recommended || undefined
                                        }
                                        aria-keyshortcuts={String(index + 1)}
                                        onClick={() => choose(button)}
                                        className={`relative flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-low max-sm:min-h-[64px] max-sm:px-1 ${
                                            button.recommended
                                                ? 'bg-primary/10 text-surface-on ring-2 ring-inset ring-primary hover:bg-primary/15'
                                                : 'text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high active:bg-surface-highest'
                                        }`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="absolute left-2 top-1.5 text-label-m tabular-nums text-surface-on-variant/70 max-sm:hidden"
                                        >
                                            {index + 1}
                                        </span>
                                        <Glyph
                                            aria-hidden="true"
                                            className={`h-6 w-6 ${button.recommended ? 'text-primary' : 'text-surface-on-variant'}`}
                                        />
                                        <span className="max-w-full truncate text-label font-medium max-sm:text-label-m">
                                            {t(key, fallback)}
                                        </span>
                                        {sub && (
                                            <span
                                                title={sub}
                                                className="max-w-full truncate text-label-m text-surface-on-variant max-sm:hidden"
                                            >
                                                {sub}
                                            </span>
                                        )}
                                        {button.recommended && (
                                            <span className="sr-only">
                                                {t(
                                                    'triage.deck.recommended',
                                                    'Conseillé'
                                                )}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1">
                            <Button
                                variant="ghost"
                                size="md"
                                aria-expanded={noteOpen}
                                onClick={() => setNoteOpen((open) => !open)}
                            >
                                {t(
                                    'triage.deck.noteOpen',
                                    'Répondre par un mot'
                                )}
                            </Button>
                            {chat && (
                                <ChatLink
                                    href={`${chat.path}?${new URLSearchParams({
                                        view: 'chat',
                                        mail: mail.mail_uid,
                                    })}`}
                                    label={t('triage.deck.chat', 'Discuter')}
                                />
                            )}
                            <span className="flex-1" />
                            <Button variant="ghost" size="md" onClick={skip}>
                                {t('triage.skip', 'Passer')}
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
                                        'triage.deck.noteOpen',
                                        'Répondre par un mot'
                                    )}
                                    placeholder={t(
                                        'triage.deck.notePlaceholder',
                                        'Un mot pour le Trieur'
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
                                    {t('triage.deck.noteSend', 'Envoyer')}
                                </Button>
                            </form>
                        )}
                        {archiveBox && (
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
                    </article>
                )}
            </main>

            <footer className="flex min-h-[56px] items-center gap-3 border-t border-outline-variant/60 px-6 py-2 max-sm:px-4">
                {deck.held && (
                    <span className="text-body-m" role="status">
                        {t(
                            DONE[deck.held.decision][0],
                            DONE[deck.held.decision][1]
                        )}
                    </span>
                )}
                <span className="flex-1" />
                <span className="text-label-m text-surface-on-variant max-sm:hidden">
                    {t(
                        'triage.deck.keys',
                        'Entrée ou → : conseil · 1–5 : choisir · ← : plus tard · ↓ : passer · Ctrl+Z : annuler · Échap : fermer'
                    )}
                </span>
            </footer>
        </div>
    );
};

export default MailDeck;
