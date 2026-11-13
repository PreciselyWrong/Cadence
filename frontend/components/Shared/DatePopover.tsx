import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import ChipPopover, { ChipPopoverTriggerProps } from './ChipPopover';
import { DATE_SHORTCUTS, DateShortcut } from '../../utils/dateShortcuts';
import {
    buildMonthGrid,
    datePresets,
    formatDateLabel,
    toYmd,
} from '../../utils/datePresets';
import { NaturalDate, parseNaturalDate } from '../../utils/naturalDate';
import {
    getFirstDayOfWeek,
    getLocaleFirstDayOfWeek,
} from '../../utils/profileService';
import { resolveUserLocale } from '../../utils/localeUtils';
import { CONTROL_HEIGHT, FIELD_HEIGHT } from './ui/controlSizes';
import type { Task } from '../../entities/Task';
import {
    Commitment,
    HORIZON_KEYS,
    HorizonKey,
    commitmentOf,
} from '../Upcoming/horizons';

export interface DateValue {
    date: string | null;
    time: string | null;
}

interface DatePopoverProps {
    value: DateValue;
    onChange: (value: DateValue) => void;
    label: string;
    renderTrigger: (props: DateTriggerProps) => React.ReactNode;
    // Hides the time field, for date-only fields
    withTime?: boolean;
    // The task sheet's due chip: a « Later » row of horizons replaces the
    // « Next week » quick choice; the trigger learns the task's commitment.
    horizons?: {
        task: Task;
        // `from` is the task's commitment before the pick.
        onPick: (key: HorizonKey, from: Commitment | null) => void;
    };
}

export interface DateTriggerProps extends ChipPopoverTriggerProps {
    display: string | null;
    commitment: Commitment | null;
}

const PARSE_DELAY_MS = 300;

const itemClass = `flex ${CONTROL_HEIGHT.md} w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-100 dark:hover:bg-gray-700`;

// Quick choices, a typed date ("demain 14h", "vendredi") with a live preview,
// a month calendar and an optional time. One component for every date chip.
const DatePopover: React.FC<DatePopoverProps> = ({
    value,
    onChange,
    label,
    renderTrigger,
    withTime = true,
    horizons,
}) => {
    const { t, i18n } = useTranslation();
    const locale = useMemo(
        () => resolveUserLocale(i18n?.language),
        [i18n?.language]
    );
    const [firstDay, setFirstDay] = useState(() =>
        getLocaleFirstDayOfWeek(i18n?.language || 'en')
    );

    useEffect(() => {
        let cancelled = false;
        getFirstDayOfWeek()
            .then((day) => !cancelled && setFirstDay(day))
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const display = value.date
        ? formatDateLabel(value.date, withTime ? value.time : null, locale)
        : null;
    const commitment = horizons
        ? commitmentOf(horizons.task, toYmd(new Date()), firstDay)
        : null;

    return (
        <ChipPopover
            label={label}
            widthClass="w-80"
            renderTrigger={(props) =>
                renderTrigger({ ...props, display, commitment })
            }
        >
            {(close) => (
                <DatePanel
                    value={value}
                    firstDay={firstDay}
                    locale={locale}
                    withTime={withTime}
                    horizon={
                        horizons
                            ? {
                                  current: value.date ? null : commitment,
                                  onPick: (key) => {
                                      horizons.onPick(key, commitment);
                                      close();
                                  },
                              }
                            : undefined
                    }
                    onPick={(next) => {
                        onChange(next);
                        close();
                    }}
                    onTime={(time) =>
                        onChange({
                            date: value.date ?? toYmd(new Date()),
                            time,
                        })
                    }
                    t={t}
                />
            )}
        </ChipPopover>
    );
};

interface DatePanelProps {
    value: DateValue;
    firstDay: number;
    locale: string;
    withTime: boolean;
    horizon?: {
        current: Commitment | null;
        onPick: (key: HorizonKey) => void;
    };
    onPick: (value: DateValue) => void;
    onTime: (time: string | null) => void;
    t: (key: string, fallback: string) => string;
}

const horizonChipClass = (current: boolean) =>
    `${CONTROL_HEIGHT.sm} rounded-full px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        current
            ? 'bg-primary text-primary-on'
            : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-100 dark:hover:bg-gray-700'
    }`;

const DatePanel: React.FC<DatePanelProps> = ({
    value,
    firstDay,
    locale,
    withTime,
    horizon,
    onPick,
    onTime,
    t,
}) => {
    const todayYmd = toYmd(new Date());
    const anchor = value.date
        ? new Date(`${value.date.slice(0, 10)}T00:00:00`)
        : new Date();
    const [month, setMonth] = useState({
        year: anchor.getFullYear(),
        month: anchor.getMonth(),
    });
    const [typed, setTyped] = useState('');
    const [parsed, setParsed] = useState<NaturalDate | null>(null);
    const [parsing, setParsing] = useState(false);
    const requestId = useRef(0);

    useEffect(() => {
        const text = typed.trim();
        const id = ++requestId.current;
        if (!text) {
            setParsed(null);
            setParsing(false);
            return;
        }
        setParsing(true);
        const timer = window.setTimeout(async () => {
            const result = await parseNaturalDate(text);
            if (requestId.current !== id) return;
            setParsed(result);
            setParsing(false);
        }, PARSE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [typed]);

    const presets = useMemo(
        () => datePresets(new Date(), firstDay),
        [firstDay]
    );
    const presetLabel: Record<DateShortcut, string> = {
        today: t('datePopover.today', 'Today'),
        tomorrow: t('datePopover.tomorrow', 'Tomorrow'),
        weekend: t('datePopover.weekend', 'This weekend'),
        next_week: t('datePopover.nextWeek', 'Next week'),
    };
    // With the horizons row, « Next week » is the horizon, not a Monday.
    const shortcuts = horizon
        ? DATE_SHORTCUTS.filter((kind) => kind !== 'next_week')
        : DATE_SHORTCUTS;
    const horizonLabel: Record<HorizonKey, string> = {
        week: t('upcoming.thisWeek', 'This week'),
        next_week: t('upcoming.horizonNextWeek', 'Next week'),
        this_month: t('upcoming.thisMonth', 'This month'),
        next_month: t('upcoming.nextMonth', 'Next month'),
        someday: t('upcoming.someday', 'Someday'),
    };

    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const monthLabel = new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
    }).format(new Date(month.year, month.month, 1));
    // 2026-11-01 is a Sunday
    const weekdays = Array.from({ length: 7 }, (_, i) =>
        weekdayFormat.format(new Date(2026, 10, 1 + ((firstDay + i) % 7)))
    );
    const grid = buildMonthGrid(month.year, month.month, firstDay);
    const keepTime = withTime ? value.time : null;

    const shiftMonth = (delta: number) =>
        setMonth(({ year, month: m }) => {
            const next = new Date(year, m + delta, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
        });

    const applyParsed = () => {
        if (parsed) {
            onPick({
                date: parsed.date,
                time: withTime ? parsed.time : null,
            });
        }
    };

    const short = (ymd: string) =>
        new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        });

    return (
        <div className="space-y-2">
            <div>
                <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            applyParsed();
                        }
                    }}
                    placeholder={t(
                        'datePopover.typePlaceholder',
                        'Type a date: tomorrow 2pm, Friday…'
                    )}
                    aria-label={t('datePopover.typeLabel', 'Date in words')}
                    className={`${FIELD_HEIGHT} w-full rounded-xl bg-gray-100 px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-900 dark:text-gray-100`}
                />
                {typed.trim() && (
                    <p
                        aria-live="polite"
                        data-testid="date-popover-preview"
                        className="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                        {parsing
                            ? '…'
                            : parsed
                              ? `${t('datePopover.preview', 'Understood')} : ${formatDateLabel(
                                    parsed.date,
                                    withTime ? parsed.time : null,
                                    locale
                                )}`
                              : t('datePopover.noMatch', 'Date not understood')}
                    </p>
                )}
            </div>

            <div
                role="group"
                aria-label={t('datePopover.quick', 'Quick choices')}
            >
                {shortcuts.map((kind) => (
                    <button
                        key={kind}
                        type="button"
                        onClick={() =>
                            onPick({ date: presets[kind], time: keepTime })
                        }
                        className={itemClass}
                    >
                        <span>{presetLabel[kind]}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {short(presets[kind])}
                        </span>
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => onPick({ date: null, time: null })}
                    className={itemClass}
                >
                    <span>{t('datePopover.noDate', 'No date')}</span>
                </button>
            </div>

            {horizon && (
                <div
                    role="group"
                    aria-label={t('datePopover.later', 'Later')}
                    data-testid="date-popover-horizons"
                    className="px-1"
                >
                    <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('datePopover.later', 'Later')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {HORIZON_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={horizon.current === key}
                                data-testid={`date-horizon-${key}`}
                                onClick={() => horizon.onPick(key)}
                                className={horizonChipClass(
                                    horizon.current === key
                                )}
                            >
                                {horizonLabel[key]}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="rounded-xl bg-gray-50 p-2 dark:bg-gray-900/50">
                <div className="mb-1 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        aria-label={t(
                            'datePopover.prevMonth',
                            'Previous month'
                        )}
                        className="rounded-full p-1 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium capitalize text-gray-800 dark:text-gray-100">
                        {monthLabel}
                    </span>
                    <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        aria-label={t('datePopover.nextMonth', 'Next month')}
                        className="rounded-full p-1 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        <ChevronRightIcon className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid grid-cols-7 text-center text-[11px] text-gray-500 dark:text-gray-400">
                    {weekdays.map((d, i) => (
                        <span key={i} className="py-1">
                            {d}
                        </span>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                    {grid.map((cell) => {
                        const selected = cell.date === value.date?.slice(0, 10);
                        const isToday = cell.date === todayYmd;
                        return (
                            <button
                                key={cell.date}
                                type="button"
                                aria-pressed={selected}
                                aria-label={short(cell.date)}
                                onClick={() =>
                                    onPick({ date: cell.date, time: keepTime })
                                }
                                className={`mx-auto h-8 w-8 rounded-full text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                    selected
                                        ? 'bg-primary font-medium text-primary-on'
                                        : isToday
                                          ? 'font-semibold text-primary hover:bg-gray-200 dark:hover:bg-gray-700'
                                          : cell.inMonth
                                            ? 'text-gray-800 hover:bg-gray-200 dark:text-gray-100 dark:hover:bg-gray-700'
                                            : 'text-gray-400 hover:bg-gray-200 dark:text-gray-600 dark:hover:bg-gray-700'
                                }`}
                            >
                                {Number(cell.date.slice(8, 10))}
                            </button>
                        );
                    })}
                </div>
            </div>

            {withTime && (
                <div className="flex items-center justify-between gap-2 px-1">
                    <label
                        htmlFor="date-popover-time"
                        className="text-sm text-gray-700 dark:text-gray-300"
                    >
                        {t('datePopover.time', 'Time')}
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="date-popover-time"
                            type="time"
                            value={value.time ?? ''}
                            onChange={(e) => onTime(e.target.value || null)}
                            className={`${CONTROL_HEIGHT.sm} rounded-lg bg-gray-100 px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-900 dark:text-gray-100`}
                        />
                        {value.time && (
                            <button
                                type="button"
                                onClick={() => onTime(null)}
                                className="text-xs text-primary hover:underline"
                            >
                                {t('datePopover.clearTime', 'Sans heure')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatePopover;
