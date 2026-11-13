import PageShell from '../Shared/ui/PageShell';
import EmptyState from '../Shared/ui/EmptyState';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
    answerQuestion,
    applyTriage,
    decideMail,
    MailDecision,
    MailPayload,
    fetchTriageQueue,
    keepTask,
    TriageAction,
    TriageItem,
    TriageQueue,
    TriageTask,
} from '../../utils/triageService';
import { useToast } from '../Shared/ToastContext';
import { deferDelete } from '../../utils/deferredDelete';
import ClassifyCard from '../AutoClassify/ClassifyCard';
import MailCard from './MailCard';
import MailDeck from './MailDeck';
import PageHeader from '../Shared/ui/PageHeader';
import {
    applyClassifySuggestion,
    ClassifyPayload,
    dismissClassifySuggestion,
} from '../../utils/autoClassifyService';
import PluginActions from '../Plugins/PluginActions';
import Button from '../Shared/ui/Button';

const ACTION_LABELS: Record<TriageAction, [string, string]> = {
    rename: ['triage.action.rename', 'Renommer'],
    split: ['triage.action.split', 'Découper en sous-tâches'],
    set_due: ['triage.action.due', 'Changer l’échéance'],
    done: ['triage.action.done', 'Marquer comme faite'],
    cancel: ['triage.action.cancel', 'Annuler la tâche'],
    delete: ['triage.action.delete', 'Supprimer'],
    reclass: ['triage.action.reclass', 'Classer'],
    to_note: ['triage.action.note', 'Convertir en note'],
    to_project: ['triage.action.project', 'Convertir en projet'],
    to_habit: ['triage.action.habit', 'Convertir en habitude'],
};

// A series stays a series: it is neither converted nor deleted from here.
const choicesFor = (task: TriageTask): TriageAction[] =>
    task.recurring
        ? ['rename', 'set_due', 'done', 'cancel']
        : [
              'rename',
              'set_due',
              'done',
              'cancel',
              'split',
              'to_note',
              'to_project',
              'to_habit',
              'delete',
          ];

const needsValue = (action: TriageAction) =>
    action === 'rename' || action === 'split' || action === 'set_due';

const buttonBase =
    'h-9 rounded-lg px-3.5 text-body-m font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 max-sm:min-h-[44px]';
const secondary = `${buttonBase} text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high`;
const primary = `${buttonBase} bg-primary text-primary-on hover:bg-primary/90`;
const field =
    'mt-1 w-full rounded-lg border-0 bg-surface-high/70 px-3 py-2 text-body-m text-surface-on focus:ring-2 focus:ring-primary/40';

// One proposal at a time with its reason: validate, correct, keep or skip.
const TriagePage: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast, showUndoToast } = useToast();
    const [queue, setQueue] = useState<TriageQueue | null>(null);
    const [gone, setGone] = useState<Set<string>>(new Set());
    const [skipped, setSkipped] = useState<string[]>([]);
    const [correcting, setCorrecting] = useState(false);
    const [editing, setEditing] = useState<TriageAction | null>(null);
    const [value, setValue] = useState('');
    const [deckOpen, setDeckOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const load = useCallback(
        () =>
            fetchTriageQueue()
                .then(setQueue)
                .catch(() =>
                    showErrorToast(
                        t('triage.error', 'La file n’a pas pu être lue.')
                    )
                ),
        [t, showErrorToast]
    );
    useEffect(() => {
        load();
    }, [load]);

    // A « N mails à trier » notification opens the deck straight away; the
    // parameter is taken off, so closing the deck stays closed.
    useEffect(() => {
        if (!queue || searchParams.get('deck') !== 'mail') return;
        if (queue.items.some((entry) => entry.type === 'mail')) {
            setDeckOpen(true);
        }
        setSearchParams({}, { replace: true });
    }, [queue, searchParams, setSearchParams]);

    const items = useMemo(
        () =>
            [...(queue?.items ?? [])]
                .filter((item) => !gone.has(item.key))
                .sort(
                    (a, b) => skipped.indexOf(a.key) - skipped.indexOf(b.key)
                ),
        [queue, gone, skipped]
    );
    const item: TriageItem | undefined = items[0];
    const mailCount = items.filter((entry) => entry.type === 'mail').length;
    const task = item?.task_uid ? queue?.tasks[item.task_uid] : undefined;
    // A card of the classifier (modules/auto-classify): a task, note or link.
    const classifier = item?.source === 'classify';
    const mail = item?.type === 'mail';
    const entityLabel = (entity: unknown) =>
        entity === 'note'
            ? t('autoClassify.entity.note', 'Note')
            : entity === 'link'
              ? t('autoClassify.entity.link', 'Lien')
              : t('autoClassify.entity.task', 'Tâche');

    const reset = () => {
        setCorrecting(false);
        setEditing(null);
        setValue('');
    };

    const settle = async (run: () => Promise<unknown>, message: string) => {
        if (!item) return;
        try {
            await run();
            setGone((prev) => new Set(prev).add(item.key));
            reset();
            showSuccessToast(message);
        } catch (error) {
            // Settled on another device meanwhile: the card has nothing left
            // to ask.
            if ((error as { status?: number })?.status === 409) {
                setGone((prev) => new Set(prev).add(item.key));
                reset();
                showErrorToast(
                    t('triage.alreadySettled', 'Déjà traité ailleurs.')
                );
                return;
            }
            showErrorToast(
                t('triage.actionError', 'Action impossible, réessayez.')
            );
        }
    };

    // A delete waits for the undo window, like everywhere else.
    const deleteLater = () => {
        if (!item?.task_uid) return;
        const { key, task_uid: taskUid } = item;
        const restore = () =>
            setGone((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        setGone((prev) => new Set(prev).add(key));
        reset();
        const undo = deferDelete(
            `triage:${taskUid}`,
            () => applyTriage(taskUid, 'delete', null),
            () => {
                restore();
                showErrorToast(
                    t('triage.actionError', 'Action impossible, réessayez.')
                );
            }
        );
        showUndoToast(t('triage.deleted', 'Tâche supprimée'), () => {
            if (undo()) restore();
        });
    };

    const MAIL_DONE: Record<MailDecision, [string, string]> = {
        task: ['triage.mail.taskCreated', 'Tâche créée'],
        reply: ['triage.mail.replied', 'Réponse ouverte dans Gmail'],
        later: ['triage.mail.postponed', 'Revient demain'],
        event: ['triage.mail.eventRequested', 'Rendez-vous demandé à l’agent'],
        dismiss: ['triage.mail.dismissed', 'Mail ignoré'],
        draft: [
            'triage.mail.draftRequested',
            'Brouillon en préparation dans Gmail',
        ],
        archive: ['triage.mail.archiveRequested', 'Archivage demandé'],
        note: ['triage.mail.noteSent', 'Renvoyé au Trieur'],
    };
    // The decision stands even when Gmail did not archive the thread.
    const decide = (
        decision: MailDecision,
        payload: Record<string, unknown>,
        archive: boolean
    ) =>
        settle(
            async () => {
                const outcome = await decideMail(
                    String(item?.payload?.mail_uid),
                    decision,
                    payload,
                    archive
                );
                if (archive && outcome?.archived === false) {
                    showErrorToast(
                        t('triage.mail.notArchived', 'Pas archivé dans Gmail')
                    );
                }
            },
            t(MAIL_DONE[decision][0], MAIL_DONE[decision][1])
        );

    const applied = t('triage.applied', 'C’est fait');
    const apply = (
        action: TriageAction,
        payload: Record<string, unknown> | null
    ) =>
        action === 'delete'
            ? deleteLater()
            : settle(
                  () => applyTriage(item?.task_uid as string, action, payload),
                  applied
              );

    const answer = (text: string) =>
        settle(
            () =>
                answerQuestion(
                    item?.question?.target as { scope: string; ref: string },
                    text
                ),
            t('triage.answered', 'Réponse enregistrée')
        );

    const choose = (action: TriageAction) => {
        if (!needsValue(action)) {
            apply(action, null);
            return;
        }
        setEditing(action);
        setValue(action === 'rename' ? (task?.name ?? '') : '');
    };

    const submitEdit = (event: React.FormEvent) => {
        event.preventDefault();
        const text = value.trim();
        if (!text || !editing) return;
        if (editing === 'rename') apply('rename', { name: text });
        if (editing === 'set_due') apply('set_due', { due_date: text });
        if (editing === 'split') {
            apply('split', {
                subtasks: text
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
            });
        }
    };

    const primaryLabel = () => {
        if (!item || item.action === 'question') {
            return '';
        }
        const name = item.payload?.name;
        if (item.action === 'rename' && typeof name === 'string') {
            return t('triage.renameTo', 'Renommer : {{name}}', { name });
        }
        const due = item.payload?.due_date;
        if (item.action === 'set_due' && typeof due === 'string') {
            return t('triage.dueOn', 'Échéance : {{date}}', { date: due });
        }
        const [key, fallback] = ACTION_LABELS[item.action];
        return t(key, fallback);
    };

    // Full screen: the page under it is not rendered, so nothing behind the
    // deck takes the focus or the keys.
    if (deckOpen && queue) {
        return (
            <MailDeck
                items={items}
                archiveAvailable={queue.mail_archive === true}
                onClose={(sent) => {
                    setDeckOpen(false);
                    // The queue again, once the last decision is in.
                    sent.finally(load);
                }}
            />
        );
    }

    return (
        <PageShell template="list" className="pb-28 sm:pb-12">
            <PageHeader
                title={t('triage.title', 'À trier')}
                actions={
                    <>
                        {mailCount > 0 && (
                            <Button
                                variant="primary"
                                data-testid="triage-mail-deck"
                                onClick={() => setDeckOpen(true)}
                            >
                                {t(
                                    'triage.deck.open',
                                    'Trier mes mails ({{count}})',
                                    { count: mailCount }
                                )}
                            </Button>
                        )}
                        <PluginActions place="triage" />
                    </>
                }
                meta={
                    items.length > 0
                        ? t('triage.left', '{{count}} à voir', {
                              count: items.length,
                          })
                        : undefined
                }
            />
            <div className="px-6 max-sm:px-4">
                {queue && !item && (
                    <EmptyState
                        data-testid="triage-empty"
                        title={t('triage.emptyTitle', 'Rien à trier')}
                        hint={t(
                            'triage.emptyMessage',
                            'Une proposition n’apparaît que si elle est utile.'
                        )}
                    />
                )}
                {item && (
                    <article
                        className="mt-4 rounded-2xl bg-surface-low p-5 ring-1 ring-inset ring-outline-variant/60"
                        data-testid="triage-card"
                    >
                        {classifier && !task && (
                            <>
                                <h2 className="text-title-m font-semibold text-surface-on">
                                    {String(item.payload?.title ?? '')}
                                </h2>
                                <p className="mt-0.5 text-body-m text-surface-on-variant">
                                    {entityLabel(item.payload?.entity)}
                                </p>
                            </>
                        )}
                        {task && (
                            <>
                                <h2 className="text-title-m font-semibold text-surface-on">
                                    {task.name}
                                </h2>
                                <p className="mt-0.5 text-body-m text-surface-on-variant">
                                    {[
                                        task.due_date,
                                        task.project_name,
                                        task.recurring
                                            ? t(
                                                  'triage.recurring',
                                                  'récurrente'
                                              )
                                            : null,
                                        ...task.tags.map((tag) => `#${tag}`),
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            </>
                        )}
                        {mail && (
                            <MailCard
                                key={item.key}
                                payload={item.payload as unknown as MailPayload}
                                archiveAvailable={queue?.mail_archive === true}
                                onDecide={decide}
                            />
                        )}
                        {!mail && (
                            <p className="mt-2 text-body text-surface-on">
                                {item.type === 'classify'
                                    ? t(
                                          'autoClassify.card.reason',
                                          'Classement à confirmer'
                                      )
                                    : (item.question?.text ?? item.reason)}
                            </p>
                        )}
                        {item.details.map((line) => (
                            <p
                                key={line}
                                className="mt-0.5 text-body-m text-surface-on-variant"
                            >
                                {line}
                            </p>
                        ))}

                        {item.type === 'classify' && (
                            <ClassifyCard
                                key={item.key}
                                payload={
                                    item.payload as unknown as ClassifyPayload
                                }
                                onApply={(choice) =>
                                    settle(
                                        () =>
                                            applyClassifySuggestion(
                                                String(
                                                    item.payload?.suggestion_uid
                                                ),
                                                choice
                                            ),
                                        applied
                                    )
                                }
                                onDismiss={() =>
                                    settle(
                                        () =>
                                            dismissClassifySuggestion(
                                                String(
                                                    item.payload?.suggestion_uid
                                                )
                                            ),
                                        t('triage.kept', 'Gardée telle quelle')
                                    )
                                }
                            />
                        )}
                        {classifier || mail ? null : item.question ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={secondary}
                                    onClick={() => answer('yes')}
                                >
                                    {t('triage.yes', 'Oui')}
                                </button>
                                <button
                                    type="button"
                                    className={secondary}
                                    onClick={() => answer('no')}
                                >
                                    {t('triage.no', 'Non')}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={primary}
                                    onClick={() =>
                                        apply(
                                            item.action as TriageAction,
                                            item.payload
                                        )
                                    }
                                >
                                    {primaryLabel()}
                                </button>
                                <button
                                    type="button"
                                    className={secondary}
                                    aria-expanded={correcting}
                                    onClick={() =>
                                        setCorrecting((open) => !open)
                                    }
                                >
                                    {t('triage.correct', 'Corriger')}
                                </button>
                                <button
                                    type="button"
                                    className={secondary}
                                    onClick={() =>
                                        settle(
                                            () =>
                                                keepTask(
                                                    item.task_uid as string
                                                ),
                                            t(
                                                'triage.kept',
                                                'Gardée telle quelle'
                                            )
                                        )
                                    }
                                >
                                    {t('triage.keep', 'Garder telle quelle')}
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            className={`${secondary} mt-2 font-normal`}
                            onClick={() => {
                                reset();
                                setSkipped((prev) => [
                                    ...prev.filter((key) => key !== item.key),
                                    item.key,
                                ]);
                            }}
                        >
                            {t('triage.skip', 'Passer')}
                        </button>

                        {correcting && task && !classifier && !editing && (
                            <div className="mt-3 flex flex-col items-start border-t border-outline-variant/60 pt-2">
                                {choicesFor(task).map((action) => (
                                    <button
                                        key={action}
                                        type="button"
                                        className={secondary}
                                        onClick={() => choose(action)}
                                    >
                                        {t(
                                            ACTION_LABELS[action][0],
                                            ACTION_LABELS[action][1]
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        {editing && (
                            <form
                                onSubmit={submitEdit}
                                className="mt-3 border-t border-outline-variant/60 pt-3"
                            >
                                <label className="text-sm text-surface-on">
                                    {editing === 'split'
                                        ? t(
                                              'triage.splitLabel',
                                              'Une sous-tâche par ligne'
                                          )
                                        : t(
                                              ACTION_LABELS[editing][0],
                                              ACTION_LABELS[editing][1]
                                          )}
                                    {editing === 'split' ? (
                                        <textarea
                                            rows={4}
                                            value={value}
                                            onChange={(event) =>
                                                setValue(event.target.value)
                                            }
                                            className={field}
                                        />
                                    ) : (
                                        <input
                                            type={
                                                editing === 'set_due'
                                                    ? 'date'
                                                    : 'text'
                                            }
                                            value={value}
                                            onChange={(event) =>
                                                setValue(event.target.value)
                                            }
                                            className={field}
                                        />
                                    )}
                                </label>
                                <button
                                    type="submit"
                                    className={`${primary} mt-2`}
                                >
                                    {t(
                                        ACTION_LABELS[editing][0],
                                        ACTION_LABELS[editing][1]
                                    )}
                                </button>
                            </form>
                        )}
                    </article>
                )}
            </div>
        </PageShell>
    );
};

export default TriagePage;
