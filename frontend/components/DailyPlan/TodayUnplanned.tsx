import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClockIcon } from '@heroicons/react/24/outline';
import { CalendarEvent } from '../../utils/calendarFeedsService';
import { PlanCandidates } from '../../utils/dailyPlanService';
import { Task } from '../../entities/Task';
import { Project } from '../../entities/Project';
import { formatMinute } from './planUtils';
import CalendarBadge from './CalendarBadge';
import NotPlannedDrawer from './NotPlannedDrawer';

interface TodayUnplannedProps {
    candidates: PlanCandidates | null;
    events: CalendarEvent[];
    showsFeeds: boolean;
    calendarEnabled: boolean;
    hasDraft: boolean;
    projects: Project[];
    onTaskUpdate: (task: Task) => Promise<void>;
    onTaskDelete: (taskUid: string) => Promise<void>;
}

// The day's tasks come first; planning stays one click away, never a gate.
const TodayUnplanned: React.FC<TodayUnplannedProps> = ({
    candidates,
    events,
    showsFeeds,
    calendarEnabled,
    hasDraft,
    projects,
    onTaskUpdate,
    onTaskDelete,
}) => {
    const { t } = useTranslation();
    const timedEvents = events.filter((e) => !e.all_day);
    const allDay = events.filter((e) => e.all_day);
    const hasEvents = timedEvents.length > 0 || allDay.length > 0;

    return (
        <section className="flex flex-col gap-5" data-testid="today-unplanned">
            <div className="flex justify-end">
                <Link
                    to="/today/plan"
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    data-testid="plan-your-day"
                >
                    <ClockIcon className="h-4 w-4" />
                    {hasDraft
                        ? t('dailyPlan.continuePlanning', 'Continue planning')
                        : t('dailyPlan.planYourDay', 'Plan your day')}
                </Link>
            </div>

            <NotPlannedDrawer
                candidates={candidates}
                plannedUids={new Set()}
                title={t('dailyPlan.todayTasks', "Today's tasks")}
                defaultOpen
                projects={projects}
                onTaskUpdate={onTaskUpdate}
                onTaskDelete={onTaskDelete}
            />

            {calendarEnabled && showsFeeds && hasEvents && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('dailyPlan.fromCalendar', 'From your calendar')}
                    </p>
                    {allDay.map((event) => (
                        <div
                            key={`${event.feed_uid}-${event.uid}-${event.start}`}
                            className="text-sm text-gray-700 dark:text-gray-300"
                        >
                            {t('dailyPlan.allDay', 'All day')} · {event.title}
                        </div>
                    ))}
                    {timedEvents.map((event) => (
                        <div
                            key={`${event.feed_uid}-${event.uid}-${event.start}`}
                            className="flex items-center gap-3 text-sm"
                        >
                            <span className="w-28 shrink-0 text-gray-500 dark:text-gray-400">
                                {formatMinute(event.start_minute ?? 0)}–
                                {formatMinute(event.end_minute ?? 0)}
                            </span>
                            <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                                {event.title}
                            </span>
                            <CalendarBadge
                                name={event.feed_name}
                                color={event.color}
                            />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default TodayUnplanned;
