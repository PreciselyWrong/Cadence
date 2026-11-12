import React from 'react';
import { Link } from 'react-router-dom';
import { TFunction } from 'i18next';
import { format } from 'date-fns';
import {
    ChevronDownIcon,
    EllipsisHorizontalIcon,
    PencilSquareIcon,
    ShareIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { Goal, GoalStatus } from '../../entities/Goal';
import PageHeader from '../Shared/ui/PageHeader';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import EntityMark from '../Shared/ui/EntityMark';

const GOAL_STATUSES: GoalStatus[] = ['active', 'paused', 'achieved', 'dropped'];

const GOAL_STATUS_TINT: Record<GoalStatus, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    achieved:
        'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    dropped: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

interface GoalHeroProps {
    goal: Goal;
    t: TFunction;
    doneCount: number;
    totalCount: number;
    onStatusChange: (status: GoalStatus) => Promise<void>;
    onShareClick: () => void;
    onEditClick: () => void;
    onDeleteClick: () => void;
}

// The shared page header, as on a project: the goal icon, status menu and
// context on the meta line, Edit with Share and Delete under ⋯, then the
// progress bar with its time marker. No tinted card.
const GoalHero: React.FC<GoalHeroProps> = ({
    goal,
    t,
    doneCount,
    totalCount,
    onStatusChange,
    onShareClick,
    onEditClick,
    onDeleteClick,
}) => {
    const changeStatus = async (status: GoalStatus) => {
        if (status === goal.status) return;
        await onStatusChange(status).catch(() => undefined);
    };

    const percent =
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const startDate = goal.created_at ? new Date(goal.created_at) : null;
    const targetDate = goal.target_date ? new Date(goal.target_date) : null;
    const today = new Date();
    // How much of the time between creation and target date has passed.
    const timeUsed =
        startDate && targetDate && targetDate > startDate
            ? Math.min(
                  100,
                  Math.max(
                      0,
                      Math.round(
                          ((today.getTime() - startDate.getTime()) /
                              (targetDate.getTime() - startDate.getTime())) *
                              100
                      )
                  )
              )
            : null;

    const tint = goal.color || goal.Area?.color || null;

    const areaSlug = goal.Area
        ? goal.Area.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
        : '';

    const statusMenu: MenuEntry[] = GOAL_STATUSES.map((status) => ({
        key: status,
        label: t(`goals.status.${status}`, status),
        checked: status === goal.status,
        onSelect: () => void changeStatus(status),
    }));

    const menu: MenuEntry[] = [
        {
            key: 'share',
            label: t('projectItem.share', 'Share'),
            icon: <ShareIcon />,
            onSelect: onShareClick,
        },
        'separator',
        {
            key: 'delete',
            label: t('common.delete', 'Delete'),
            icon: <TrashIcon />,
            danger: true,
            onSelect: onDeleteClick,
        },
    ];

    const meta = (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Menu
                entries={statusMenu}
                align="start"
                trigger={(triggerProps) => (
                    <button
                        {...triggerProps}
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${GOAL_STATUS_TINT[goal.status]}`}
                    >
                        {t(`goals.status.${goal.status}`, goal.status)}
                        <ChevronDownIcon className="h-3 w-3" />
                    </button>
                )}
            />
            <span>
                {goal.bucket
                    ? t('goals.bucket.title', 'Bucket list')
                    : t(`goals.horizon.${goal.horizon}`, goal.horizon)}
            </span>
            {targetDate && (
                <>
                    <span aria-hidden="true">·</span>
                    <span>
                        {t('goals.targetDate', 'Target')}{' '}
                        {format(targetDate, 'MMM d, yyyy')}
                    </span>
                </>
            )}
            {goal.Area && (
                <>
                    <span aria-hidden="true">·</span>
                    <Link
                        to={`/area/${goal.Area.uid}-${areaSlug}`}
                        className="hover:text-surface-on hover:underline"
                    >
                        {goal.Area.name}
                    </Link>
                </>
            )}
        </span>
    );

    return (
        <PageHeader
            className="mb-2"
            leading={
                <EntityMark kind="goal" color={tint} className="h-6 w-6" />
            }
            title={<span data-testid="goal-title">{goal.title}</span>}
            meta={meta}
            actions={
                <>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<PencilSquareIcon className="h-4 w-4" />}
                        onClick={onEditClick}
                    >
                        {t('common.edit', 'Edit')}
                    </Button>
                    <Menu
                        entries={menu}
                        trigger={(triggerProps) => (
                            <IconButton
                                {...triggerProps}
                                label={t('project.moreOptions', 'More options')}
                            >
                                <EllipsisHorizontalIcon />
                            </IconButton>
                        )}
                    />
                </>
            }
        >
            <div className="space-y-3">
                {goal.why && (
                    <p className="max-w-3xl whitespace-pre-wrap text-body-m leading-relaxed text-surface-on-variant">
                        {goal.why}
                    </p>
                )}
                <div
                    className="max-w-3xl space-y-1.5"
                    title={
                        timeUsed !== null
                            ? t(
                                  'goals.progressHint',
                                  'Bar: tasks and projects done. Line: time passed between creation and target date.'
                              )
                            : undefined
                    }
                >
                    <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums text-surface-on-variant">
                        <span>
                            {t(
                                'goals.progressSummary',
                                'Goal progress · {{done}} of {{total}} done',
                                {
                                    done: doneCount,
                                    total: totalCount,
                                }
                            )}
                            {timeUsed !== null &&
                                ` · ${t('project.timeUsed', '{{percent}}% of time used', { percent: timeUsed })}`}
                        </span>
                        <span className="text-body-m font-semibold text-surface-on">
                            {percent}%
                        </span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-surface-high">
                        <div
                            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${percent}%` }}
                        />
                        {timeUsed !== null && (
                            <div
                                className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-surface-on/50"
                                style={{ left: `${timeUsed}%` }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </PageHeader>
    );
};

export default GoalHero;
