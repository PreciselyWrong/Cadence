import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import {
    createWeeklyRoutine,
    decideTask,
    fetchReviewCategory,
    fetchWeeklyRoutine,
    fetchReviewSummary,
    InboxReviewItem,
    isParked,
    keepProject,
    ProjectReviewItem,
    PushedItem,
    ReviewCategory,
    ReviewSummary,
    TaskDecision,
    TaskReviewItem,
} from '../../utils/reviewService';
import { createTask } from '../../utils/tasksService';
import { deleteInboxItem, processInboxItem } from '../../utils/inboxService';
import {
    fetchDailyPlan,
    saveDailyPlanItems,
    toPlanItemInputs,
} from '../../utils/dailyPlanService';
import { updateProject } from '../../utils/projectsService';
import { useToast } from '../Shared/ToastContext';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { openTaskPanel } from '../../store/taskPanelStore';
import { useIsMinimal } from '../../hooks/useUiDensity';
import DecisionChips, { DecisionOption } from './DecisionChips';
import WeekStep from './WeekStep';
import QuickReview from './QuickReview';
import { useDecisionKeys } from './useDecisionKeys';
import {
    addDaysToToday,
    buildQuickReview,
    formatDay,
    groupLater,
    LaterGroup,
    QuickEntry,
    rowLinkText,
} from './reviewUtils';
import { Link as SavedLink } from '../../entities/Link';
import { useLinksStore } from '../../store/linksStore';
import { firstUrl, linkForItem, residualText } from '../../utils/linkFilters';
import LinkPreviewCard from '../Links/LinkPreviewCard';

type Step = ReviewCategory | 'week';

// The tabs are the steps of a review, in order: decide what came in, look
// at what keeps slipping and what is stuck, reopen parked ideas whose date
// came, then choose the week. Any tab can be opened on its own.
const STEPS: Step[] = [
    'undecided',
    'pushed',
    'projects',
    'later',
    'stale',
    'week',
];

const STEP_KEY = 'review.step';
const PAGE = 50;
// Later is read as a grouped backlog: the server maximum in one page.
const LATER_PAGE = 200;
// Past this many parked tasks only the first group opens by default.
const LONG_LATER = 20;
const SHORT_SESSION_MINUTES = 25;

const readStep = (): Step => {
    try {
        const saved = localStorage.getItem(STEP_KEY) as Step | null;
        return saved && STEPS.includes(saved) ? saved : STEPS[0];
    } catch {
        return STEPS[0];
    }
};

type Row =
    | { kind: 'pushed'; item: PushedItem }
    | { kind: 'task'; item: TaskReviewItem; category: 'later' | 'stale' }
    | { kind: 'inbox'; item: InboxReviewItem }
    | { kind: 'project'; item: ProjectReviewItem };

const rowKey = (row: Row) =>
    row.kind === 'project'
        ? `p:${row.item.project.uid}`
        : row.kind === 'inbox'
          ? `i:${row.item.uid}`
          : `t:${row.item.task.uid}`;

const toRows = (step: ReviewCategory, items: unknown[]): Row[] =>
    items.map((item) =>
        step === 'pushed'
            ? { kind: 'pushed', item: item as PushedItem }
            : step === 'undecided'
              ? { kind: 'inbox', item: item as InboxReviewItem }
              : step === 'projects'
                ? { kind: 'project', item: item as ProjectReviewItem }
                : {
                      kind: 'task',
                      item: item as TaskReviewItem,
                      category: step === 'later' ? 'later' : 'stale',
                  }
    );

const entryRow = (entry: QuickEntry): Row =>
    entry.category === 'undecided'
        ? { kind: 'inbox', item: entry.item }
        : entry.category === 'pushed'
          ? { kind: 'pushed', item: entry.item }
          : entry.category === 'projects'
            ? { kind: 'project', item: entry.item }
            : { kind: 'task', item: entry.item, category: entry.category };

// The quick review's queue: the rows still to see, how many it started
// with, and the ones skipped, which a new round leaves out.
interface QuickState {
    loading: boolean;
    queue: Row[];
    total: number;
    skipped: string[];
}

interface LaterSorterProps {
    queue: Row[];
    onSkip: (key: string) => void;
    onStop: () => void;
    options: (row: Row) => DecisionOption[];
    title: (row: Row) => string;
    meta: (row: Row) => string;
    onOpen: (row: Row) => void;
}

// "Sort one by one": one parked task at a time, with the same choices and Skip.
const LaterSorter: React.FC<LaterSorterProps> = ({
    queue,
    onSkip,
    onStop,
    options,
    title,
    meta,
    onOpen,
}) => {
    const { t } = useTranslation();
    const current = queue[0];
    useDecisionKeys({
        options: current ? options(current) : [],
        onSkip: current ? () => onSkip(rowKey(current)) : undefined,
        onOpen: current ? () => onOpen(current) : undefined,
        onStop,
    });

    if (!current) {
        return (
            <div className="space-y-3 py-10 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('review.later.sorted', 'Nothing left to sort.')}
                </p>
                <button
                    type="button"
                    onClick={onStop}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                    {t('review.later.backToList', 'Back to the list')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                <span>
                    {t('review.later.left', '{{count}} left', {
                        count: queue.length,
                    })}
                </span>
                <button
                    type="button"
                    onClick={onStop}
                    className="hover:underline"
                >
                    {t('review.later.backToList', 'Back to the list')}
                </button>
            </div>
            <div className="space-y-1">
                <button
                    type="button"
                    onClick={() => onOpen(current)}
                    className="block w-full text-left text-lg font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                    {title(current)}
                </button>
                <span className="block text-sm text-gray-600 dark:text-gray-300">
                    {meta(current)}
                </span>
            </div>
            <DecisionChips
                key={rowKey(current)}
                options={options(current)}
                numbered
            />
            <button
                type="button"
                onClick={() => onSkip(rowKey(current))}
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
            >
                {t('review.later.skip', 'Skip')}
            </button>
        </div>
    );
};

const ReviewPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { showErrorToast, showSuccessToast, showUndoToast } = useToast();
    const isMinimal = useIsMinimal();
    const { openTask } = useTaskPane();
    const [step, setStepState] = useState<Step>(readStep);
    const [summary, setSummary] = useState<ReviewSummary | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [nextTaskFor, setNextTaskFor] = useState<string | null>(null);
    const [nextTaskName, setNextTaskName] = useState('');
    // The Friday routine is offered only while none exists.
    const [routineMissing, setRoutineMissing] = useState(false);
    const locale = i18n.language;
    const links = useLinksStore((state) => state.links);
    const loadLinks = useLinksStore((state) => state.load);
    const [laterQuery, setLaterQuery] = useState('');
    const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);
    // "Sort one by one" on Later: the rows passed over, in the order passed.
    const [sorting, setSorting] = useState(false);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [quick, setQuick] = useState<QuickState | null>(null);

    useEffect(() => {
        void loadLinks();
    }, [loadLinks]);

    useEffect(() => {
        let active = true;
        fetchWeeklyRoutine()
            .then((exists) => active && setRoutineMissing(!exists))
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const planWeeklyRoutine = async () => {
        try {
            await createWeeklyRoutine(
                t('review.routine.taskName', 'Weekly review')
            );
            setRoutineMissing(false);
            showSuccessToast(
                t(
                    'review.routine.created',
                    'Weekly review planned for Fridays.'
                )
            );
        } catch {
            showErrorToast(
                t('review.routine.error', 'Could not plan the weekly review.')
            );
        }
    };

    const setStep = (next: Step) => {
        setSorting(false);
        setSkipped([]);
        setStepState(next);
        try {
            localStorage.setItem(STEP_KEY, next);
        } catch {
            // The step is a convenience; the decisions are on the server.
        }
    };

    const refreshSummary = useCallback(() => {
        fetchReviewSummary()
            .then(setSummary)
            .catch(() => {});
    }, []);

    const load = useCallback(
        async (offset = 0) => {
            if (step === 'week') return;
            setLoading(true);
            try {
                const page = await fetchReviewCategory(
                    step,
                    offset,
                    step === 'later' ? LATER_PAGE : PAGE
                );
                const next = toRows(step, page.items);
                setRows((current) =>
                    offset === 0 ? next : [...current, ...next]
                );
                setTotal(page.total);
            } catch {
                showErrorToast(
                    t('review.loadError', 'Could not load the review.')
                );
            } finally {
                setLoading(false);
            }
        },
        [step, showErrorToast, t]
    );

    useEffect(() => {
        setRows([]);
        setTotal(0);
        void load(0);
    }, [load]);

    useEffect(refreshSummary, [refreshSummary]);

    const openTaskDetails = (uid: string) => {
        if (isMinimal) openTask(uid);
        else openTaskPanel(uid);
    };

    // Takes the row off at once, then runs the decision; a failed save puts
    // the row back where it was and says so.
    // Puts a row back at its place: after a failed save, or an undo.
    const putBack = (row: Row, index: number) => {
        const key = rowKey(row);
        setRows((current) => {
            if (current.some((r) => rowKey(r) === key)) return current;
            const at = index < 0 ? 0 : Math.min(index, current.length);
            return [...current.slice(0, at), row, ...current.slice(at)];
        });
        setTotal((count) => count + 1);
    };

    // With `undo`, a saved decision offers "Undo", which puts the row back
    // and restores what the decision changed.
    const decide = async (
        row: Row,
        action: () => Promise<unknown>,
        undo?: () => Promise<unknown>
    ) => {
        const key = rowKey(row);
        const index = rows.findIndex((r) => rowKey(r) === key);
        // A row of the quick review may not be in the open tab's list.
        const listed = index >= 0;
        if (listed) {
            setRows((current) => current.filter((r) => rowKey(r) !== key));
            setTotal((count) => Math.max(0, count - 1));
        }
        setQuick((state) =>
            state
                ? {
                      ...state,
                      queue: state.queue.filter((r) => rowKey(r) !== key),
                  }
                : state
        );
        try {
            await action();
            refreshSummary();
            if (undo) {
                showUndoToast(t('review.decided', 'Decision saved.'), () => {
                    if (listed) putBack(row, index);
                    undo()
                        .then(refreshSummary)
                        .catch(() =>
                            showErrorToast(
                                t(
                                    'review.saveError',
                                    'Could not save the decision.'
                                )
                            )
                        );
                });
            }
        } catch {
            if (listed) putBack(row, index);
            setQuick((state) =>
                state
                    ? {
                          ...state,
                          queue: [
                              row,
                              ...state.queue.filter((r) => rowKey(r) !== key),
                          ],
                      }
                    : state
            );
            showErrorToast(
                t('review.saveError', 'Could not save the decision.')
            );
        }
    };

    // The task's decision fields as they were before `decision`.
    const undoOf =
        (task: Task, decision: TaskDecision) => (): Promise<unknown> =>
            decideTask(task.uid as string, {
                in_view: Boolean(task.in_view),
                week_of: task.week_of ?? null,
                review_on: task.review_on ?? null,
                later: isParked(task),
                ...(decision.status !== undefined &&
                typeof task.status === 'string'
                    ? { status: task.status }
                    : {}),
            });

    // Saved decisions that change the day's plan have no undo: the plan is
    // the user's own day, and "Do today" is not taken back by the review.
    const onTask = (row: Row, task: Task, decision: TaskDecision) =>
        decide(
            row,
            () =>
                decideTask(task.uid as string, {
                    ...decision,
                    reviewed: true,
                }),
            decision.today ? undefined : undoOf(task, decision)
        );

    const shortSession = (row: Row, task: Task) =>
        decide(row, async () => {
            const { date, plan } = await fetchDailyPlan();
            const items = toPlanItemInputs(plan?.items || []).filter(
                (item) => item.task_uid !== task.uid
            );
            await saveDailyPlanItems(date, [
                ...items,
                {
                    task_uid: task.uid as string,
                    start_minute: null,
                    duration_minutes: SHORT_SESSION_MINUTES,
                },
            ]);
            await decideTask(task.uid as string, { reviewed: true });
        });

    const taskOptions = (
        row: Row,
        task: Task,
        inQuick = false
    ): DecisionOption[] => {
        const a = (key: string, fallback: string) =>
            t(`review.actions.${key}`, fallback);
        const later: DecisionOption = {
            key: 'later',
            label: a('later', 'Later'),
            run: () => void onTask(row, task, { later: true }),
        };
        const drop: DecisionOption = {
            key: 'drop',
            label: a('drop', 'Drop'),
            run: () => void onTask(row, task, { status: 'cancelled' }),
        };
        const keep: DecisionOption = {
            key: 'keep',
            label: a('keep', 'Keep as is'),
            run: () => void onTask(row, task, {}),
        };
        const thisWeek: DecisionOption = {
            key: 'week',
            label: a('thisWeek', 'This week'),
            run: () =>
                void onTask(row, task, {
                    later: false,
                    week_of: 'this_week',
                    review_on: null,
                }),
        };
        const inView: DecisionOption = {
            key: 'inView',
            label: a('inView', 'In view'),
            run: () =>
                void onTask(row, task, {
                    later: false,
                    in_view: true,
                    review_on: null,
                }),
        };
        if (row.kind === 'pushed') {
            return [
                {
                    key: 'today',
                    label: a('today', 'Do today'),
                    run: () => void onTask(row, task, { today: true }),
                },
                later,
                keep,
                {
                    key: 'short',
                    label: a('shortSession', 'Short session today (25 min)'),
                    run: () => void shortSession(row, task),
                },
                {
                    key: 'split',
                    label: a('split', 'Break into steps'),
                    run: () => openTaskDetails(task.uid as string),
                },
                drop,
            ];
        }
        if (row.kind === 'task' && row.category === 'later') {
            const keepLater: DecisionOption = {
                key: 'keepLater',
                label: a('keepLater', 'Keep parked'),
                run: () => void onTask(row, task, { review_on: null }),
            };
            const review30: DecisionOption = {
                key: 'review30',
                label: a('reviewIn30', 'Review in 30 days'),
                run: () =>
                    void onTask(row, task, {
                        review_on: addDaysToToday(30),
                    }),
            };
            const first: DecisionOption[] = [
                {
                    key: 'today',
                    label: a('today', 'Do today'),
                    // A parked task leaves Later, or it would never reach Today.
                    run: () =>
                        void onTask(row, task, { today: true, later: false }),
                },
                thisWeek,
            ];
            const rest: DecisionOption[] = [
                {
                    key: 'reviewOn',
                    label: a('reviewOn', 'Review on…'),
                    run: () => {},
                    date: (day) => void onTask(row, task, { review_on: day }),
                },
                inView,
            ];
            const last: DecisionOption[] = [
                {
                    key: 'done',
                    label: a('done', 'Done'),
                    run: () => void onTask(row, task, { status: 'done' }),
                },
                drop,
            ];
            // In the quick review "Keep parked" is one tap: a parked idea
            // looked at goes to the back of the queue for next time.
            return inQuick
                ? [...first, keepLater, review30, ...rest, ...last]
                : [...first, review30, ...rest, keepLater, ...last];
        }
        return [thisWeek, inView, later, keep, drop];
    };

    const inboxOptions = (
        row: Row,
        item: InboxReviewItem
    ): DecisionOption[] => {
        const asTask = (decision: TaskDecision) =>
            decide(row, async () => {
                const task = await createTask({
                    name: item.title || item.content,
                    status: 'not_started',
                } as Task);
                if (Object.keys(decision).length > 0) {
                    await decideTask(task.uid as string, decision);
                }
                await processInboxItem(item.uid, {
                    task_uid: task.uid as string,
                });
            });
        return [
            {
                key: 'task',
                label: t('review.actions.toTask', 'Make a task'),
                run: () => void asTask({}),
            },
            {
                key: 'week',
                label: t('review.actions.thisWeek', 'This week'),
                run: () => void asTask({ week_of: 'this_week' }),
            },
            {
                key: 'later',
                label: t('review.actions.toLater', 'Park for later'),
                run: () => void asTask({ later: true }),
            },
            {
                key: 'discard',
                label: t('review.actions.discard', 'Discard'),
                run: () => void decide(row, () => deleteInboxItem(item.uid)),
            },
        ];
    };

    const projectOptions = (
        row: Row,
        item: ProjectReviewItem
    ): DecisionOption[] => [
        {
            key: 'next',
            label: t('review.actions.addNext', 'Add the next task'),
            run: () => {
                setNextTaskFor(item.project.uid);
                setNextTaskName('');
            },
        },
        {
            key: 'open',
            label: t('review.actions.openProject', 'Open project'),
            run: () => navigate(`/project/${item.project.uid}`),
        },
        {
            key: 'hold',
            label: t('review.actions.pauseProject', 'Put on hold'),
            run: () =>
                void decide(row, () =>
                    updateProject(item.project.uid, { status: 'waiting' })
                ),
        },
        {
            key: 'keep',
            label: t('review.actions.keep', 'Keep as is'),
            run: () => void decide(row, () => keepProject(item.project.uid)),
        },
    ];

    const addNextTask = (row: Row, item: ProjectReviewItem) => {
        const name = nextTaskName.trim();
        if (!name) return;
        void decide(row, async () => {
            await createTask({
                name,
                status: 'not_started',
                project_id: item.project.id,
            } as Task);
            setNextTaskFor(null);
        });
    };

    // Reads every list once and builds a short queue; `exclude` keeps what
    // was skipped this visit out of another round.
    const startQuick = async (exclude: string[] = []) => {
        setQuick({ loading: true, queue: [], total: 0, skipped: exclude });
        try {
            const [undecided, pushedPage, projects, later, stale] =
                await Promise.all([
                    fetchReviewCategory<InboxReviewItem>('undecided', 0, PAGE),
                    fetchReviewCategory<PushedItem>('pushed', 0, PAGE),
                    fetchReviewCategory<ProjectReviewItem>('projects', 0, PAGE),
                    fetchReviewCategory<TaskReviewItem>('later', 0, LATER_PAGE),
                    fetchReviewCategory<TaskReviewItem>('stale', 0, PAGE),
                ]);
            const queue = buildQuickReview(
                {
                    undecided: undecided.items,
                    pushed: pushedPage.items,
                    projects: projects.items,
                    later: later.items,
                    stale: stale.items,
                },
                undefined,
                exclude
            ).map(entryRow);
            setQuick({
                loading: false,
                queue,
                total: queue.length,
                skipped: exclude,
            });
        } catch {
            setQuick(null);
            showErrorToast(t('review.loadError', 'Could not load the review.'));
        }
    };

    const stopQuick = () => {
        setQuick(null);
        setNextTaskFor(null);
        refreshSummary();
        void load(0);
    };

    const skipQuick = () =>
        setQuick((state) =>
            state && state.queue.length > 0
                ? {
                      ...state,
                      queue: state.queue.slice(1),
                      skipped: [...state.skipped, rowKey(state.queue[0])],
                  }
                : state
        );

    const label = (s: Step) =>
        ({
            undecided: t('review.tabs.undecided', 'To decide'),
            pushed: t('review.tabs.pushed', 'Pushed back'),
            projects: t('review.tabs.projects', 'Stalled projects'),
            later: t('review.tabs.later', 'Later'),
            stale: t('review.tabs.stale', 'Old'),
            week: t('review.tabs.week', 'This week'),
        })[s];

    // Later is a backlog, not a debt: its tab counts only the reviews that
    // came due.
    const countOf = (s: Step) =>
        s === 'week' || !summary
            ? null
            : s === 'later'
              ? summary.counts.review_due
              : summary.counts[s];

    const emptyText = (s: ReviewCategory) =>
        ({
            undecided: t('review.empty.undecided', 'The inbox is clear.'),
            pushed: t('review.empty.pushed', 'Nothing you keep pushing back.'),
            projects: t(
                'review.empty.projects',
                'Every active project has a next step.'
            ),
            later: t('review.empty.later', 'Nothing parked.'),
            stale: t('review.empty.stale', 'No old tasks.'),
        })[s];

    const meta = (row: Row, grouped = false): string => {
        if (row.kind === 'inbox') return formatDay(row.item.created_at, locale);
        if (row.kind === 'project') {
            return row.item.reasons
                .map((reason) =>
                    t(`review.reasons.${reason}`, reason.replace(/_/g, ' '))
                )
                .join(' · ');
        }
        const task = row.item.task;
        // Inside a Later group the project is already the group's name.
        const parts: (string | null | undefined)[] = [
            grouped ? null : task.Project?.name,
        ];
        if (row.kind === 'pushed') {
            parts.push(
                t('review.movedCount', 'moved {{count}} times', {
                    count: row.item.push.recent_count,
                })
            );
            if (row.item.push.last_planned_for) {
                parts.push(
                    t('review.lastPlanned', 'last planned {{date}}', {
                        date: formatDay(row.item.push.last_planned_for, locale),
                    })
                );
            }
        } else if (row.category === 'later') {
            if (row.item.review_due) {
                parts.push(t('review.reviewDue', 'review due'));
            } else if (task.review_on) {
                parts.push(
                    t('review.reviewOn', 'review {{date}}', {
                        date: formatDay(task.review_on, locale),
                    })
                );
            }
        } else {
            parts.push(
                t('review.lastActivity', 'unchanged since {{date}}', {
                    date: formatDay(row.item.last_activity_at, locale),
                })
            );
        }
        return parts.filter(Boolean).join(' · ');
    };

    const title = (row: Row) =>
        row.kind === 'project'
            ? row.item.project.name
            : row.kind === 'inbox'
              ? row.item.title || row.item.content
              : row.item.task.original_name || row.item.task.name;

    const openRow = (row: Row) => {
        if (row.kind === 'project')
            navigate(`/project/${row.item.project.uid}`);
        else if (row.kind === 'inbox') navigate('/inbox');
        else openTaskDetails(row.item.task.uid as string);
    };

    const options = (row: Row, inQuick = false) =>
        row.kind === 'project'
            ? projectOptions(row, row.item)
            : row.kind === 'inbox'
              ? inboxOptions(row, row.item)
              : taskOptions(row, row.item.task, inQuick);

    // The saved link of a row whose title (or Inbox text) is an address, so
    // the row shows the page instead of a raw URL.
    const linkOf = (row: Row): { link: SavedLink; text: string } | null => {
        if (row.kind === 'project') return null;
        if (row.kind === 'inbox') {
            const link = linkForItem(links, row.item.uid, row.item.content);
            return link ? { link, text: row.item.content } : null;
        }
        const task = row.item.task;
        const text = rowLinkText(task.original_name || task.name, task.note);
        const link = text ? linkForItem(links, task.uid, text, 'task') : null;
        return link && text ? { link, text } : null;
    };

    const renderRow = (row: Row, grouped = false) => {
        const key = rowKey(row);
        const found = linkOf(row);
        const around = found
            ? residualText(found.text, firstUrl(found.text) ?? '')
            : '';
        const showTitle =
            !found || (around !== '' && around !== (found.link.note ?? ''));
        return (
            <li key={key} className="py-2.5">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="min-w-0 flex-1 text-left"
                    >
                        {showTitle && (
                            <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                                {title(row)}
                            </span>
                        )}
                        <span className="block truncate text-xs text-gray-600 dark:text-gray-300">
                            {meta(row, grouped)}
                        </span>
                    </button>
                </div>
                <div className="mt-2">
                    <DecisionChips options={options(row)} />
                </div>
                {found && (
                    <LinkPreviewCard
                        url={found.link.url}
                        title={found.link.title}
                        description={
                            found.link.description || found.link.readme_excerpt
                        }
                        image={found.link.image_url}
                        pending={found.link.fetch_status === 'pending'}
                    />
                )}
                {nextTaskInput(row)}
            </li>
        );
    };

    // "Add the next task" of a stalled project: an inline field.
    const nextTaskInput = (row: Row) =>
        row.kind === 'project' &&
        nextTaskFor === row.item.project.uid && (
            <input
                autoFocus
                value={nextTaskName}
                onChange={(e) => setNextTaskName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        addNextTask(row, row.item);
                    }
                    if (e.key === 'Escape') {
                        setNextTaskFor(null);
                    }
                }}
                placeholder={t('review.nextTaskPlaceholder', 'Next task…')}
                className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
        );

    // Rows not passed over come first, in list order; passed ones go last.
    const laterQueue = (): Row[] => [
        ...rows.filter(
            (row) => row.kind === 'task' && !skipped.includes(rowKey(row))
        ),
        ...skipped.flatMap((key) => rows.filter((row) => rowKey(row) === key)),
    ];

    const laterItems = rows.flatMap((row) =>
        row.kind === 'task' ? [row.item] : []
    );
    const linkTitles: Record<string, string> = {};
    rows.forEach((row) => {
        if (row.kind !== 'task' || !row.item.task.uid) return;
        const found = linkOf(row);
        if (found) {
            linkTitles[row.item.task.uid] =
                found.link.title || found.link.domain || found.link.url;
        }
    });
    const laterGroups: LaterGroup[] =
        step === 'later' ? groupLater(laterItems, laterQuery, linkTitles) : [];
    const opened =
        openGroups ??
        new Set(
            laterItems.length > LONG_LATER
                ? laterGroups.slice(0, 1).map((g) => g.key)
                : laterGroups.map((g) => g.key)
        );
    const toggleGroup = (key: string) => {
        const next = new Set(opened);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setOpenGroups(next);
    };

    const stepIndex = STEPS.indexOf(step);
    const nextStep = STEPS[stepIndex + 1];

    const quickCurrent = quick && !quick.loading ? quick.queue[0] : undefined;

    // What a quick-review item is, named like the list it comes from.
    const kindOf = (row: Row) =>
        label(
            row.kind === 'inbox'
                ? 'undecided'
                : row.kind === 'pushed'
                  ? 'pushed'
                  : row.kind === 'project'
                    ? 'projects'
                    : row.category
        );

    const quickCard = (row: Row) => {
        const found = linkOf(row);
        const around = found
            ? residualText(found.text, firstUrl(found.text) ?? '')
            : '';
        const showTitle =
            !found || (around !== '' && around !== (found.link.note ?? ''));
        return (
            <>
                {showTitle && (
                    <button
                        type="button"
                        onClick={() => openRow(row)}
                        className="block w-full text-left text-lg font-medium text-gray-900 hover:underline dark:text-gray-100"
                    >
                        {title(row)}
                    </button>
                )}
                {meta(row) && (
                    <span className="block text-sm text-gray-600 dark:text-gray-300">
                        {meta(row)}
                    </span>
                )}
                {found && (
                    <LinkPreviewCard
                        url={found.link.url}
                        title={found.link.title}
                        description={
                            found.link.description || found.link.readme_excerpt
                        }
                        image={found.link.image_url}
                        pending={found.link.fetch_status === 'pending'}
                    />
                )}
                {nextTaskInput(row)}
            </>
        );
    };

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6">
            <header className="mb-4">
                <h2 className="text-2xl font-light text-gray-900 dark:text-gray-100">
                    {t('review.title', 'Review')}
                </h2>
                {summary && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {summary.attention_total === 0
                            ? t('review.calmClear', 'All up to date')
                            : t(
                                  'review.calm',
                                  summary.attention_total === 1
                                      ? '{{count}} thing to look at, at your own pace'
                                      : '{{count}} things to look at, at your own pace',
                                  { count: summary.attention_total }
                              )}
                    </p>
                )}
                {routineMissing && (
                    <button
                        type="button"
                        onClick={planWeeklyRoutine}
                        className="mt-2 text-xs text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
                    >
                        {t(
                            'review.routine.offer',
                            'Plan a weekly review on Fridays'
                        )}
                    </button>
                )}
            </header>

            {quick ? (
                <QuickReview
                    loading={quick.loading}
                    kind={quickCurrent ? kindOf(quickCurrent) : null}
                    card={quickCurrent ? quickCard(quickCurrent) : null}
                    itemKey={quickCurrent ? rowKey(quickCurrent) : null}
                    options={quickCurrent ? options(quickCurrent, true) : []}
                    position={quick.total - quick.queue.length + 1}
                    total={quick.total}
                    onSkip={skipQuick}
                    onStop={stopQuick}
                    onOpen={() => quickCurrent && openRow(quickCurrent)}
                    onAgain={() => void startQuick(quick.skipped)}
                />
            ) : (
                <>
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {t('review.quick.title', 'Quick review')}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {t(
                                    'review.quick.pitch',
                                    'About 5 minutes, one thing at a time. Stop whenever you like.'
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void startQuick()}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            {t('review.quick.start', 'Start')}
                        </button>
                    </div>

                    <nav
                        role="tablist"
                        aria-label={t('review.title', 'Review')}
                        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 px-4 dark:border-gray-800 sm:mx-0 sm:px-0"
                    >
                        {STEPS.map((s) => {
                            const count = countOf(s);
                            const active = s === step;
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setStep(s)}
                                    className={`-mb-px flex-shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm ${
                                        active
                                            ? 'border-blue-500 text-gray-900 dark:text-gray-100'
                                            : 'border-transparent text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {label(s)}
                                    {count !== null && count > 0 && (
                                        <span className="ml-1.5 text-xs text-gray-500">
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {step === 'week' ? (
                        <WeekStep onOpenTask={openTaskDetails} />
                    ) : (
                        <section aria-live="polite">
                            {step === 'undecided' && total > 0 && (
                                <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
                                    <Link
                                        to="/inbox"
                                        className="underline-offset-2 hover:underline"
                                    >
                                        {t(
                                            'review.actions.openInbox',
                                            'Open the Inbox'
                                        )}
                                    </Link>
                                </p>
                            )}
                            {loading && rows.length === 0 && (
                                <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                                    {t('review.loading', 'Loading…')}
                                </p>
                            )}
                            {!loading && rows.length === 0 && (
                                <p className="py-10 text-center text-sm text-gray-600 dark:text-gray-300">
                                    {emptyText(step)}
                                </p>
                            )}
                            {step === 'later' && rows.length > 0 && sorting ? (
                                <LaterSorter
                                    queue={laterQueue()}
                                    onSkip={(key) =>
                                        setSkipped((keys) => [...keys, key])
                                    }
                                    onStop={() => setSorting(false)}
                                    options={options}
                                    title={title}
                                    meta={meta}
                                    onOpen={openRow}
                                />
                            ) : step === 'later' && rows.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setSorting(true)}
                                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                        >
                                            {t(
                                                'review.later.sortOneByOne',
                                                'Sort one by one'
                                            )}
                                        </button>
                                    </div>
                                    <input
                                        type="search"
                                        value={laterQuery}
                                        onChange={(e) =>
                                            setLaterQuery(e.target.value)
                                        }
                                        placeholder={t(
                                            'review.later.filter',
                                            'Filter'
                                        )}
                                        aria-label={t(
                                            'review.later.filter',
                                            'Filter'
                                        )}
                                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                    />
                                    {laterGroups.length === 0 && (
                                        <p className="py-6 text-center text-sm text-gray-600 dark:text-gray-300">
                                            {t(
                                                'review.later.noMatch',
                                                'Nothing matches.'
                                            )}
                                        </p>
                                    )}
                                    {laterGroups.map((group) => {
                                        const isOpen =
                                            laterQuery.trim() !== '' ||
                                            opened.has(group.key);
                                        return (
                                            <section key={group.key}>
                                                <button
                                                    type="button"
                                                    aria-expanded={isOpen}
                                                    onClick={() =>
                                                        toggleGroup(group.key)
                                                    }
                                                    className="flex w-full items-center gap-2 py-1.5 text-left text-sm font-medium text-gray-800 dark:text-gray-100"
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600"
                                                        style={
                                                            group.color
                                                                ? {
                                                                      backgroundColor:
                                                                          group.color,
                                                                  }
                                                                : undefined
                                                        }
                                                    />
                                                    <span className="truncate">
                                                        {group.name ??
                                                            t(
                                                                'review.later.noProject',
                                                                'No project'
                                                            )}
                                                    </span>
                                                    <span className="text-xs font-normal text-gray-500">
                                                        {group.items.length}
                                                    </span>
                                                    <span
                                                        aria-hidden="true"
                                                        className="ml-auto text-xs text-gray-500"
                                                    >
                                                        {isOpen ? '▾' : '▸'}
                                                    </span>
                                                </button>
                                                {isOpen && (
                                                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                                        {group.items.map(
                                                            (item) =>
                                                                renderRow(
                                                                    {
                                                                        kind: 'task',
                                                                        item,
                                                                        category:
                                                                            'later',
                                                                    },
                                                                    true
                                                                )
                                                        )}
                                                    </ul>
                                                )}
                                            </section>
                                        );
                                    })}
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {rows.map((row) => renderRow(row))}
                                </ul>
                            )}
                            {rows.length < total && (
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => void load(rows.length)}
                                    className="mt-3 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200"
                                >
                                    {t('review.loadMore', 'Show more')}
                                </button>
                            )}
                        </section>
                    )}

                    {nextStep && (
                        <div className="mt-8 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setStep(nextStep)}
                                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                                {t('review.next', 'Next: {{name}}', {
                                    name: label(nextStep),
                                })}{' '}
                                →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ReviewPage;
