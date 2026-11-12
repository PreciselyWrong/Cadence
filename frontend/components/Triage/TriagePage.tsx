import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { answerBriefQuestion } from '../../utils/dailyBriefService';
import { getTodayDateString } from '../../utils/dateUtils';
import {
    answerSlot,
    applyTriage,
    decideMail,
    MailDecision,
    MailPayload,
    fetchTriageQueue,
    keepTask,
    LinkReviewDecision,
    reviewLink,
    TriageAction,
    TriageItem,
    TriageQueue,
    TriageTask,
} from '../../utils/triageService';
import { useToast } from '../Shared/ToastContext';
import { deferDelete } from '../../utils/deferredDelete';
import ClassifyCard from '../AutoClassify/ClassifyCard';
import DuplicateCard from '../AutoClassify/DuplicateCard';
import MailCard from './MailCard';
import {
    applyClassifySuggestion,
    ClassifyPayload,
    dismissClassifySuggestion,
    DuplicatePayload,
} from '../../utils/autoClassifyService';

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
    'min-h-[40px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const secondary = `${buttonBase} text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800`;
const primary = `${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`;
const field =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900';

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

    useEffect(() => {
        fetchTriageQueue()
            .then(setQueue)
            .catch(() =>
                showErrorToast(
                    t('triage.error', 'La file n’a pas pu être lue.')
                )
            );
    }, [t, showErrorToast]);

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
    const task = item?.task_uid ? queue?.tasks[item.task_uid] : undefined;
    // A card of the classifier (modules/auto-classify): a task, note or link.
    const classifier = item?.source === 'classify';
    const linkReview = item?.type === 'link_review';
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

    const review = (decision: LinkReviewDecision, message: string) =>
        settle(
            () => reviewLink(String(item?.payload?.link_uid), decision),
            message
        );

    const MAIL_DONE: Record<MailDecision, [string, string]> = {
        task: ['triage.mail.taskCreated', 'Tâche créée'],
        reply: ['triage.mail.replied', 'Réponse ouverte dans Gmail'],
        later: ['triage.mail.postponed', 'Revient demain'],
        dismiss: ['triage.mail.dismissed', 'Mail ignoré'],
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
                answerBriefQuestion(getTodayDateString(), {
                    question_key: item?.question?.key as string,
                    target: item?.question?.target as {
                        scope: string;
                        ref: string;
                    },
                    answer: text,
                    idempotency_key: `triage-answer:${item?.key}`,
                } as Parameters<typeof answerBriefQuestion>[1]),
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
        if (
            !item ||
            item.action === 'question' ||
            item.action === 'accept_slot'
        ) {
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

    return (
        <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 sm:px-6 sm:pb-8">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
                {t('triage.title', 'À trier')}
            </h1>
            {items.length > 0 && (
                <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300">
                    {t('triage.left', '{{count}} à voir', {
                        count: items.length,
                    })}
                </p>
            )}
            {queue && !item && (
                <div className="py-10 text-center" data-testid="triage-empty">
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                        {t('triage.emptyTitle', 'Rien à trier')}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            'triage.emptyMessage',
                            'Une proposition n’apparaît que si elle est utile.'
                        )}
                    </p>
                </div>
            )}
            {item && (
                <article
                    className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                    data-testid="triage-card"
                >
                    {linkReview && (
                        <>
                            <h2 className="text-[17px] font-semibold text-gray-900 dark:text-gray-50">
                                {String(
                                    item.payload?.title || item.payload?.url
                                )}
                            </h2>
                            <a
                                href={String(item.payload?.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 block break-all text-[13px] text-indigo-600 hover:underline dark:text-indigo-300"
                            >
                                {String(item.payload?.url)}
                            </a>
                        </>
                    )}
                    {classifier && !task && (
                        <>
                            <h2 className="text-[17px] font-semibold text-gray-900 dark:text-gray-50">
                                {String(item.payload?.title ?? '')}
                            </h2>
                            <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">
                                {entityLabel(item.payload?.entity)}
                            </p>
                        </>
                    )}
                    {task && (
                        <>
                            <h2 className="text-[17px] font-semibold text-gray-900 dark:text-gray-50">
                                {task.name}
                            </h2>
                            <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">
                                {[
                                    task.due_date,
                                    task.project_name,
                                    task.recurring
                                        ? t('triage.recurring', 'récurrente')
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
                        <p className="mt-2 text-[15px] text-gray-900 dark:text-gray-100">
                            {item.type === 'classify'
                                ? t(
                                      'autoClassify.card.reason',
                                      'Classement à confirmer'
                                  )
                                : item.type === 'link_duplicate'
                                  ? t(
                                        'autoClassify.duplicate.reason',
                                        'Lien déjà enregistré ?'
                                    )
                                  : linkReview
                                    ? t('triage.linkReview', 'Lien à revoir')
                                    : (item.question?.text ?? item.reason)}
                        </p>
                    )}
                    {item.details.map((line) => (
                        <p
                            key={line}
                            className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300"
                        >
                            {line}
                        </p>
                    ))}

                    {item.action === 'accept_slot' && (
                        <>
                            <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300">
                                {String(item.payload?.title)} ·{' '}
                                {String(item.payload?.date)}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={primary}
                                    onClick={() =>
                                        settle(
                                            () =>
                                                answerSlot(
                                                    String(
                                                        item.payload?.slot_id
                                                    ),
                                                    true
                                                ),
                                            applied
                                        )
                                    }
                                >
                                    {t('triage.slotAccept', 'Planifier')}
                                </button>
                                <button
                                    type="button"
                                    className={secondary}
                                    onClick={() =>
                                        settle(
                                            () =>
                                                answerSlot(
                                                    String(
                                                        item.payload?.slot_id
                                                    ),
                                                    false
                                                ),
                                            applied
                                        )
                                    }
                                >
                                    {t('triage.slotRefuse', 'Refuser')}
                                </button>
                            </div>
                        </>
                    )}
                    {item.type === 'classify' && (
                        <ClassifyCard
                            key={item.key}
                            payload={item.payload as unknown as ClassifyPayload}
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
                                            String(item.payload?.suggestion_uid)
                                        ),
                                    t('triage.kept', 'Gardée telle quelle')
                                )
                            }
                        />
                    )}
                    {item.type === 'link_duplicate' && (
                        <DuplicateCard
                            payload={
                                item.payload as unknown as DuplicatePayload
                            }
                            onChoose={(action) =>
                                settle(
                                    () =>
                                        applyClassifySuggestion(
                                            String(
                                                item.payload?.suggestion_uid
                                            ),
                                            { action }
                                        ),
                                    applied
                                )
                            }
                        />
                    )}
                    {linkReview && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={primary}
                                onClick={() =>
                                    review(
                                        'keep',
                                        t('triage.linkKept', 'Lien gardé')
                                    )
                                }
                            >
                                {t('triage.linkKeep', 'Garder')}
                            </button>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() =>
                                    review(
                                        'archive',
                                        t('triage.linkArchived', 'Lien archivé')
                                    )
                                }
                            >
                                {t('triage.linkArchive', 'Archiver')}
                            </button>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() =>
                                    review(
                                        'later',
                                        t(
                                            'triage.linkPostponed',
                                            'À revoir dans 30 jours'
                                        )
                                    )
                                }
                            >
                                {t('triage.linkLater', 'Dans 30 jours')}
                            </button>
                        </div>
                    )}
                    {item.action === 'accept_slot' ||
                    classifier ||
                    linkReview ||
                    mail ? null : item.question ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={secondary}
                                onClick={() => answer('yes')}
                            >
                                {t('dailyBrief.anticipate.yes', 'Oui')}
                            </button>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() => answer('no')}
                            >
                                {t('dailyBrief.anticipate.no', 'Non')}
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
                                onClick={() => setCorrecting((open) => !open)}
                            >
                                {t('triage.correct', 'Corriger')}
                            </button>
                            <button
                                type="button"
                                className={secondary}
                                onClick={() =>
                                    settle(
                                        () => keepTask(item.task_uid as string),
                                        t('triage.kept', 'Gardée telle quelle')
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
                        <div className="mt-3 flex flex-col items-start border-t border-gray-200 pt-2 dark:border-gray-700">
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
                            className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700"
                        >
                            <label className="text-sm text-gray-700 dark:text-gray-200">
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
                            <button type="submit" className={`${primary} mt-2`}>
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
    );
};

export default TriagePage;
