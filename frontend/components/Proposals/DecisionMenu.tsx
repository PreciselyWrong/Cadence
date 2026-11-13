import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Shared/ui/Button';
import { INLINE_FIELD_CLASS } from '../Shared/ui/controlSizes';
import { Decision, sameDecision } from './weekDecisions';

export interface DayChoice {
    date: string;
    // The short day and its load, « mar. 17 · 30 min ».
    label: string;
    long: string;
}

// What is already planned on the selected day (from the week's `days`).
export interface DayDetailView {
    heading: string;
    items: { id: string; name: string; duration: string }[];
    events: { id: string; title: string; time: string }[];
    work: string | null;
}

interface DecisionMenuProps {
    // The row's decision chip: the picker stays with its row.
    anchor: HTMLElement;
    days: DayChoice[];
    current: Decision;
    detail: DayDetailView | null;
    // The window « Autre date… » accepts (the server's: today to the end of
    // the period plus 30 days).
    minDate?: string;
    maxDate?: string;
    onPick: (decision: Decision) => void;
    onClose: () => void;
}

const OPTION = '[data-decision-option]:not([disabled])';
const optionsOf = (root: HTMLElement | null) =>
    Array.from(root?.querySelectorAll<HTMLElement>(OPTION) ?? []);
const PILL =
    'inline-flex h-8 items-center rounded-full px-3 text-label outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]';
const PILL_ON = 'bg-primary-container text-primary-on-container';
const PILL_OFF =
    'bg-surface-card text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high';

// The inline day picker under a row: what is planned on the selected day,
// then the days of the period with their load, then the horizons. Arrows
// move, digits pick a day, Escape closes back to the row.
const DecisionMenu: React.FC<DecisionMenuProps> = ({
    anchor,
    days,
    current,
    detail,
    minDate,
    maxDate,
    onPick,
    onClose,
}) => {
    const { t } = useTranslation();
    const pickerRef = useRef<HTMLDivElement>(null);
    // A date off the day chips opens with the date field shown.
    const [otherDate, setOtherDate] = useState<string | null>(
        current.op === 'plan_day' &&
            current.date &&
            !days.some((day) => day.date === current.date)
            ? current.date
            : null
    );

    // Opens on the chosen option, in view.
    useEffect(() => {
        const picker = pickerRef.current;
        if (typeof picker?.scrollIntoView === 'function') {
            picker.scrollIntoView({ block: 'nearest' });
        }
        const list = optionsOf(picker);
        (
            list.find((el) => el.getAttribute('aria-checked') === 'true') ??
            list[0]
        )?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                !pickerRef.current?.contains(target) &&
                !anchor.closest('li')?.contains(target)
            ) {
                onClose();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [anchor, onClose]);

    const pick = (decision: Decision) => {
        onPick(decision);
        onClose();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        const inField =
            event.target instanceof HTMLInputElement &&
            event.target.type === 'date';
        const list = optionsOf(pickerRef.current);
        const index = list.indexOf(document.activeElement as HTMLElement);
        const focusAt = (i: number) =>
            list[(i + list.length) % list.length]?.focus();
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
        }
        if (inField) {
            if (event.key === 'Enter' && otherDate) {
                event.preventDefault();
                event.stopPropagation();
                pick({ op: 'plan_day', date: otherDate });
            }
            return;
        }
        if (/^[1-9]$/.test(event.key)) {
            const day = days[Number(event.key) - 1];
            if (day) {
                event.preventDefault();
                event.stopPropagation();
                pick({ op: 'plan_day', date: day.date });
            }
            return;
        }
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                event.preventDefault();
                event.stopPropagation();
                focusAt(index + 1);
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                event.preventDefault();
                event.stopPropagation();
                focusAt(index - 1);
                break;
            case 'Home':
                event.preventDefault();
                focusAt(0);
                break;
            case 'End':
                event.preventDefault();
                focusAt(list.length - 1);
                break;
            case 'Enter':
                // The focused option handles its own Enter; the sheet must not
                // apply on it.
                event.stopPropagation();
                break;
            case 'Tab':
                onClose();
                break;
        }
    };

    const checked = (decision: Decision) => sameDecision(current, decision);

    const horizons: { decision: Decision; label: string }[] = [
        {
            decision: { op: 'this_week' },
            label: t('proposals.ops.thisWeek', 'Cette semaine'),
        },
        {
            decision: { op: 'next_week' },
            label: t('proposals.ops.nextWeek', 'Semaine prochaine'),
        },
        {
            decision: { op: 'this_month' },
            label: t('proposals.ops.thisMonth', 'Ce mois-ci'),
        },
        {
            decision: { op: 'next_month' },
            label: t('proposals.ops.nextMonth', 'Le mois prochain'),
        },
        {
            decision: { op: 'later' },
            label: t('proposals.ops.later', 'Plus tard'),
        },
        {
            decision: { op: 'keep' },
            label: t('proposals.decide.keep', 'Garder tel quel'),
        },
        {
            decision: { op: 'drop' },
            label: t('proposals.ops.drop', 'Abandonner'),
        },
    ];

    return (
        <div
            ref={pickerRef}
            data-decision-picker=""
            className="w-full space-y-3 rounded-card bg-surface-low p-3"
        >
            {detail && (
                <div data-day-detail="" className="space-y-1.5 text-body-m">
                    <p className="font-medium text-surface-on">
                        {detail.heading}
                    </p>
                    {detail.items.length === 0 ? (
                        <p className="text-surface-on-variant">
                            {t('proposals.decide.noItems', 'Rien de prévu')}
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {detail.items.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-baseline justify-between gap-3 text-surface-on"
                                >
                                    <span className="min-w-0 break-words">
                                        {item.name}
                                    </span>
                                    <span className="shrink-0 text-surface-on-variant">
                                        {item.duration}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {detail.events.length === 0 ? (
                        <p className="text-surface-on-variant">
                            {t('proposals.decide.noEvents', 'Rien à l’agenda')}
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {detail.events.map((event) => (
                                <li
                                    key={event.id}
                                    className="flex items-baseline justify-between gap-3 text-surface-on"
                                >
                                    <span className="min-w-0 break-words">
                                        {event.title}
                                    </span>
                                    <span className="shrink-0 text-surface-on-variant">
                                        {event.time}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {detail.work && (
                        <p className="text-surface-on-variant">{detail.work}</p>
                    )}
                </div>
            )}
            <div
                role="menu"
                data-decision-menu=""
                aria-label={t('proposals.decide.menu', 'Choisir')}
                onKeyDown={onKeyDown}
                className="space-y-2"
            >
                {days.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {days.map((day, index) => {
                            const decision: Decision = {
                                op: 'plan_day',
                                date: day.date,
                            };
                            const on = checked(decision);
                            return (
                                <button
                                    key={day.date}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={on}
                                    aria-label={day.long}
                                    title={
                                        index < 9
                                            ? `${day.long} (${index + 1})`
                                            : day.long
                                    }
                                    data-decision-option=""
                                    onClick={() => pick(decision)}
                                    className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
                                >
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {horizons.map(({ decision, label }) => {
                        const on = checked(decision);
                        return (
                            <button
                                key={decision.op}
                                type="button"
                                role="menuitemradio"
                                aria-checked={on}
                                data-decision-option=""
                                onClick={() => pick(decision)}
                                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
                            >
                                {label}
                            </button>
                        );
                    })}
                    {otherDate === null ? (
                        <button
                            type="button"
                            role="menuitem"
                            data-decision-option=""
                            onClick={() => setOtherDate('')}
                            className={`${PILL} ${PILL_OFF}`}
                        >
                            {t('proposals.decide.otherDate', 'Autre date…')}
                        </button>
                    ) : (
                        <div className="flex w-full items-center gap-2">
                            <input
                                type="date"
                                autoFocus
                                data-decision-option=""
                                aria-label={t(
                                    'proposals.decide.otherDate',
                                    'Autre date…'
                                )}
                                min={minDate}
                                max={maxDate}
                                value={otherDate}
                                onChange={(event) =>
                                    setOtherDate(event.target.value)
                                }
                                className={`${INLINE_FIELD_CLASS} min-w-0 flex-1`}
                            />
                            <Button
                                variant="primary"
                                size="md"
                                data-decision-option=""
                                disabled={!otherDate}
                                onClick={() =>
                                    otherDate &&
                                    pick({ op: 'plan_day', date: otherDate })
                                }
                            >
                                {t('proposals.decide.ok', 'OK')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DecisionMenu;
