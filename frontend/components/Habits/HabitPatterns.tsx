import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CadenceMonthPattern,
    CadencePatternTally,
    CadencePatterns,
    CadenceDayEntry,
    DayStatus,
} from '../../utils/cadenceHabitsService';

interface HabitPatternsProps {
    patterns: CadencePatterns;
    calendarDays: CadenceDayEntry[];
    color?: string;
}

const BAR_MAX_PX = 64;
const WEEK_FIRST_DAY_UTC = Date.UTC(2024, 0, 1); // a Monday

const percent = (rate: number) => `${Math.round(rate)} %`;

// Monday = 0 … Sunday = 6, to place days in a grid whose first row is Monday.
const mondayIndex = (date: string) =>
    (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const monthStartUtc = (month: string) => {
    const [year, mon] = month.split('-').map(Number);
    return Date.UTC(year, mon - 1, 1);
};

// Full habit colour when given, Tailwind tokens otherwise. Colour arrives as a
// prop, so it is applied inline; the token fallback keeps the page themed.
const fillFor = (
    status: DayStatus,
    color?: string
): { className: string; style?: React.CSSProperties } => {
    if (status === 'MISSED') return { className: 'bg-danger/60' };
    if (
        status === 'UNPLANNED' ||
        status === 'PAUSED' ||
        status === 'NO_ACTIVITY'
    ) {
        return { className: 'bg-surface-high' };
    }
    const minimum = status === 'MINIMUM';
    if (color) {
        return {
            className: minimum ? 'opacity-50' : '',
            style: { backgroundColor: color },
        };
    }
    return { className: minimum ? 'bg-primary/50' : 'bg-primary' };
};

const HabitPatterns: React.FC<HabitPatternsProps> = ({
    patterns,
    calendarDays,
    color,
}) => {
    const { t, i18n } = useTranslation();
    const heatmapRef = useRef<HTMLDivElement>(null);
    // Today sits at the right end: start there, older weeks scroll into view.
    useEffect(() => {
        const el = heatmapRef.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [calendarDays]);
    const language = i18n?.language ?? 'en';

    const statusLabel: Record<DayStatus, string> = {
        IDEAL: t('cadenceHabits.patterns.status.IDEAL', 'Ideal'),
        MINIMUM: t('cadenceHabits.patterns.status.MINIMUM', 'Minimum'),
        ACTIVITY: t('cadenceHabits.patterns.status.ACTIVITY', 'Activity'),
        MISSED: t('cadenceHabits.patterns.status.MISSED', 'Missed'),
        NO_ACTIVITY: t(
            'cadenceHabits.patterns.status.NO_ACTIVITY',
            'No activity'
        ),
        PAUSED: t('cadenceHabits.patterns.status.PAUSED', 'Paused'),
        UNPLANNED: t('cadenceHabits.patterns.status.UNPLANNED', 'Not planned'),
    };

    const dateLabel = (date: string) =>
        new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeZone: 'UTC',
        }).format(new Date(`${date}T00:00:00Z`));

    const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(language, {
            weekday: 'short',
            timeZone: 'UTC',
        }).format(new Date(WEEK_FIRST_DAY_UTC + index * 86_400_000))
    );

    const monthLabel = (month: string) =>
        new Intl.DateTimeFormat(language, {
            month: 'short',
            timeZone: 'UTC',
        }).format(new Date(monthStartUtc(month)));

    const firstOffset = calendarDays.length
        ? mondayIndex(calendarDays[0].date)
        : 0;

    const { year } = patterns;
    const recentMonths: CadenceMonthPattern[] = patterns.months.slice(-12);

    const barStyle = (rate: number | null) => ({
        height: `${rate === null ? 0 : Math.max(2, (rate / 100) * BAR_MAX_PX)}px`,
    });

    const barFill = color ? { backgroundColor: color } : undefined;
    const barClass = color ? '' : 'bg-primary';

    const barTitle = (
        tally: CadencePatternTally,
        name: string
    ): { label: string; visual: string } => {
        if (tally.ratePercent === null) {
            return {
                label: t(
                    'cadenceHabits.patterns.noRate',
                    '{{name}}: not enough days',
                    { name }
                ),
                visual: '–',
            };
        }
        return {
            label: t('cadenceHabits.patterns.rate', '{{name}}: {{rate}}', {
                name,
                rate: percent(tally.ratePercent),
            }),
            visual: percent(tally.ratePercent),
        };
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="mb-2 text-label-m text-surface-on-variant">
                    {t('cadenceHabits.patterns.heatmap', 'Last 365 days')}
                </h3>
                <div ref={heatmapRef} className="overflow-x-auto pb-1">
                    <div
                        className="grid w-max grid-flow-col gap-1"
                        style={{
                            gridTemplateRows: 'repeat(7, 0.75rem)',
                        }}
                    >
                        {calendarDays.map((day, index) => {
                            const slot = firstOffset + index;
                            const fill = fillFor(day.status, color);
                            return (
                                <div
                                    key={day.date}
                                    data-testid="heatmap-cell"
                                    title={t(
                                        'cadenceHabits.patterns.cellStatus',
                                        '{{date}}: {{status}}',
                                        {
                                            date: dateLabel(day.date),
                                            status: statusLabel[day.status],
                                        }
                                    )}
                                    className={`h-3 w-3 rounded-sm ${fill.className}`}
                                    style={{
                                        ...fill.style,
                                        gridColumn: Math.floor(slot / 7) + 1,
                                        gridRow: (slot % 7) + 1,
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <p className="text-body-m text-surface-on">
                {year.ratePercent === null
                    ? t(
                          'cadenceHabits.patterns.yearNotEnough',
                          'Not enough days yet'
                      )
                    : t(
                          'cadenceHabits.patterns.year',
                          'Over 12 months: {{rate}} % ({{done}} of {{counted}} days)',
                          {
                              rate: Math.round(year.ratePercent),
                              done: year.done,
                              counted: year.counted,
                          }
                      )}
            </p>

            <div>
                <h3 className="mb-2 text-label-m text-surface-on-variant">
                    {t('cadenceHabits.patterns.weekdays', 'By weekday')}
                </h3>
                <div className="flex items-end justify-between gap-2">
                    {patterns.weekdays.map((weekday, index) => {
                        const name = weekdayLabels[index];
                        const { label, visual } = barTitle(weekday, name);
                        return (
                            <div
                                key={weekday.day}
                                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                            >
                                <div
                                    className="flex h-16 w-full items-end"
                                    role="img"
                                    aria-label={label}
                                >
                                    <div
                                        className={`w-full rounded-t-sm ${barClass}`}
                                        style={{
                                            ...barStyle(weekday.ratePercent),
                                            ...barFill,
                                        }}
                                    />
                                </div>
                                <span className="text-label-m text-surface-on">
                                    {visual}
                                </span>
                                <span className="text-label-m text-surface-on-variant">
                                    {name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <h3 className="mb-2 text-label-m text-surface-on-variant">
                    {t('cadenceHabits.patterns.months', 'By month')}
                </h3>
                <div className="overflow-x-auto">
                    <div className="flex min-w-[36rem] items-end gap-2">
                        {recentMonths.map((month) => {
                            const name = monthLabel(month.month);
                            const { label, visual } = barTitle(month, name);
                            return (
                                <div
                                    key={month.month}
                                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                                >
                                    <div
                                        className="flex h-16 w-full items-end"
                                        role="img"
                                        aria-label={label}
                                    >
                                        <div
                                            className={`w-full rounded-t-sm ${barClass}`}
                                            style={{
                                                ...barStyle(month.ratePercent),
                                                ...barFill,
                                            }}
                                        />
                                    </div>
                                    <span className="text-label-m text-surface-on">
                                        {visual}
                                    </span>
                                    <span className="text-label-m text-surface-on-variant">
                                        {name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HabitPatterns;
