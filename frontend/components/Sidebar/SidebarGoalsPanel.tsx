import React, { useEffect, useMemo } from 'react';
import { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FlagIcon } from '@heroicons/react/24/outline';
import { Goal, GoalBucket } from '../../entities/Goal';
import { useStore } from '../../store/useStore';
import { useCan } from '../../hooks/useCan';
import { useSidebarSectionExpanded } from '../../hooks/useSidebarSectionExpanded';
import { createGoalUrl } from '../../utils/slugUtils';
import {
    GOAL_BUCKETS,
    ObjectiveEntry,
    buildGoalsOverview,
    openWishCount,
} from '../../utils/goalsOverview';
import { ColorDot } from '../Shared/ui/ListRow';
import {
    PanelEmpty,
    PanelGroup,
    PanelHeader,
    panelRowClass,
} from './sidebarPanelParts';

interface SidebarGoalsPanelProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    openGoalModal: () => void;
}

const BUCKET_FALLBACKS: Record<GoalBucket, string> = {
    have: 'Have',
    be: 'Be',
    do: 'Do',
};

const urlOf = (goal: Goal) =>
    goal.uid ? createGoalUrl({ uid: goal.uid, title: goal.title }) : '/goals';

const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface GoalRowProps {
    goal: Goal;
    nested?: boolean;
    selected: boolean;
    onOpen: (goal: Goal) => void;
    // Wishes have no linked work, so no bar.
    withProgress: boolean;
}

// One goal: its title over a thin progress bar, the target date on the right
// (in the warning colour once passed while still active).
const GoalRow: React.FC<GoalRowProps> = ({
    goal,
    nested = false,
    selected,
    onOpen,
    withProgress,
}) => {
    const { t, i18n } = useTranslation();
    const percent = goal.progress?.percent ?? null;
    const progressLabel =
        goal.progress && goal.progress.total > 0
            ? t('goals.keyResults.progress', {
                  done: goal.progress.done,
                  total: goal.progress.total,
                  defaultValue: '{{done}} of {{total}} done',
              })
            : t('goals.overview.nothingLinked', 'Nothing linked');
    const date = goal.target_date
        ? new Date(`${goal.target_date}T12:00:00`)
        : null;
    const dateText = date
        ? date.toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'short',
              ...(date.getFullYear() !== new Date().getFullYear()
                  ? { year: '2-digit' as const }
                  : {}),
          })
        : null;
    const late =
        !!goal.target_date &&
        goal.status === 'active' &&
        goal.target_date < todayIso();
    const muted = goal.status !== 'active';

    return (
        <li>
            <button
                type="button"
                onClick={() => onOpen(goal)}
                aria-current={selected ? 'page' : undefined}
                className={`${panelRowClass(selected)} w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    nested ? 'pl-[28px]' : ''
                }`}
            >
                <span className="flex w-[16px] flex-shrink-0 justify-center">
                    <ColorDot color={goal.color} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-[3px]">
                    <span
                        className={`truncate leading-[18px] ${
                            muted ? 'text-gray-500 dark:text-gray-400' : ''
                        } ${nested ? 'text-[13px]' : ''}`}
                    >
                        {goal.title}
                    </span>
                    {withProgress && (
                        <span
                            role="progressbar"
                            aria-label={progressLabel}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percent ?? 0}
                            className="block h-[3px] w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10"
                        >
                            <span
                                className={`block h-full rounded-full transition-[width] duration-[220ms] motion-reduce:transition-none ${
                                    muted ? 'bg-gray-400' : 'bg-primary'
                                }`}
                                style={{ width: `${percent ?? 0}%` }}
                            />
                        </span>
                    )}
                </span>
                {dateText && (
                    <span
                        className={`flex-shrink-0 text-[12px] tabular-nums ${
                            late
                                ? 'text-warning'
                                : 'text-gray-500 dark:text-gray-300'
                        }`}
                        title={t('goals.overview.target', 'By {{date}}', {
                            date: dateText,
                        })}
                    >
                        {dateText}
                    </span>
                )}
            </button>
        </li>
    );
};

// The goals panel of the minimal sidebar (route /goals and a goal's page),
// in the order of the Goals page: active objectives with their key results
// (open), the paused, achieved or dropped ones, then the bucket list groups
// (folded until opened; each choice is kept on this device).
const SidebarGoalsPanel: React.FC<SidebarGoalsPanelProps> = ({
    handleNavClick,
    location,
    openGoalModal,
}) => {
    const { t } = useTranslation();
    const canCreateGoals = useCan('create_projects');
    const goals = useStore((state: any) => state.goalsStore.goals) as Goal[];
    const hasLoaded = useStore((state: any) => state.goalsStore.hasLoaded);
    const loadGoals = useStore((state: any) => state.goalsStore.loadGoals);

    useEffect(() => {
        if (!hasLoaded) loadGoals();
    }, [hasLoaded, loadGoals]);

    const [activeOpen, setActiveOpen] = useSidebarSectionExpanded(
        'goalsPanel:active',
        true
    );
    const [otherOpen, setOtherOpen] =
        useSidebarSectionExpanded('goalsPanel:other');
    const [haveOpen, setHaveOpen] =
        useSidebarSectionExpanded('goalsPanel:have');
    const [beOpen, setBeOpen] = useSidebarSectionExpanded('goalsPanel:be');
    const [doOpen, setDoOpen] = useSidebarSectionExpanded('goalsPanel:do');
    const bucketFold: Record<GoalBucket, [boolean, () => void]> = {
        have: [haveOpen, () => setHaveOpen((v) => !v)],
        be: [beOpen, () => setBeOpen((v) => !v)],
        do: [doOpen, () => setDoOpen((v) => !v)],
    };

    const overview = useMemo(() => buildGoalsOverview(goals), [goals]);
    // Fulfilled wishes stay on the Goals page only.
    const empty =
        overview.objectives.length === 0 &&
        overview.otherObjectives.length === 0 &&
        openWishCount(overview) === 0;

    const open = (goal: Goal) =>
        handleNavClick(
            urlOf(goal),
            goal.title,
            <FlagIcon className="h-4 w-4 mr-2" />
        );
    const isSelected = (goal: Goal) => urlOf(goal) === location.pathname;

    const objectiveRows = (entries: ObjectiveEntry[]) =>
        entries.flatMap(({ goal, keyResults }) => [
            <GoalRow
                key={goal.uid}
                goal={goal}
                selected={isSelected(goal)}
                onOpen={open}
                withProgress
            />,
            ...keyResults.map((kr) => (
                <GoalRow
                    key={kr.uid}
                    goal={kr}
                    nested
                    selected={isSelected(kr)}
                    onOpen={open}
                    withProgress
                />
            )),
        ]);

    const title = t('sidebar.goals', 'Goals');
    const newLabel = t('goals.newGoal', 'New Goal');

    return (
        <div className="flex flex-col" data-testid="sidebar-goals-panel">
            <PanelHeader
                icon={<FlagIcon />}
                title={title}
                onOpen={() =>
                    handleNavClick(
                        '/goals',
                        title,
                        <FlagIcon className="h-4 w-4 mr-2" />
                    )
                }
                active={location.pathname === '/goals'}
                addLabel={canCreateGoals ? newLabel : undefined}
                onAdd={canCreateGoals ? openGoalModal : undefined}
            />

            {hasLoaded && empty && (
                <PanelEmpty
                    title={t('goals.noGoalsYet', 'No goals yet.')}
                    actionLabel={canCreateGoals ? newLabel : undefined}
                    onAction={canCreateGoals ? openGoalModal : undefined}
                />
            )}

            {overview.objectives.length > 0 && (
                <PanelGroup
                    id="goals-active"
                    title={t('goals.status.active', 'Active')}
                    count={overview.objectives.length}
                    expanded={activeOpen}
                    onToggle={() => setActiveOpen((v) => !v)}
                >
                    {objectiveRows(overview.objectives)}
                </PanelGroup>
            )}

            {overview.otherObjectives.length > 0 && (
                <PanelGroup
                    id="goals-other"
                    title={t(
                        'goals.overview.other',
                        'Paused, achieved or dropped'
                    )}
                    count={overview.otherObjectives.length}
                    expanded={otherOpen}
                    onToggle={() => setOtherOpen((v) => !v)}
                >
                    {objectiveRows(overview.otherObjectives)}
                </PanelGroup>
            )}

            {GOAL_BUCKETS.map((bucket) => {
                const wishes = overview.wishes[bucket];
                if (wishes.length === 0) return null;
                const [expanded, toggle] = bucketFold[bucket];
                return (
                    <PanelGroup
                        key={bucket}
                        id={`goals-${bucket}`}
                        title={t('goals.bucket.title', 'Bucket list')}
                        detail={t(
                            `goals.bucket.${bucket}`,
                            BUCKET_FALLBACKS[bucket]
                        )}
                        count={wishes.length}
                        expanded={expanded}
                        onToggle={toggle}
                    >
                        {wishes.map((wish) => (
                            <GoalRow
                                key={wish.uid}
                                goal={wish}
                                selected={isSelected(wish)}
                                onOpen={open}
                                withProgress={false}
                            />
                        ))}
                    </PanelGroup>
                );
            })}
        </div>
    );
};

export default SidebarGoalsPanel;
