import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import type { HorizonDropData } from './HorizonColumn';
import { HorizonKey, STRIP_KEYS } from './horizons';

interface StripTargetProps {
    horizon: HorizonKey;
    title: string;
    count: number | null;
    dragging: boolean;
    onOpen(horizon: HorizonKey): void;
}

const StripTarget: React.FC<StripTargetProps> = ({
    horizon,
    title,
    count,
    dragging,
    onOpen,
}) => {
    const { t } = useTranslation();
    const label = t('upcoming.stripOpen', 'Open {{name}} in Horizons', {
        name: title,
    });
    // Same drop data as a horizon column: the board's drop handling sends
    // the card there.
    const { setNodeRef, isOver } = useDroppable({
        id: `strip:${horizon}`,
        data: { kind: 'horizon', key: horizon } satisfies HorizonDropData,
    });
    return (
        <button
            ref={setNodeRef}
            type="button"
            data-testid="horizon-strip-target"
            data-horizon={horizon}
            onClick={() => onOpen(horizon)}
            aria-label={label}
            title={label}
            className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-body-m transition-colors duration-150 ${
                isOver
                    ? 'bg-primary-container text-primary-on-container ring-2 ring-primary'
                    : dragging
                      ? 'bg-surface text-surface-on outline-dashed outline-1 outline-primary/60'
                      : 'text-surface-on-variant hover:bg-surface-high hover:text-surface-on'
            }`}
        >
            <span className="truncate">{title}</span>
            {!!count && (
                <span className="shrink-0 tabular-nums text-surface-on-variant">
                    {count}
                </span>
            )}
        </button>
    );
};

interface HorizonStripProps {
    titles: Record<HorizonKey, string>;
    // null while the horizon tasks load.
    counts: Partial<Record<HorizonKey, number>> | null;
    dragging: boolean;
    onOpen(horizon: HorizonKey): void;
}

/**
 * The Days layout's slim bar of horizons past this week: drop a card on one
 * to send it there without switching layout; a click opens Horizons on it.
 */
const HorizonStrip: React.FC<HorizonStripProps> = ({
    titles,
    counts,
    dragging,
    onOpen,
}) => {
    const { t } = useTranslation();
    return (
        <nav
            aria-label={t('upcoming.stripLabel', 'Send to a horizon')}
            data-testid="horizon-strip"
            className="flex shrink-0 items-center gap-1 rounded-xl bg-surface-high/70 p-1"
        >
            {STRIP_KEYS.map((key) => (
                <StripTarget
                    key={key}
                    horizon={key}
                    title={titles[key]}
                    count={counts ? (counts[key] ?? 0) : null}
                    dragging={dragging}
                    onOpen={onOpen}
                />
            ))}
        </nav>
    );
};

export default HorizonStrip;
