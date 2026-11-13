import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowTopRightOnSquareIcon,
    ChatBubbleLeftEllipsisIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import PageShell, { PAGE_GUTTER } from '../Shared/ui/PageShell';
import PageHeader from '../Shared/ui/PageHeader';
import EmptyState from '../Shared/ui/EmptyState';
import Button, { type ButtonVariant } from '../Shared/ui/Button';
import { useToast } from '../Shared/ToastContext';
import { OfflineQueuedError } from '../../utils/authUtils';
import {
    applyCareerDecisions,
    CareerDecision,
    CareerFollowup,
    CareerOffer,
    CareerProposal,
    CareerTask,
    listCareerProposals,
} from '../../utils/proposalsService';
import { useProposalChanged } from '../Proposals/useProposalChanged';
import {
    agoText,
    choiceLabelOf,
    clockText,
    daysLeft,
    decisionMap,
    inDaysText,
    itemKey,
    latestProposal,
    parseDay,
    safeUrl,
    stateLabelOf,
} from './careerModel';
import type { CareerKind } from './careerModel';

const NOTE_MAX = 500;

const linkButton =
    'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-body-m font-medium text-surface-on ring-1 ring-inset ring-outline-variant transition-colors duration-150 hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:min-h-[44px]';
const titleLink =
    'rounded-inner hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const join = (parts: (string | null | undefined | false)[]): string =>
    parts.filter(Boolean).join(' · ');

const Section: React.FC<{
    id: string;
    title: string;
    count: number;
    children: React.ReactNode;
}> = ({ id, title, count, children }) => (
    <section aria-labelledby={`career-${id}`} data-testid={`career-${id}`}>
        <h2
            id={`career-${id}`}
            className="mb-2 flex items-baseline gap-2 text-title-m text-surface-on"
        >
            {title}
            <span className="text-label-m font-medium tabular-nums text-surface-on-variant">
                {count}
            </span>
        </h2>
        {children}
    </section>
);

const choiceClass = (chosen: boolean) =>
    chosen ? 'ring-2 ring-primary/70' : '';

// The agent's career morning: follow-ups to send, offers to decide, tasks to
// add. A tap only stages a choice; « Valider » sends every staged choice in
// one call, and applied items fold into « Décidé (N) », without undo
// (docs/47-proposals.md › Clients › Web).
const CareerPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language || 'fr';
    const { showErrorToast, showSuccessToast } = useToast();
    const [proposal, setProposal] = useState<CareerProposal | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>(
        'loading'
    );
    // Decisions applied here, over the server's.
    const [local, setLocal] = useState<Map<string, CareerDecision>>(
        () => new Map()
    );
    // Choices made by taps, not yet sent; keyed `kind:id`, in tap order.
    const [staged, setStaged] = useState<Map<string, CareerDecision>>(
        () => new Map()
    );
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [notes, setNotes] = useState<Map<string, string>>(() => new Map());
    const [noteOpen, setNoteOpen] = useState<string | null>(null);
    const [decidedOpen, setDecidedOpen] = useState(false);

    const load = useCallback(() => {
        return listCareerProposals()
            .then((all) => {
                setProposal(latestProposal(all));
                setLocal(new Map());
                setState('ready');
            })
            .catch(() => setState('error'));
    }, []);

    useEffect(() => {
        void load();
    }, [load]);
    useProposalChanged(() => void load());

    const decided = useMemo(() => {
        const merged = decisionMap(proposal?.decisions);
        local.forEach((decision, key) => merged.set(key, decision));
        return merged;
    }, [proposal, local]);

    const answer = proposal?.answer ?? null;
    const now = new Date();

    const stage = (decision: CareerDecision) => {
        if (!proposal || submitting) return;
        const key = itemKey(decision.kind, decision.id);
        setStaged((previous) => new Map(previous).set(key, decision));
        setSubmitError(null);
        if (noteOpen === key) setNoteOpen(null);
    };

    const isChosen = (kind: CareerKind, id: string, op: string): boolean =>
        staged.get(itemKey(kind, id))?.op === op;

    const noteFor = (key: string): string | undefined => {
        const text = notes.get(key)?.trim();
        return text ? text : undefined;
    };

    const clearStaged = () => {
        setStaged(new Map());
        setNotes(new Map());
        setNoteOpen(null);
        setSubmitError(null);
    };

    const validate = () => {
        if (!proposal || submitting || staged.size === 0) return;
        const entries = [...staged.entries()];
        const decisions = entries.map(([key, decision]) => {
            const note = decision.kind === 'offer' ? noteFor(key) : undefined;
            return decision.kind === 'offer' && note
                ? { ...decision, note }
                : decision;
        });
        setSubmitting(true);
        setSubmitError(null);
        const finish = () => {
            // « Plus tard » is sent but stays open on the page.
            const decidedNow = entries.filter(
                ([, decision]) => decision.op !== 'later'
            );
            setLocal((previous) => {
                const next = new Map(previous);
                decidedNow.forEach(([key, decision]) =>
                    next.set(key, decision)
                );
                return next;
            });
            setStaged(new Map());
            setNotes((previous) => {
                const next = new Map(previous);
                entries.forEach(([key]) => next.delete(key));
                return next;
            });
            setSubmitting(false);
            showSuccessToast(
                entries.length === 1
                    ? t('career.appliedOne', '1 décision appliquée')
                    : t('career.applied', '{{count}} décisions appliquées', {
                          count: entries.length,
                      })
            );
        };
        applyCareerDecisions(proposal.uid, decisions)
            .then(finish)
            .catch((error) => {
                // Queued offline: the writes are replayed later, as if applied.
                if (error instanceof OfflineQueuedError) return finish();
                const message = t(
                    'career.applyError',
                    'La décision n’a pas été enregistrée.'
                );
                setSubmitting(false);
                setSubmitError(message);
                showErrorToast(message);
            });
    };

    // Ctrl+Entrée (⌘+Entrée on macOS) validates the staged choices.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) {
                return;
            }
            if (staged.size === 0) return;
            event.preventDefault();
            validate();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    // Leaving with staged choices asks for confirmation; nothing else does.
    useEffect(() => {
        if (staged.size === 0) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [staged.size]);

    const header = (
        <PageHeader
            title={t('career.title', 'Carrière')}
            subtitle={
                proposal && clockText(proposal.created_at, language)
                    ? t('career.updatedAt', 'mis à jour à {{time}}', {
                          time: clockText(proposal.created_at, language),
                      })
                    : undefined
            }
        />
    );

    if (state === 'loading') {
        return (
            <PageShell template="list" data-testid="career-page">
                {header}
                <div
                    className={`${PAGE_GUTTER} space-y-3`}
                    aria-busy="true"
                    aria-live="polite"
                >
                    <div className="h-6 w-2/3 animate-pulse rounded-inner bg-surface-high motion-reduce:animate-none" />
                    <div className="h-24 animate-pulse rounded-card bg-surface-card motion-reduce:animate-none" />
                </div>
            </PageShell>
        );
    }

    if (state === 'error') {
        return (
            <PageShell template="list" data-testid="career-page">
                {header}
                <EmptyState
                    title={t(
                        'career.loadError',
                        'Impossible de charger la page Carrière.'
                    )}
                    action={
                        <Button
                            size="md"
                            onClick={() => {
                                setState('loading');
                                void load();
                            }}
                        >
                            {t('career.retry', 'Réessayer')}
                        </Button>
                    }
                />
            </PageShell>
        );
    }

    const followups = answer?.followups ?? [];
    const offers = answer?.offers ?? [];
    const tasks = answer?.tasks ?? [];
    const open = <T extends { id: string }>(
        kind: CareerDecision['kind'],
        items: T[]
    ) => items.filter((item) => !decided.has(itemKey(kind, item.id)));
    const openFollowups = open('followup', followups);
    const openOffers = open('offer', offers);
    const openTasks = open('task', tasks);
    const pendingCount =
        openFollowups.length + openOffers.length + openTasks.length;

    // Decided items in page order, with the title they had.
    const decidedRows = [
        ...followups.map((f) => ({
            key: itemKey('followup', f.id),
            title: join([f.title, f.company]),
        })),
        ...offers.map((o) => ({
            key: itemKey('offer', o.id),
            title: join([o.title, o.company]),
        })),
        ...tasks.map((task) => ({
            key: itemKey('task', task.id),
            title: task.name,
        })),
    ].flatMap((row) => {
        const decision = decided.get(row.key);
        return decision ? [{ ...row, decision }] : [];
    });

    // A staged choice shows under its item, as « choisi : Postuler ».
    const choiceNote = (kind: CareerKind, id: string) => {
        const decision = staged.get(itemKey(kind, id));
        if (!decision) return null;
        const [labelKey, fallback] = choiceLabelOf(decision);
        return (
            <p className="mt-1 text-label-m text-primary">
                {t('career.choice', 'choisi : {{label}}', {
                    label: t(labelKey, fallback),
                })}
            </p>
        );
    };

    // A tap stages its choice; the button it names shows as selected.
    const choiceButton = (
        decision: CareerDecision,
        label: string,
        variant?: ButtonVariant,
        icon?: React.ReactNode
    ) => {
        const chosen = isChosen(decision.kind, decision.id, decision.op);
        return (
            <Button
                variant={variant}
                icon={icon}
                aria-pressed={chosen}
                className={choiceClass(chosen)}
                onClick={() => stage(decision)}
            >
                {label}
            </Button>
        );
    };

    const renderFollowup = (followup: CareerFollowup) => {
        const sourceUrl = safeUrl(followup.source_url);
        const draftUrl = safeUrl(followup.draft_url);
        const ago = followup.applied_at
            ? agoText(followup.applied_at, now, language)
            : null;
        return (
            <li
                key={followup.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
                <div className="min-w-0">
                    <p className="text-body font-medium text-surface-on">
                        {sourceUrl ? (
                            <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={titleLink}
                            >
                                {followup.title}
                            </a>
                        ) : (
                            followup.title
                        )}
                        {followup.company && (
                            <span className="text-surface-on-variant">
                                {' · '}
                                {followup.company}
                            </span>
                        )}
                    </p>
                    {ago && (
                        <p className="text-body-m text-surface-on-variant">
                            {t(
                                'career.followups.appliedAgo',
                                'postulé {{when}}',
                                {
                                    when: ago,
                                }
                            )}
                        </p>
                    )}
                    {followup.note && (
                        <p className="mt-0.5 text-body-m text-surface-on-variant">
                            {followup.note}
                        </p>
                    )}
                    {choiceNote('followup', followup.id)}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
                    {draftUrl && (
                        <a
                            href={draftUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={linkButton}
                        >
                            {t(
                                'career.followups.openDraft',
                                'Ouvrir le brouillon'
                            )}
                        </a>
                    )}
                    {choiceButton(
                        { kind: 'followup', id: followup.id, op: 'task' },
                        t('career.followups.createTask', 'Créer la tâche'),
                        'ghost'
                    )}
                    {choiceButton(
                        { kind: 'followup', id: followup.id, op: 'done' },
                        t('career.followups.done', 'Fait')
                    )}
                    {choiceButton(
                        { kind: 'followup', id: followup.id, op: 'later' },
                        t('career.later', 'Plus tard'),
                        'ghost'
                    )}
                </div>
            </li>
        );
    };

    const renderOffer = (offer: CareerOffer) => {
        const key = itemKey('offer', offer.id);
        const offerUrl = safeUrl(offer.url);
        const left = offer.expires ? daysLeft(offer.expires, now) : null;
        const expiry =
            left === null
                ? null
                : left < 0
                  ? t('career.offers.expired', 'expirée')
                  : t('career.offers.expires', 'expire {{when}}', {
                        when: inDaysText(left, language),
                    });
        const editing = noteOpen === key;
        const note = noteFor(key);
        return (
            <li
                key={offer.id}
                className="rounded-card bg-surface-card p-4"
                data-testid={`career-offer-${offer.id}`}
            >
                <p className="text-body font-medium text-surface-on">
                    {offerUrl ? (
                        <a
                            href={offerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${titleLink} inline-flex items-baseline gap-1`}
                        >
                            <span>{offer.title}</span>
                            <ArrowTopRightOnSquareIcon
                                className="h-3.5 w-3.5 shrink-0 self-center text-surface-on-variant"
                                aria-hidden="true"
                            />
                            <span className="sr-only">
                                {t('career.offers.open', 'Voir l’offre')}
                            </span>
                        </a>
                    ) : (
                        offer.title
                    )}
                    <span className="text-surface-on-variant">
                        {' · '}
                        {offer.company}
                    </span>
                </p>
                {(offer.location || offer.rate || expiry) && (
                    <p className="text-body-m tabular-nums text-surface-on-variant">
                        {join([offer.location, offer.rate, expiry])}
                    </p>
                )}
                <p className="mt-2 text-body-m text-surface-on">{offer.fit}</p>
                {choiceNote('offer', offer.id)}
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {choiceButton(
                        { kind: 'offer', id: offer.id, op: 'apply' },
                        t('career.offers.apply', 'Postuler'),
                        'primary'
                    )}
                    {choiceButton(
                        { kind: 'offer', id: offer.id, op: 'skip' },
                        t('career.skip', 'Passer')
                    )}
                    {choiceButton(
                        { kind: 'offer', id: offer.id, op: 'later' },
                        t('career.later', 'Plus tard'),
                        'ghost'
                    )}
                    <Button
                        variant="ghost"
                        aria-expanded={editing}
                        aria-controls={`career-note-${offer.id}`}
                        icon={
                            <ChatBubbleLeftEllipsisIcon
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                        }
                        className={note ? 'text-primary' : ''}
                        onClick={() => setNoteOpen(editing ? null : key)}
                    >
                        {t('career.offers.note', 'Remarque')}
                    </Button>
                </div>
                {editing && (
                    <input
                        id={`career-note-${offer.id}`}
                        type="text"
                        autoFocus
                        maxLength={NOTE_MAX}
                        value={notes.get(key) ?? ''}
                        aria-label={t('career.offers.note', 'Remarque')}
                        placeholder={t(
                            'career.offers.notePlaceholder',
                            'Une remarque pour l’agent…'
                        )}
                        onChange={(event) => {
                            const value = event.target.value;
                            setNotes((previous) =>
                                new Map(previous).set(key, value)
                            );
                        }}
                        onKeyDown={(event) => {
                            if (
                                event.key === 'Escape' ||
                                event.key === 'Enter'
                            ) {
                                event.preventDefault();
                                setNoteOpen(null);
                            }
                        }}
                        className="mt-2 w-full rounded-lg border-0 bg-surface-high/70 px-3 py-2 text-body-m text-surface-on placeholder:text-surface-on-variant focus:ring-2 focus:ring-primary/40"
                    />
                )}
                {!editing && note && (
                    <p className="mt-2 text-body-m italic text-surface-on-variant">
                        {note}
                    </p>
                )}
            </li>
        );
    };

    const renderTask = (task: CareerTask) => {
        const due = task.due_date ? parseDay(task.due_date) : null;
        return (
            <li key={task.id} className="flex items-start gap-3 py-3">
                <span
                    aria-hidden="true"
                    className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border-2 border-outline-variant"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-body text-surface-on">{task.name}</p>
                    {(task.note || due) && (
                        <p className="text-body-m text-surface-on-variant">
                            {join([
                                due &&
                                    due.toLocaleDateString(language, {
                                        day: 'numeric',
                                        month: 'short',
                                    }),
                                task.note,
                            ])}
                        </p>
                    )}
                    {choiceNote('task', task.id)}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {choiceButton(
                        task.due_date
                            ? {
                                  kind: 'task',
                                  id: task.id,
                                  op: 'create',
                                  due_date: task.due_date,
                              }
                            : { kind: 'task', id: task.id, op: 'create' },
                        t('career.tasks.add', 'Ajouter')
                    )}
                    {choiceButton(
                        { kind: 'task', id: task.id, op: 'skip' },
                        t('career.skip', 'Passer'),
                        'ghost'
                    )}
                </div>
            </li>
        );
    };

    return (
        <PageShell template="list" data-testid="career-page">
            {header}
            <div className={`${PAGE_GUTTER} space-y-8`}>
                {answer && (answer.headline || answer.subtitle) && (
                    <div>
                        {answer.headline && (
                            <p className="text-title text-surface-on">
                                {answer.headline}
                            </p>
                        )}
                        {answer.subtitle && (
                            <p className="mt-1 text-body-m text-surface-on-variant">
                                {answer.subtitle}
                            </p>
                        )}
                    </div>
                )}

                {answer?.stats && answer.stats.length > 0 && (
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {answer.stats.slice(0, 4).map((stat) => (
                            <div
                                key={stat.label}
                                className="flex flex-col-reverse rounded-card bg-surface-card px-4 py-3"
                            >
                                <dt className="text-label-m text-surface-on-variant">
                                    {stat.label}
                                </dt>
                                <dd className="text-metric tabular-nums text-surface-on">
                                    {stat.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}

                {pendingCount === 0 && (
                    <EmptyState
                        className="!py-8"
                        title={
                            decidedRows.length > 0
                                ? t(
                                      'career.allDecided',
                                      'Tout est décidé pour aujourd’hui'
                                  )
                                : t('career.empty', 'Rien de neuf aujourd’hui')
                        }
                        hint={
                            decidedRows.length > 0
                                ? undefined
                                : t(
                                      'career.emptyHint',
                                      'L’agent passe chaque matin : ses relances, offres et tâches apparaîtront ici.'
                                  )
                        }
                    />
                )}

                {openFollowups.length > 0 && (
                    <Section
                        id="followups"
                        title={t('career.followups.title', 'Relances')}
                        count={openFollowups.length}
                    >
                        <ul className="divide-y divide-outline-variant/50">
                            {openFollowups.map(renderFollowup)}
                        </ul>
                    </Section>
                )}

                {openOffers.length > 0 && (
                    <Section
                        id="offers"
                        title={t('career.offers.title', 'Offres à décider')}
                        count={openOffers.length}
                    >
                        <ul className="space-y-2">
                            {openOffers.map(renderOffer)}
                        </ul>
                    </Section>
                )}

                {openTasks.length > 0 && (
                    <Section
                        id="tasks"
                        title={t('career.tasks.title', 'Tâches proposées')}
                        count={openTasks.length}
                    >
                        <ul className="divide-y divide-outline-variant/50">
                            {openTasks.map(renderTask)}
                        </ul>
                    </Section>
                )}

                {decidedRows.length > 0 && (
                    <section data-testid="career-decided">
                        <button
                            type="button"
                            aria-expanded={decidedOpen}
                            aria-controls="career-decided-list"
                            onClick={() => setDecidedOpen((value) => !value)}
                            className="-mx-2 flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-label text-surface-on-variant transition-colors duration-150 hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:min-h-[44px]"
                        >
                            <ChevronRightIcon
                                aria-hidden="true"
                                className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${decidedOpen ? 'rotate-90' : ''}`}
                            />
                            {t('career.decided', 'Décidé ({{count}})', {
                                count: decidedRows.length,
                            })}
                        </button>
                        {decidedOpen && (
                            <ul id="career-decided-list" className="mt-1">
                                {decidedRows.map((row) => {
                                    const [labelKey, fallback] = stateLabelOf(
                                        row.decision
                                    );
                                    return (
                                        <li
                                            key={row.key}
                                            className="flex items-baseline justify-between gap-3 py-1.5 text-body-m"
                                        >
                                            <span className="min-w-0 truncate text-surface-on-variant">
                                                {row.title}
                                            </span>
                                            <span className="shrink-0 text-label-m text-surface-on-variant">
                                                {t(labelKey, fallback)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                )}
            </div>
            {staged.size > 0 && (
                <div className="sticky bottom-0 z-10 border-t border-outline-variant/50 bg-surface-card">
                    <div
                        className={`${PAGE_GUTTER} flex flex-wrap items-center justify-end gap-2 py-3`}
                    >
                        {submitError && (
                            <p
                                role="alert"
                                className="mr-auto text-body-m text-danger"
                            >
                                {submitError}
                            </p>
                        )}
                        <Button
                            variant="ghost"
                            disabled={submitting}
                            onClick={clearStaged}
                        >
                            {t('career.clear', 'Effacer')}
                        </Button>
                        <Button
                            variant="primary"
                            disabled={submitting}
                            aria-keyshortcuts="Control+Enter Meta+Enter"
                            onClick={validate}
                        >
                            {t('career.validate', 'Valider ({{count}})', {
                                count: staged.size,
                            })}
                        </Button>
                    </div>
                </div>
            )}
        </PageShell>
    );
};

export default CareerPage;
