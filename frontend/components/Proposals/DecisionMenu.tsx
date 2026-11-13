import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';
import Button from '../Shared/ui/Button';
import { INLINE_FIELD_CLASS } from '../Shared/ui/controlSizes';
import { Decision, sameDecision } from './weekDecisions';

const MENU_WIDTH = 288;
const GAP = 6;

export interface DayChoice {
    date: string;
    label: string;
    long: string;
}

interface DecisionMenuProps {
    anchor: HTMLElement;
    days: DayChoice[];
    current: Decision;
    // The window « Autre date… » accepts (the server's: today to the end of
    // the period plus 30 days).
    minDate?: string;
    maxDate?: string;
    onPick: (decision: Decision) => void;
    onClose: () => void;
}

const OPTION = '[data-decision-option]:not([disabled])';

// The choices of one row: a day of the period, the week, later, as it is,
// dropped, or another day to plan it on (as Android). Arrows move, digits pick a day, Escape closes
// back to the row. Drawn in a portal so the scrolling sheet never clips it.
const DecisionMenu: React.FC<DecisionMenuProps> = ({
    anchor,
    days,
    current,
    minDate,
    maxDate,
    onPick,
    onClose,
}) => {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    // A date off the day chips opens with the date field shown.
    const [otherDate, setOtherDate] = useState<string | null>(
        current.op === 'plan_day' &&
            current.date &&
            !days.some((day) => day.date === current.date)
            ? current.date
            : null
    );

    const place = useCallback(() => {
        const rect = anchor.getBoundingClientRect();
        const height = menuRef.current?.offsetHeight ?? 0;
        const below = rect.bottom + GAP;
        const top =
            below + height > window.innerHeight && rect.top - GAP - height > 8
                ? rect.top - GAP - height
                : below;
        const left = Math.min(
            Math.max(8, rect.right - MENU_WIDTH),
            window.innerWidth - MENU_WIDTH - 8
        );
        setPosition({ top, left });
    }, [anchor]);

    const options = () =>
        Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(OPTION) ?? []
        );

    useEffect(() => {
        place();
        const frame = requestAnimationFrame(() => {
            place();
            const list = options();
            (
                list.find((el) => el.getAttribute('aria-checked') === 'true') ??
                list[0]
            )?.focus();
        });
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                !menuRef.current?.contains(target) &&
                !anchor.contains(target)
            ) {
                onClose();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [anchor, place, onClose]);

    // The date field grows the menu: place it again.
    const dateOpen = otherDate !== null;
    useEffect(() => {
        if (dateOpen) place();
    }, [dateOpen, place]);

    const pick = (decision: Decision) => {
        onPick(decision);
        onClose();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        const inField =
            event.target instanceof HTMLInputElement &&
            event.target.type === 'date';
        const list = options();
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

    const rows: { decision: Decision; label: string }[] = [
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

    return createPortal(
        <div
            ref={menuRef}
            role="menu"
            data-decision-menu=""
            aria-label={t('proposals.decide.menu', 'Choisir')}
            onKeyDown={onKeyDown}
            style={{
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width: MENU_WIDTH,
            }}
            className="fixed z-[70] rounded-card bg-surface p-2 shadow-lg ring-1 ring-outline-variant/70 dark:bg-surface-card"
        >
            {days.length > 0 && (
                <>
                    <div className="px-1.5 pb-1.5 pt-0.5 text-xs font-medium text-surface-on-variant">
                        {t('proposals.decide.planOn', 'Planifier un jour')}
                    </div>
                    <div className="grid grid-cols-4 gap-1 px-0.5 pb-1">
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
                                    className={`h-8 truncate rounded-chip px-1.5 text-label-m outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px] ${
                                        on
                                            ? 'bg-primary text-primary-on'
                                            : 'bg-surface-high text-surface-on hover:bg-surface-highest'
                                    }`}
                                >
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>
                    <div
                        role="separator"
                        className="my-1 h-px bg-outline-variant/60"
                    />
                </>
            )}
            {rows.map(({ decision, label }) => {
                const on = checked(decision);
                return (
                    <button
                        key={decision.op}
                        type="button"
                        role="menuitemradio"
                        aria-checked={on}
                        data-decision-option=""
                        onClick={() => pick(decision)}
                        className="flex min-h-[32px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-body-m text-surface-on outline-none transition-colors duration-100 hover:bg-surface-high focus-visible:bg-surface-high max-sm:min-h-[44px]"
                    >
                        <span className="flex-1 truncate">{label}</span>
                        {on && (
                            <CheckIcon
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-primary"
                            />
                        )}
                    </button>
                );
            })}
            <div role="separator" className="my-1 h-px bg-outline-variant/60" />
            {otherDate === null ? (
                <button
                    type="button"
                    role="menuitem"
                    data-decision-option=""
                    onClick={() => setOtherDate('')}
                    className="flex min-h-[32px] w-full items-center rounded-lg px-2.5 text-left text-body-m text-surface-on outline-none transition-colors duration-100 hover:bg-surface-high focus-visible:bg-surface-high max-sm:min-h-[44px]"
                >
                    {t('proposals.decide.otherDate', 'Autre date…')}
                </button>
            ) : (
                <div className="flex items-center gap-2 px-1 py-1">
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
                        onChange={(event) => setOtherDate(event.target.value)}
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
        </div>,
        document.body
    );
};

export default DecisionMenu;
