import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toggleTaskCompletion, updateTask } from '../../utils/tasksService';
import { decideTask } from '../../utils/reviewService';
import { Task } from '../../entities/Task';
import { getUserTimezone } from '../../utils/dateUtils';
import { openTaskPanel } from '../../store/taskPanelStore';
import { useToast } from '../Shared/ToastContext';
import {
    BriefAnticipate,
    BriefMove,
    BriefSettings,
    BriefTaskState,
    DailyBriefResponse,
    DailyEveningResponse,
    answerBriefQuestion,
    fetchBriefSettings,
    fetchDailyBrief,
    fetchDailyEvening,
    recordBriefDecision,
    regenerateDailyBrief,
} from '../../utils/dailyBriefService';
import {
    carryOverTasks,
    fetchDailyPlan,
    saveDailyPlanItems,
    toPlanItemInputs,
} from '../../utils/dailyPlanService';
import BriefTimeline from './BriefTimeline';
import BriefEvening, { BriefEveningActions } from './BriefEvening';
import { EveningHandled } from './BriefEveningRow';
import {
    capitalizeFirst,
    isEveningTime,
    localClock,
    nextDay,
    shortDay,
} from './briefTime';
import {
    AnticipateSection,
    BriefActions,
    BriefSectionProps,
    InboxSection,
    MovesSection,
    RepliesSection,
    ResolvedSection,
    SectionTitle,
    TonightSection,
} from './BriefSections';
import { isTaskCompleted, TASK_STATUS } from '../../constants/taskStatus';

// Every idempotency key is unique per user action.
const newKey = (prefix: string) =>
    `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const localeOf = (language: string | undefined) => language || 'en';

// The map with `uid` set to `value`, or without `uid` when `value` is undefined.
const withRow = <T,>(
    map: Record<string, T>,
    uid: string,
    value: T | undefined
): Record<string, T> => {
    const next = { ...map };
    if (value === undefined) delete next[uid];
    else next[uid] = value;
    return next;
};

const SKELETON = (
    <div className="animate-pulse space-y-4" data-testid="brief-skeleton">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-7 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
    </div>
);

const BriefPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { showUndoToast, showSuccessToast, showErrorToast } = useToast();
    // The day and the time are read in the profile's timezone: the evening
    // review switches at the configured time of that clock.
    const [clock] = useState(() => localClock(new Date(), getUserTimezone()));
    const date = clock.date;
    const locale = localeOf(i18n?.language);

    const [data, setData] = useState<DailyBriefResponse | null>(null);
    const [settings, setSettings] = useState<BriefSettings | null>(null);
    const [view, setView] = useState<'morning' | 'evening'>('morning');
    const [evening, setEvening] = useState<DailyEveningResponse | null>(null);
    const [eveningError, setEveningError] = useState(false);
    const [handled, setHandled] = useState<Record<string, EveningHandled>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    // Optimistic task state on top of the fetched one (completions, moves).
    const [overrides, setOverrides] = useState<Record<string, BriefTaskState>>(
        {}
    );
    const [hiddenMoves, setHiddenMoves] = useState<Set<string>>(new Set());
    const [answered, setAnswered] = useState<Record<string, string>>({});

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        Promise.all([fetchDailyBrief(date), fetchBriefSettings()])
            .then(([brief, briefSettings]) => {
                setData(brief);
                setSettings(briefSettings);
                setView(
                    isEveningTime(briefSettings.evening, clock.minute)
                        ? 'evening'
                        : 'morning'
                );
                setEvening(null);
                setEveningError(false);
                setHandled({});
                setOverrides({});
                setHiddenMoves(new Set());
                setAnswered({});
            })
            .catch((error: Error) =>
                setLoadError(
                    error?.message ||
                        t(
                            'dailyBrief.loadError',
                            'Impossible de charger le résumé.'
                        )
                )
            )
            .finally(() => setLoading(false));
    }, [date, clock.minute, t]);

    useEffect(() => {
        load();
    }, [load]);

    // The evening review is fetched when it is shown, and kept for the page.
    useEffect(() => {
        if (view !== 'evening' || evening || !settings?.evening.enabled) return;
        let cancelled = false;
        fetchDailyEvening(date)
            .then((response) => {
                if (!cancelled) setEvening(response);
            })
            .catch(() => {
                if (!cancelled) setEveningError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [view, date, evening, settings]);

    const tasks = useMemo<Record<string, BriefTaskState>>(
        () => ({
            ...(data?.tasks ?? {}),
            ...(evening?.tasks ?? {}),
            ...overrides,
        }),
        [data, evening, overrides]
    );

    const regenerate = async () => {
        setGenerating(true);
        try {
            const next = await regenerateDailyBrief(date);
            setData(next);
            setOverrides({});
            setHiddenMoves(new Set());
            setAnswered({});
        } catch (error) {
            showErrorToast(
                (error as Error)?.message ||
                    t('dailyBrief.generateError', 'La génération a échoué.')
            );
        } finally {
            setGenerating(false);
        }
    };

    const toggle = async (uid: string) => {
        const current = tasks[uid];
        if (!current) return;
        try {
            const updated: Task = await toggleTaskCompletion(uid);
            const next: BriefTaskState = {
                ...current,
                status: updated.status,
                completed_at: updated.completed_at ?? null,
            };
            setOverrides((prev) => ({ ...prev, [uid]: next }));
            const nowDone = isTaskCompleted(updated.status);
            const message = nowDone
                ? t('dailyBrief.task.done', '« {{name}} » terminée', {
                      name: current.name,
                  })
                : t('dailyBrief.task.reopened', '« {{name}} » rouverte', {
                      name: current.name,
                  });
            showUndoToast(message, async () => {
                try {
                    await updateTask(uid, {
                        status: current.status as Task['status'],
                        completed_at: null,
                    });
                    setOverrides((prev) => ({ ...prev, [uid]: current }));
                } catch {
                    showErrorToast(
                        t(
                            'dailyBrief.task.error',
                            'Impossible de modifier la tâche.'
                        )
                    );
                }
            });
        } catch {
            showErrorToast(
                t('dailyBrief.task.error', 'Impossible de modifier la tâche.')
            );
        }
    };

    // Adds the task to tomorrow's plan. Undo takes it off again, but only when
    // this action added it: a task already planned for tomorrow is left alone.
    const carryToTomorrow = async (uid: string) => {
        const name = tasks[uid]?.name ?? '';
        const tomorrow = nextDay(date);
        const message = t(
            'dailyBrief.evening.carryDone',
            '« {{name}} » reportée à demain',
            { name }
        );
        try {
            const plan = await fetchDailyPlan(tomorrow);
            const alreadyPlanned = (plan.plan?.items ?? []).some(
                (item) => item.task_uid === uid
            );
            if (alreadyPlanned) {
                setHandled((prev) => withRow(prev, uid, { kind: 'tomorrow' }));
                showSuccessToast(message);
                return;
            }
            await carryOverTasks(tomorrow, [uid]);
        } catch {
            showErrorToast(
                t(
                    'dailyBrief.evening.carryError',
                    'Impossible de reporter la tâche.'
                )
            );
            return;
        }
        setHandled((prev) => withRow(prev, uid, { kind: 'tomorrow' }));
        showUndoToast(message, async () => {
            try {
                const current = await fetchDailyPlan(tomorrow);
                const items = (current.plan?.items ?? []).filter(
                    (item) => item.task_uid !== uid
                );
                await saveDailyPlanItems(tomorrow, toPlanItemInputs(items));
                setHandled((prev) => withRow(prev, uid, undefined));
            } catch {
                showErrorToast(
                    t(
                        'dailyBrief.evening.carryError',
                        'Impossible de reporter la tâche.'
                    )
                );
            }
        });
    };

    // One evening action on a row: the row shows its new state at once, and the
    // undo restores the server and the row as they were.
    const changeEveningRow = async (
        uid: string,
        change: {
            handled: EveningHandled;
            message: string;
            apply: () => Promise<Partial<BriefTaskState>>;
            revert: (current: BriefTaskState) => Promise<unknown>;
        }
    ) => {
        const current = tasks[uid];
        if (!current) return;
        const previous = handled[uid];
        let patch: Partial<BriefTaskState>;
        try {
            patch = await change.apply();
        } catch {
            showErrorToast(
                t('dailyBrief.task.error', 'Impossible de modifier la tâche.')
            );
            return;
        }
        setOverrides((prev) => ({
            ...prev,
            [uid]: { ...current, ...patch },
        }));
        setHandled((prev) => withRow(prev, uid, change.handled));
        showUndoToast(change.message, async () => {
            try {
                await change.revert(current);
                setOverrides((prev) => ({ ...prev, [uid]: current }));
                setHandled((prev) => withRow(prev, uid, previous));
            } catch {
                showErrorToast(
                    t(
                        'dailyBrief.task.error',
                        'Impossible de modifier la tâche.'
                    )
                );
            }
        });
    };

    const setEveningDue = (uid: string, date: string) =>
        changeEveningRow(uid, {
            handled: { kind: 'due', date },
            message: t(
                'dailyBrief.evening.dueDone',
                '« {{name}} » échéance {{date}}',
                {
                    name: tasks[uid]?.name ?? '',
                    date: shortDay(date, locale),
                }
            ),
            apply: async () => {
                await updateTask(uid, { due_date: date } as Partial<Task>);
                return { due_date: date };
            },
            revert: (current) =>
                updateTask(uid, {
                    due_date: current.due_date,
                } as Partial<Task>),
        });

    const parkEveningTask = (uid: string) =>
        changeEveningRow(uid, {
            handled: { kind: 'later' },
            message: t(
                'dailyBrief.evening.laterDone',
                '« {{name}} » mise de côté',
                { name: tasks[uid]?.name ?? '' }
            ),
            apply: async () => {
                await decideTask(uid, { later: true });
                return {};
            },
            revert: () => decideTask(uid, { later: false }),
        });

    const cancelEveningTask = (uid: string) =>
        changeEveningRow(uid, {
            handled: { kind: 'cancelled' },
            message: t(
                'dailyBrief.evening.cancelDone',
                '« {{name}} » abandonnée',
                { name: tasks[uid]?.name ?? '' }
            ),
            apply: async () => {
                await updateTask(uid, {
                    status: TASK_STATUS.CANCELLED,
                } as Partial<Task>);
                return { status: TASK_STATUS.CANCELLED };
            },
            revert: (current) =>
                updateTask(uid, {
                    status: current.status as Task['status'],
                }),
        });

    const acceptMove = async (move: BriefMove) => {
        const current = tasks[move.task_uid];
        if (!current) return;
        try {
            await updateTask(move.task_uid, {
                due_date: move.to,
            } as Partial<Task>);
            await recordBriefDecision(date, {
                kind: 'move',
                target_type: 'task',
                target_ref: move.task_uid,
                decision: 'accepted',
                proposal: { from: move.from, to: move.to },
                fingerprint: move.proposal_key,
                idempotency_key: newKey('move-accepted'),
            });
        } catch {
            showErrorToast(
                t('dailyBrief.task.error', 'Impossible de modifier la tâche.')
            );
            return;
        }
        setOverrides((prev) => ({
            ...prev,
            [move.task_uid]: { ...current, due_date: move.to },
        }));
        setHiddenMoves((prev) => new Set(prev).add(move.proposal_key));
        showUndoToast(
            t('dailyBrief.moves.moved', '« {{name}} » déplacée', {
                name: current.name,
            }),
            async () => {
                try {
                    await updateTask(move.task_uid, {
                        due_date: current.due_date,
                    } as Partial<Task>);
                    setOverrides((prev) => ({
                        ...prev,
                        [move.task_uid]: current,
                    }));
                    setHiddenMoves((prev) => {
                        const next = new Set(prev);
                        next.delete(move.proposal_key);
                        return next;
                    });
                } catch {
                    showErrorToast(
                        t(
                            'dailyBrief.task.error',
                            'Impossible de modifier la tâche.'
                        )
                    );
                }
            }
        );
    };

    const refuseMove = async (move: BriefMove) => {
        try {
            await recordBriefDecision(date, {
                kind: 'move',
                target_type: 'task',
                target_ref: move.task_uid,
                decision: 'refused',
                proposal: { to: move.to },
                fingerprint: move.proposal_key,
                idempotency_key: newKey('move-refused'),
            });
            setHiddenMoves((prev) => new Set(prev).add(move.proposal_key));
        } catch {
            showErrorToast(
                t(
                    'dailyBrief.decision.error',
                    'Impossible d’enregistrer la décision.'
                )
            );
        }
    };

    const answer = async (item: BriefAnticipate, value: string) => {
        if (!item.question) return;
        const question = item.question;
        setAnswered((prev) => ({ ...prev, [item.key]: value }));
        try {
            await answerBriefQuestion(date, {
                question_key: question.key,
                target: question.target,
                answer: value,
                idempotency_key: newKey('answer'),
            });
        } catch {
            setAnswered((prev) => {
                const next = { ...prev };
                delete next[item.key];
                return next;
            });
            showErrorToast(
                t(
                    'dailyBrief.decision.error',
                    'Impossible d’enregistrer la décision.'
                )
            );
        }
    };

    const feedback = async (
        item: BriefAnticipate,
        vote: 'useful' | 'noise'
    ) => {
        try {
            await recordBriefDecision(date, {
                kind: 'feedback',
                target_type: 'card',
                target_ref: item.key,
                decision: 'accepted',
                proposal: { card_type: item.type, vote },
                idempotency_key: newKey('feedback'),
            });
        } catch {
            showErrorToast(
                t(
                    'dailyBrief.decision.error',
                    'Impossible d’enregistrer la décision.'
                )
            );
        }
    };

    const eveningActions: BriefEveningActions = {
        onToggle: toggle,
        onOpen: (uid: string) => openTaskPanel(uid),
        onTomorrow: carryToTomorrow,
        onSetDue: setEveningDue,
        onLater: parkEveningTask,
        onCancel: cancelEveningTask,
    };

    const actions: BriefActions = {
        onToggle: toggle,
        onOpen: (uid) => openTaskPanel(uid),
        onAcceptMove: acceptMove,
        onRefuseMove: refuseMove,
        onAnswer: answer,
        onFeedback: feedback,
    };

    const renderHeader = () => {
        const brief = data?.brief;
        const dateLabel = new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        }).format(new Date(`${date}T12:00:00`));
        const showVerdict = settings?.sections.includes('verdict') ?? true;
        return (
            <header className="mb-2">
                <p className="text-[13px] text-gray-600 dark:text-gray-300">
                    {capitalizeFirst(dateLabel)}
                </p>
                {brief && showVerdict && (
                    <h2 className="mt-1 text-[22px] font-semibold leading-7 tracking-tight text-gray-900 dark:text-gray-50">
                        {brief.verdict.text}
                    </h2>
                )}
                {brief && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
                        <span>
                            <b className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {brief.counters.overdue}
                            </b>{' '}
                            {t('dailyBrief.counters.overdue', 'en retard')}
                        </span>
                        <span>
                            <b className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {brief.counters.due_today}
                            </b>{' '}
                            {t('dailyBrief.counters.today', "aujourd'hui")}
                        </span>
                    </div>
                )}
            </header>
        );
    };

    const renderSection = (
        id: string,
        brief: NonNullable<DailyBriefResponse['brief']>
    ) => {
        const props: BriefSectionProps = {
            brief,
            tasks,
            locale,
            actions,
            hiddenMoves,
            answered,
        };
        switch (id) {
            case 'timeline':
                if (brief.timeline.length === 0 || !settings) return null;
                return (
                    <section
                        key={id}
                        aria-label={t(
                            'dailyBrief.sectionName.timeline',
                            'Les prochains jours'
                        )}
                    >
                        <SectionTitle
                            title={t(
                                'dailyBrief.sectionName.timeline',
                                'Les prochains jours'
                            )}
                        />
                        <BriefTimeline
                            days={brief.timeline}
                            settings={settings}
                            locale={locale}
                        />
                    </section>
                );
            case 'tonight':
                return <TonightSection key={id} {...props} />;
            case 'moves':
                return <MovesSection key={id} {...props} />;
            case 'anticipate':
                return <AnticipateSection key={id} {...props} />;
            case 'replies':
                return <RepliesSection key={id} {...props} />;
            case 'inbox':
                return <InboxSection key={id} {...props} />;
            case 'resolved':
                return <ResolvedSection key={id} {...props} />;
            default:
                return null;
        }
    };

    const generateButton = (label: string) => (
        <button
            type="button"
            onClick={regenerate}
            disabled={generating}
            className="inline-flex h-10 items-center rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
            {generating ? t('dailyBrief.generating', 'Génération…') : label}
        </button>
    );

    const failed = data?.status === 'failed';

    const renderEvening = () => {
        if (eveningError) {
            return (
                <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                >
                    {t(
                        'dailyBrief.evening.loadError',
                        'Impossible de charger le bilan du soir.'
                    )}
                </p>
            );
        }
        if (!evening || !settings) return SKELETON;
        return (
            <BriefEvening
                evening={evening.evening}
                tasks={tasks}
                settings={settings}
                locale={locale}
                handled={handled}
                actions={eveningActions}
            />
        );
    };

    let body: React.ReactNode;
    if (loading) {
        body = SKELETON;
    } else if (loadError) {
        body = (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {loadError}
            </p>
        );
    } else if (view === 'evening') {
        body = renderEvening();
    } else if (!data?.brief) {
        body = (
            <div className="space-y-4 py-6" data-testid="brief-empty">
                <p className="text-[15px] text-gray-700 dark:text-gray-200">
                    {t(
                        'dailyBrief.empty',
                        "Pas encore de résumé pour aujourd'hui."
                    )}
                </p>
                {failed && (
                    <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                    >
                        {t(
                            'dailyBrief.failed',
                            'La dernière génération a échoué.'
                        )}
                    </p>
                )}
                {generateButton(
                    t('dailyBrief.generateNow', 'Générer maintenant')
                )}
            </div>
        );
    } else {
        const brief = data.brief;
        body = (
            <>
                {failed && (
                    <div
                        role="alert"
                        className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
                    >
                        <span>
                            {t(
                                'dailyBrief.failed',
                                'La dernière génération a échoué. Le résumé précédent est gardé.'
                            )}
                        </span>
                        {generateButton(
                            t('dailyBrief.regenerate', 'Régénérer')
                        )}
                    </div>
                )}
                {(settings?.sections ?? []).map((id) =>
                    renderSection(id, brief)
                )}
            </>
        );
    }

    const viewToggle = settings?.evening.enabled && (
        <div className="mb-2 flex justify-end">
            <button
                type="button"
                onClick={() =>
                    setView((current) =>
                        current === 'evening' ? 'morning' : 'evening'
                    )
                }
                className="min-h-[36px] text-[13px] text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
                {view === 'evening'
                    ? t(
                          'dailyBrief.evening.switchToMorning',
                          'Voir le résumé du matin'
                      )
                    : t(
                          'dailyBrief.evening.switchToEvening',
                          'Voir le bilan du soir'
                      )}
            </button>
        </div>
    );

    return (
        <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 sm:px-6 sm:pb-8">
            {viewToggle}
            {view === 'morning' && data?.brief && renderHeader()}
            {view === 'morning' && !data?.brief && !loading && (
                <div className="mb-2">
                    <p className="text-[13px] text-gray-600 dark:text-gray-300">
                        {date}
                    </p>
                </div>
            )}
            {body}
            {view === 'morning' &&
                !loading &&
                !data?.brief &&
                !loadError &&
                data && (
                    <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                        <Link
                            to="/profile?section=daily-brief"
                            className="underline"
                        >
                            {t('dailyBrief.settingsLink', 'Réglages du résumé')}
                        </Link>
                    </p>
                )}
        </div>
    );
};

export default BriefPage;
