import React, { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowPathIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import type { PushedItem, TaskDecision } from '../../utils/reviewService';

// Tasks pushed back again and again (3 times or more in 30 days, the
// review's rule, docs/34-review.md): a badge on their cards and a section of
// the Plan board's left column (docs/03-upcoming-view.md).

// uid -> pushes in the last 30 days, for the cards' badge.
export const PushedCountsContext = createContext<ReadonlyMap<string, number>>(
    new Map()
);

export const PushedBadge: React.FC<{ uid: string }> = ({ uid }) => {
    const { t } = useTranslation();
    const count = useContext(PushedCountsContext).get(uid);
    if (!count) return null;
    return (
        <span
            data-testid="pushed-badge"
            title={t(
                'upcoming.pushedBadge',
                'Pushed back {{count}} times in 30 days',
                { count }
            )}
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-warning-container/60 px-1 text-xs font-semibold tabular-nums text-warning"
        >
            <ArrowPathIcon aria-hidden="true" className="h-3 w-3" />
            {count}×
        </span>
    );
};

const STORE_KEY = 'upcoming.leftCollapsed.pushed';

interface PushedSectionProps {
    items: PushedItem[];
    width: number;
    onOpenTask(uid: string): void;
    // A review decision; `reviewed: true` is added (the count starts again).
    onDecide(uid: string, decision: TaskDecision): void;
}

const PushedSection: React.FC<PushedSectionProps> = ({
    items,
    width,
    onOpenTask,
    onDecide,
}) => {
    const { t } = useTranslation();
    const [folded, setFolded] = useState(() => {
        try {
            return localStorage.getItem(STORE_KEY) === '1';
        } catch {
            return false;
        }
    });
    if (items.length === 0) return null;
    const toggle = () => {
        const next = !folded;
        setFolded(next);
        try {
            localStorage.setItem(STORE_KEY, next ? '1' : '0');
        } catch {
            // Folding still works for this visit.
        }
    };
    const title = t('upcoming.pushedTitle', 'Pushed back');
    const entries = (item: PushedItem): MenuEntry[] => {
        const uid = item.task.uid as string;
        const a = (key: string, fallback: string) =>
            t(`review.actions.${key}`, fallback);
        return [
            { heading: item.task.name },
            {
                key: 'open',
                label: t('upcoming.preview.open', 'Show the task'),
                onSelect: () => onOpenTask(uid),
            },
            'separator',
            {
                key: 'today',
                label: a('today', 'Do today'),
                onSelect: () => onDecide(uid, { today: true }),
            },
            {
                key: 'split',
                label: a('split', 'Break into steps'),
                onSelect: () => onOpenTask(uid),
            },
            {
                key: 'later',
                label: a('later', 'Later'),
                onSelect: () => onDecide(uid, { later: true }),
            },
            {
                key: 'done',
                label: t('upcoming.preview.done', 'Mark as done'),
                onSelect: () => onDecide(uid, { status: 'done' }),
            },
            {
                key: 'drop',
                label: a('drop', 'Drop'),
                danger: true,
                onSelect: () => onDecide(uid, { status: 'cancelled' }),
            },
            'separator',
            {
                key: 'keep',
                label: a('keep', 'Keep as is'),
                onSelect: () => onDecide(uid, {}),
            },
        ];
    };
    return (
        <section
            data-testid="pushed-section"
            aria-label={title}
            style={{ width }}
            className="flex shrink-0 flex-col gap-1.5 rounded-2xl bg-warning-container/20 p-2 ring-1 ring-warning/30"
        >
            <h2 className="text-body font-semibold text-surface-on">
                <button
                    type="button"
                    aria-expanded={!folded}
                    aria-label={t(
                        'upcoming.sectionToggle',
                        'Show or hide {{name}}',
                        { name: title }
                    )}
                    onClick={toggle}
                    className="flex w-full items-center gap-1 rounded-md px-1 text-left hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 text-surface-on-variant transition-transform duration-150 ${
                            folded ? '' : 'rotate-90'
                        }`}
                    />
                    <span className="flex-1">{title}</span>
                    <span className="text-xs font-normal tabular-nums text-surface-on-variant">
                        {items.length}
                    </span>
                </button>
            </h2>
            {!folded &&
                items.map((item) => (
                    <Menu
                        key={item.task.uid}
                        entries={entries(item)}
                        align="start"
                        trigger={({ ref, ...props }) => (
                            <button
                                type="button"
                                ref={ref}
                                {...props}
                                aria-label={item.task.name}
                                className="w-full rounded-lg border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-left hover:border-outline-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                <span className="block break-words text-body-m leading-5 text-surface-on">
                                    {item.task.name}
                                </span>
                                <span className="mt-0.5 block text-xs tabular-nums text-surface-on-variant">
                                    {t(
                                        'upcoming.pushedMeta',
                                        '{{count}}× in 30 days',
                                        { count: item.push.recent_count }
                                    )}
                                </span>
                            </button>
                        )}
                    />
                ))}
        </section>
    );
};

export default PushedSection;
