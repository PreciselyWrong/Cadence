import React from 'react';
import { useTranslation } from 'react-i18next';
import { BriefSettings, BriefTimelineDay } from '../../utils/dailyBriefService';
import { getTodayDateString } from '../../utils/dateUtils';
import {
    AXIS_END,
    AXIS_START,
    capitalizeFirst,
    eveningFill,
    formatClock,
    loadLabel,
    minutesText,
    parseClock,
    spanPercent,
} from './briefTime';

interface BriefTimelineProps {
    days: BriefTimelineDay[];
    settings: BriefSettings;
    locale: string;
}

const AXIS_MARKS = [8, 12, 17, 22];

const weekdayOf = (date: string): number =>
    new Date(`${date}T12:00:00`).getDay();

// A day's bands: work (focus blocks, hatched when a day note says the day is
// partial), the evening window (its fill is what is already planned), and
// timed events as dark bars, red on a conflict. No text inside a band.
const BriefDay: React.FC<{
    day: BriefTimelineDay;
    settings: BriefSettings;
    locale: string;
}> = ({ day, settings, locale }) => {
    const { t } = useTranslation();
    const weekday = weekdayOf(day.date);
    const isToday = day.date === getTodayDateString();
    const dayNote = settings.capacity.dayNotes[String(weekday)];
    const evening = settings.capacity.evening[String(weekday)];
    const eveningStart = parseClock(evening?.start);
    const eveningEnd = parseClock(evening?.end);
    const eveningBand =
        eveningStart !== null && eveningEnd !== null
            ? spanPercent(eveningStart, eveningEnd)
            : null;

    const label = loadLabel(
        day.load.task_minutes ?? day.load.planned_minutes,
        day.load.capacity_minutes,
        {
            over: (planned, capacity) =>
                t(
                    'dailyBrief.timeline.over',
                    'Surcharge : {{planned}} de tâches pour {{capacity}} de libre',
                    {
                        planned: minutesText(planned, t),
                        capacity: minutesText(capacity, t),
                    }
                ),
            ofCapacity: (planned, capacity) =>
                t(
                    'dailyBrief.timeline.ofCapacity',
                    '{{planned}} de tâches pour {{capacity}} de libre',
                    {
                        planned: minutesText(planned, t),
                        capacity: minutesText(capacity, t),
                    }
                ),
            planned: (minutes) =>
                t('dailyBrief.timeline.planned', '{{minutes}} min', {
                    minutes,
                }),
        }
    );

    const dayName = isToday
        ? t('dailyBrief.timeline.today', "Aujourd'hui")
        : new Intl.DateTimeFormat(locale, {
              weekday: 'long',
              day: 'numeric',
          }).format(new Date(`${day.date}T12:00:00`));

    const timedEvents = day.events.filter(
        (event) =>
            !event.all_day &&
            event.start_minute !== null &&
            event.end_minute !== null
    );

    return (
        <div className="mt-4" data-testid={`brief-day-${day.date}`}>
            <div className="flex items-baseline justify-between text-sm font-semibold text-gray-900 dark:text-gray-100">
                <span>{capitalizeFirst(dayName)}</span>
                <span
                    className={`font-normal tabular-nums ${
                        label.over
                            ? 'font-bold text-gray-900 dark:text-white'
                            : 'text-gray-600 dark:text-gray-300'
                    }`}
                >
                    {label.text}
                </span>
            </div>
            <div className="relative mt-1.5 h-7 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                {day.work.map((block, index) => {
                    const span = spanPercent(block.start, block.end);
                    return (
                        <div
                            key={`work-${index}`}
                            data-testid="brief-band-work"
                            className={`absolute inset-y-0 ${
                                dayNote
                                    ? 'bg-[repeating-linear-gradient(135deg,#d4d4d8_0_6px,transparent_6px_12px)] dark:bg-[repeating-linear-gradient(135deg,#52525b_0_6px,transparent_6px_12px)]'
                                    : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={{
                                left: `${span.left}%`,
                                width: `${span.width}%`,
                            }}
                        />
                    );
                })}
                {eveningBand && (
                    <div
                        data-testid="brief-band-evening"
                        className="absolute inset-y-0 border-l border-dashed border-gray-400 dark:border-gray-500"
                        style={{
                            left: `${eveningBand.left}%`,
                            width: `${eveningBand.width}%`,
                        }}
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-indigo-100 dark:bg-indigo-900/50"
                            style={{
                                width: `${
                                    eveningFill(
                                        day.load.planned_minutes,
                                        evening?.minutes ?? 0
                                    ) * 100
                                }%`,
                            }}
                        />
                    </div>
                )}
                {timedEvents.map((event) => {
                    const span = spanPercent(
                        event.start_minute as number,
                        event.end_minute as number
                    );
                    return (
                        <div
                            key={event.ref}
                            data-testid={
                                event.conflict
                                    ? 'brief-event-conflict'
                                    : 'brief-event'
                            }
                            className={`absolute top-2 bottom-2 min-w-[6px] rounded-md ${
                                event.conflict
                                    ? 'bg-red-600'
                                    : 'bg-gray-700 dark:bg-gray-300'
                            }`}
                            style={{
                                left: `${span.left}%`,
                                width: `${Math.max(span.width, 1)}%`,
                            }}
                        />
                    );
                })}
            </div>
            {(timedEvents.length > 0 || dayNote) && (
                <p className="mt-1.5 text-[13px] tabular-nums text-gray-600 dark:text-gray-300">
                    {dayNote && <span className="mr-2">{dayNote}</span>}
                    {timedEvents.map((event, index) => (
                        <span key={event.ref}>
                            {index > 0 && ' · '}
                            <span
                                className={
                                    event.conflict
                                        ? 'font-medium text-red-600 dark:text-red-400'
                                        : undefined
                                }
                            >
                                {formatClock(event.start_minute as number)}{' '}
                                {event.title}
                                {event.conflict &&
                                    ` (${t('dailyBrief.timeline.duringWork', 'pendant le travail')})`}
                            </span>
                        </span>
                    ))}
                </p>
            )}
        </div>
    );
};

const BriefTimeline: React.FC<BriefTimelineProps> = ({
    days,
    settings,
    locale,
}) => {
    const { t } = useTranslation();
    return (
        <div>
            <div className="relative mt-2 h-4 text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
                {AXIS_MARKS.map((hour) => {
                    const minute = hour * 60;
                    const position = spanPercent(minute, minute).left;
                    const isEnd = minute === AXIS_END;
                    return (
                        <span
                            key={hour}
                            className="absolute whitespace-nowrap"
                            style={{
                                left: `${position}%`,
                                transform: isEnd
                                    ? 'translateX(-100%)'
                                    : minute === AXIS_START
                                      ? 'none'
                                      : 'translateX(-50%)',
                            }}
                        >
                            {formatClock(minute)}
                        </span>
                    );
                })}
            </div>
            {days.map((day) => (
                <BriefDay
                    key={day.date}
                    day={day}
                    settings={settings}
                    locale={locale}
                />
            ))}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-300">
                <LegendItem
                    swatch="bg-gray-300 dark:bg-gray-600"
                    label={t('dailyBrief.timeline.legendWork', 'Travail')}
                />
                <LegendItem
                    swatch="bg-indigo-100 dark:bg-indigo-900/50"
                    label={t('dailyBrief.timeline.legendEvening', 'Soir')}
                />
                <LegendItem
                    swatch="bg-gray-700 dark:bg-gray-300"
                    label={t('dailyBrief.timeline.legendEvent', 'Événement')}
                />
                <LegendItem
                    swatch="bg-red-600"
                    label={t('dailyBrief.timeline.legendConflict', 'Conflit')}
                />
            </div>
        </div>
    );
};

const LegendItem: React.FC<{ swatch: string; label: string }> = ({
    swatch,
    label,
}) => (
    <span className="inline-flex items-center gap-1.5">
        <i className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
        {label}
    </span>
);

export default BriefTimeline;
