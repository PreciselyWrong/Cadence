import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import NewItemButton from './Shared/NewItemButton';
import BlankSlate from './Shared/BlankSlate';
import { useCan } from '../hooks/useCan';
import { useStore } from '../store/useStore';
import { createGoal, updateGoal } from '../utils/goalsService';
import { updateTask } from '../utils/tasksService';
import { TASK_STATUS } from '../constants/taskStatus';
import { Goal, GoalBucket } from '../entities/Goal';
import GoalModal from './Goal/GoalModal';
import { useToast } from './Shared/ToastContext';
import { onCaptureSaved, openCapture } from '../utils/captureUi';
import { createGoalUrl } from '../utils/slugUtils';
import {
    GOAL_BUCKETS,
    ObjectiveEntry,
    buildGoalsOverview,
    filterGoalsOverview,
    isOverviewEmpty,
    openWishCount,
} from '../utils/goalsOverview';

const BUCKET_FALLBACKS: Record<GoalBucket, string> = {
    have: 'Have',
    be: 'Be',
    do: 'Do',
};

const FOLD_OTHER = 'other-objectives';
const FOLD_DONE = 'done-wishes';

const urlOf = (goal: Goal) =>
    goal.uid ? createGoalUrl({ uid: goal.uid, title: goal.title }) : '/goals';

const CARD_CLASS =
    'rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-800';

const iconButtonClass =
    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200';

// One page, top to bottom: search, active objectives (progress, next step,
// key results), the others folded away, then the wish list in three folding
// groups (Have, Be, Do) with a quick add, and the finished wishes. Same
// layout as Android's Goals tab.
const Goals: React.FC = () => {
    const { t } = useTranslation();
    const {
        goals,
        isLoading: loading,
        hasLoaded,
        loadGoals,
    } = useStore((state: any) => state.goalsStore);
    const { showErrorToast, showUndoToast } = useToast();
    const canCreateGoals = useCan('create_projects');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!hasLoaded && !loading) loadGoals();
    }, [hasLoaded, loading, loadGoals]);

    // A task made from a goal changes its next step and its counts.
    useEffect(
        () =>
            onCaptureSaved(({ items }) => {
                if (items.some((item) => item.target === 'task')) {
                    loadGoals(true);
                }
            }),
        [loadGoals]
    );

    const overview = useMemo(
        () => filterGoalsOverview(buildGoalsOverview(goals), query),
        [goals, query]
    );
    const searching = query.trim().length > 0;
    const isOpen = (key: string) => searching || open.has(key);
    const toggle = (key: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    // The goal stays (it is the dream); the task is its next step, linked
    // to it.
    const createTaskFor = (goal: Goal) => {
        if (goal.id === undefined || !goal.uid) return;
        openCapture('task', null, goal.title, null, {
            id: goal.id,
            uid: goal.uid,
            title: goal.title,
        });
    };

    const completeStep = async (goal: Goal) => {
        const step = goal.next_task;
        if (!step) return;
        try {
            await updateTask(step.uid, { status: TASK_STATUS.DONE });
            await loadGoals(true);
            showUndoToast(
                t('goals.overview.stepDone', '“{{name}}” done', {
                    name: step.name,
                }),
                async () => {
                    await updateTask(step.uid, {
                        status: TASK_STATUS.NOT_STARTED,
                    });
                    loadGoals(true);
                }
            );
        } catch {
            showErrorToast(
                t('goals.overview.error', 'Could not save, try again')
            );
        }
    };

    const setWishStatus = async (wish: Goal, status: Goal['status']) => {
        if (!wish.uid) return;
        await updateGoal(wish.uid, { status });
        await loadGoals(true);
    };

    const markWishDone = async (wish: Goal) => {
        try {
            await setWishStatus(wish, 'achieved');
            showUndoToast(
                t('goals.overview.wishDone', '“{{title}}” fulfilled', {
                    title: wish.title,
                }),
                () => setWishStatus(wish, 'active')
            );
        } catch {
            showErrorToast(
                t('goals.overview.error', 'Could not save, try again')
            );
        }
    };

    const addWish = async (title: string, bucket: GoalBucket) => {
        await createGoal({
            title,
            bucket,
            horizon: 'season',
            status: 'active',
        });
        await loadGoals(true);
    };

    const empty = hasLoaded && isOverviewEmpty(overview);
    const wishCount = openWishCount(overview);

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-24">
            <div className="w-full max-w-3xl mx-auto">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <h2 className="text-2xl font-light">
                        {t('goals.title', 'Goals')}
                    </h2>
                    {canCreateGoals && (
                        <NewItemButton
                            label={t('goals.newGoal', 'New Goal')}
                            onClick={() => setIsCreateOpen(true)}
                            testId="new-goal-button"
                        />
                    )}
                </div>

                <label className="mb-4 flex items-center gap-2 rounded-full bg-gray-100 px-4 dark:bg-gray-800">
                    <MagnifyingGlassIcon
                        className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t(
                            'goals.overview.search',
                            'Search a goal or a wish'
                        )}
                        aria-label={t(
                            'goals.overview.search',
                            'Search a goal or a wish'
                        )}
                        className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-gray-900 placeholder-gray-500 outline-none dark:text-gray-100 dark:placeholder-gray-400 sm:text-sm"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="-mr-2 rounded-full p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400"
                            aria-label={t(
                                'goals.overview.clearSearch',
                                'Clear the search'
                            )}
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    )}
                </label>

                {empty &&
                    (searching ? (
                        <p className="py-6 text-sm text-gray-600 dark:text-gray-300">
                            {t('goals.overview.noMatch', 'Nothing matches.')}
                        </p>
                    ) : (
                        <BlankSlate
                            title={t('goals.noGoalsYet', 'No goals yet.')}
                            hint={t(
                                'goals.blankSlateHint',
                                'A goal is an outcome you want to reach this season or this year, like running a half marathon. Link projects to it to see the work that gets you there.'
                            )}
                            actions={
                                canCreateGoals
                                    ? [
                                          {
                                              label: t(
                                                  'goals.blankSlateNew',
                                                  'Create your first goal'
                                              ),
                                              icon: PlusIcon,
                                              onClick: () =>
                                                  setIsCreateOpen(true),
                                          },
                                      ]
                                    : []
                            }
                        />
                    ))}

                {overview.objectives.length > 0 && (
                    <section
                        aria-label={t('goals.title', 'Goals')}
                        className="mb-6"
                    >
                        <SectionTitle
                            title={t('goals.title', 'Goals')}
                            count={overview.objectives.length}
                        />
                        <div className="space-y-3">
                            {overview.objectives.map((entry) => (
                                <ObjectiveCard
                                    key={entry.goal.uid}
                                    entry={entry}
                                    onCompleteStep={completeStep}
                                    onCreateStep={
                                        canCreateGoals
                                            ? createTaskFor
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </section>
                )}

                {overview.otherObjectives.length > 0 && (
                    <Fold
                        id={FOLD_OTHER}
                        title={t(
                            'goals.overview.other',
                            'Paused, achieved or dropped'
                        )}
                        count={overview.otherObjectives.length}
                        open={isOpen(FOLD_OTHER)}
                        onToggle={toggle}
                    >
                        <div className="space-y-3 pb-2">
                            {overview.otherObjectives.map((entry) => (
                                <ObjectiveCard
                                    key={entry.goal.uid}
                                    entry={entry}
                                    onCompleteStep={completeStep}
                                />
                            ))}
                        </div>
                    </Fold>
                )}

                {!empty &&
                    (wishCount > 0 ||
                        overview.doneWishes.length > 0 ||
                        !searching) && (
                        <section
                            aria-label={t('goals.bucket.title', 'Bucket list')}
                            className="mt-6"
                        >
                            <SectionTitle
                                title={t('goals.bucket.title', 'Bucket list')}
                                count={wishCount}
                            />
                            {GOAL_BUCKETS.map((bucket) => {
                                const wishes = overview.wishes[bucket];
                                if (searching && wishes.length === 0) {
                                    return null;
                                }
                                const label = t(
                                    `goals.bucket.${bucket}`,
                                    BUCKET_FALLBACKS[bucket]
                                );
                                return (
                                    <Fold
                                        key={bucket}
                                        id={bucket}
                                        title={label}
                                        count={wishes.length}
                                        open={isOpen(bucket)}
                                        onToggle={toggle}
                                        testId={`bucket-${bucket}`}
                                    >
                                        <WishList
                                            wishes={wishes}
                                            onDone={markWishDone}
                                            onCreateTask={
                                                canCreateGoals
                                                    ? createTaskFor
                                                    : undefined
                                            }
                                        />
                                        {canCreateGoals && !searching && (
                                            <QuickAddWish
                                                bucket={bucket}
                                                groupLabel={label}
                                                onAdd={addWish}
                                                onError={() =>
                                                    showErrorToast(
                                                        t(
                                                            'goals.overview.error',
                                                            'Could not save, try again'
                                                        )
                                                    )
                                                }
                                            />
                                        )}
                                    </Fold>
                                );
                            })}
                            {overview.doneWishes.length > 0 && (
                                <Fold
                                    id={FOLD_DONE}
                                    title={t(
                                        'goals.overview.doneWishes',
                                        'Fulfilled'
                                    )}
                                    count={overview.doneWishes.length}
                                    open={isOpen(FOLD_DONE)}
                                    onToggle={toggle}
                                >
                                    <WishList
                                        wishes={overview.doneWishes}
                                        done
                                    />
                                </Fold>
                            )}
                        </section>
                    )}
            </div>

            <GoalModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />
        </div>
    );
};

const SectionTitle: React.FC<{ title: string; count: number }> = ({
    title,
    count,
}) => (
    <h3 className="mb-2 flex items-baseline gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
        {title}
        {count > 0 && (
            <span className="text-gray-400 dark:text-gray-500">{count}</span>
        )}
    </h3>
);

interface FoldProps {
    id: string;
    title: string;
    count: number;
    open: boolean;
    onToggle: (id: string) => void;
    testId?: string;
    children: React.ReactNode;
}

// A group that folds: the whole header row toggles it.
const Fold: React.FC<FoldProps> = ({
    id,
    title,
    count,
    open,
    onToggle,
    testId,
    children,
}) => {
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
    return (
        <section aria-label={title} data-testid={testId}>
            <button
                type="button"
                onClick={() => onToggle(id)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-lg py-3 text-left text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800/60"
            >
                <Chevron
                    className="h-4 w-4 flex-shrink-0 text-gray-500"
                    aria-hidden="true"
                />
                <span className="flex-1 text-base">{title}</span>
                {count > 0 && (
                    <span className="pr-1 text-sm text-gray-500 dark:text-gray-400">
                        {count}
                    </span>
                )}
            </button>
            {open && children}
        </section>
    );
};

interface ObjectiveCardProps {
    entry: ObjectiveEntry;
    onCompleteStep: (goal: Goal) => void;
    onCreateStep?: (goal: Goal) => void;
}

// An objective: title and percent, horizon and target date, a thin bar, the
// next step (a box to finish it) and its key results as short rows.
const ObjectiveCard: React.FC<ObjectiveCardProps> = ({
    entry,
    onCompleteStep,
    onCreateStep,
}) => {
    const { t, i18n } = useTranslation();
    const { goal, keyResults } = entry;
    const percent = goal.progress?.percent ?? null;
    const meta = [
        t(`goals.horizon.${goal.horizon}`, goal.horizon),
        goal.target_date
            ? t('goals.overview.target', 'By {{date}}', {
                  date: new Date(
                      `${goal.target_date}T12:00:00`
                  ).toLocaleDateString(i18n.language, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                  }),
              })
            : null,
        goal.status !== 'active'
            ? t(`goals.status.${goal.status}`, goal.status)
            : null,
    ].filter(Boolean);
    const step = goal.next_task;
    const active = goal.status === 'active';

    return (
        <article className={`${CARD_CLASS} p-4`} data-testid="objective-card">
            <div className="flex items-start gap-3">
                <Link
                    to={urlOf(goal)}
                    className="flex-1 text-base font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                    {goal.title}
                </Link>
                {percent !== null && (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {percent} %
                    </span>
                )}
            </div>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                {meta.join(' · ')}
            </p>
            <div
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                role="img"
                aria-label={
                    goal.progress && goal.progress.total > 0
                        ? t('goals.keyResults.progress', {
                              done: goal.progress.done,
                              total: goal.progress.total,
                              defaultValue: '{{done}} of {{total}} done',
                          })
                        : t('goals.overview.nothingLinked', 'Nothing linked')
                }
            >
                <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${percent ?? 0}%` }}
                />
            </div>

            {active && step && (
                <div className="mt-3 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => onCompleteStep(goal)}
                        className="h-5 w-5 flex-shrink-0 rounded-md border-2 border-gray-400 hover:border-blue-500 dark:border-gray-500"
                        aria-label={t('goals.overview.completeStep', {
                            name: step.name,
                            defaultValue: 'Finish “{{name}}”',
                        })}
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('goals.overview.nextStep', 'Next step')}
                        </p>
                        <Link
                            to={`/task/${step.uid}`}
                            className="block truncate text-sm text-gray-900 hover:underline dark:text-gray-100"
                        >
                            {step.name}
                        </Link>
                    </div>
                </div>
            )}
            {active && !step && onCreateStep && (
                <button
                    type="button"
                    onClick={() => onCreateStep(goal)}
                    className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    {t('goals.overview.addStep', 'Add a next step')}
                </button>
            )}

            {keyResults.length > 0 && (
                <ul className="mt-3 space-y-0.5">
                    {keyResults.map((kr) => {
                        const progress = kr.progress;
                        const complete =
                            !!progress &&
                            progress.total > 0 &&
                            progress.done === progress.total;
                        return (
                            <li key={kr.uid}>
                                <Link
                                    to={urlOf(kr)}
                                    className="flex items-center gap-3 rounded-md py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                >
                                    <span
                                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                            complete
                                                ? 'bg-blue-500'
                                                : 'bg-gray-400'
                                        }`}
                                        aria-hidden="true"
                                    />
                                    <span
                                        className={`min-w-0 flex-1 truncate text-sm ${
                                            complete
                                                ? 'text-gray-500 dark:text-gray-400'
                                                : 'text-gray-900 dark:text-gray-100'
                                        }`}
                                    >
                                        {kr.title}
                                    </span>
                                    {complete ? (
                                        <CheckCircleIcon
                                            className="h-4 w-4 text-blue-500"
                                            aria-label={t(
                                                'goals.overview.allDone',
                                                'All done'
                                            )}
                                        />
                                    ) : (
                                        progress &&
                                        progress.total > 0 && (
                                            <span className="text-xs text-gray-600 dark:text-gray-300">
                                                {progress.done}/{progress.total}
                                            </span>
                                        )
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </article>
    );
};

interface WishListProps {
    wishes: Goal[];
    done?: boolean;
    onDone?: (wish: Goal) => void;
    onCreateTask?: (wish: Goal) => void;
}

// Wishes as calm rows: a box to mark it fulfilled, the title (to its page),
// its next step if any, and a button that makes a linked task.
const WishList: React.FC<WishListProps> = ({
    wishes,
    done = false,
    onDone,
    onCreateTask,
}) => {
    const { t } = useTranslation();
    if (wishes.length === 0) return null;
    return (
        <ul
            className={`${CARD_CLASS} mb-2 divide-y divide-gray-100 dark:divide-gray-800`}
        >
            {wishes.map((wish) => {
                const step = wish.next_task;
                const linked = (wish as any).tasks_count ?? 0;
                const subtitle = done
                    ? wish.status === 'dropped'
                        ? t('goals.overview.wishDropped', 'Dropped')
                        : t('goals.overview.wishFulfilled', 'Fulfilled')
                    : step
                      ? t('goals.overview.nextStepInline', {
                            name: step.name,
                            defaultValue: 'Next step: {{name}}',
                        })
                      : linked > 0
                        ? t(
                              'goals.bucket.linkedTasks',
                              'Linked tasks: {{count}}',
                              { count: linked }
                          )
                        : wish.status === 'paused'
                          ? t('goals.status.paused', 'Paused')
                          : null;
                return (
                    <li
                        key={wish.uid}
                        className="flex items-center gap-3 px-3 py-2"
                        data-testid="wish-row"
                    >
                        {done ? (
                            <CheckCircleIcon
                                className="h-5 w-5 flex-shrink-0 text-gray-400"
                                aria-hidden="true"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => onDone?.(wish)}
                                className="h-5 w-5 flex-shrink-0 rounded-md border-2 border-gray-400 hover:border-blue-500 dark:border-gray-500"
                                aria-label={t('goals.overview.markDone', {
                                    title: wish.title,
                                    defaultValue: 'Mark “{{title}}” fulfilled',
                                })}
                            />
                        )}
                        <Link to={urlOf(wish)} className="min-w-0 flex-1 py-1">
                            <span
                                className={`block truncate text-[15px] ${
                                    done
                                        ? 'text-gray-500 dark:text-gray-400'
                                        : 'text-gray-900 dark:text-gray-100'
                                }`}
                            >
                                {wish.title}
                            </span>
                            {subtitle && (
                                <span className="block truncate text-xs text-gray-600 dark:text-gray-300">
                                    {subtitle}
                                </span>
                            )}
                        </Link>
                        {!done && onCreateTask && (
                            <button
                                type="button"
                                onClick={() => onCreateTask(wish)}
                                className={iconButtonClass}
                                aria-label={t('goals.overview.createTaskFor', {
                                    title: wish.title,
                                    defaultValue:
                                        'Create a task for “{{title}}”',
                                })}
                                title={t('goals.createTask', 'Create a task')}
                            >
                                <PlusIcon className="h-4 w-4" />
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

interface QuickAddWishProps {
    bucket: GoalBucket;
    groupLabel: string;
    onAdd: (title: string, bucket: GoalBucket) => Promise<void>;
    onError: () => void;
}

// One line at the end of an open group: type a wish, Enter adds it there and
// the field stays ready for the next one.
const QuickAddWish: React.FC<QuickAddWishProps> = ({
    bucket,
    groupLabel,
    onAdd,
    onError,
}) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = title.trim();
        if (!value || saving) return;
        setSaving(true);
        try {
            await onAdd(value, bucket);
            setTitle('');
        } catch {
            onError();
        } finally {
            setSaving(false);
        }
    };
    return (
        <form onSubmit={submit} className="mb-3 flex items-center gap-2 px-3">
            <PlusIcon
                className="h-4 w-4 flex-shrink-0 text-gray-400"
                aria-hidden="true"
            />
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('goals.overview.addWish', 'Add a wish…')}
                aria-label={t('goals.overview.addWishTo', {
                    group: groupLabel,
                    defaultValue: 'Add a wish to {{group}}',
                })}
                className="min-w-0 flex-1 bg-transparent py-2 text-base text-gray-900 placeholder-gray-500 outline-none dark:text-gray-100 dark:placeholder-gray-400 sm:text-sm"
                data-testid={`bucket-add-${bucket}`}
            />
        </form>
    );
};

export default Goals;
