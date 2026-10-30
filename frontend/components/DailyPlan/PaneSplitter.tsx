import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const PANE_MIN = 280;
export const PANE_DEFAULT = 400;
const RIGHT_MIN = 360;
const KEY_STEP = 24;
const WIDTH_KEY = 'today.leftWidth';

const readWidth = (): number => {
    try {
        const stored = Number(window.localStorage.getItem(WIDTH_KEY));
        if (Number.isFinite(stored) && stored >= PANE_MIN) return stored;
    } catch {
        // Fall back to the default width.
    }
    return PANE_DEFAULT;
};

const writeWidth = (width: number) => {
    try {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
    } catch {
        // The width only lasts for this page view.
    }
};

// Width in px of the left column, kept between PANE_MIN and what leaves the
// right pane its minimum; remembered per browser.
export const usePaneWidth = (containerRef: React.RefObject<HTMLElement>) => {
    const [width, setWidth] = useState(readWidth);
    const clamp = useCallback(
        (value: number) => {
            const total = containerRef.current?.clientWidth || 0;
            const max = total
                ? Math.max(PANE_MIN, total - RIGHT_MIN)
                : Infinity;
            return Math.min(max, Math.max(PANE_MIN, value));
        },
        [containerRef]
    );
    const update = useCallback(
        (value: number, persist = false) => {
            const next = clamp(value);
            setWidth(next);
            if (persist) writeWidth(next);
        },
        [clamp]
    );
    return { width, update };
};

interface PaneSplitterProps {
    width: number;
    containerRef: React.RefObject<HTMLElement>;
    onChange: (width: number, persist?: boolean) => void;
}

const PaneSplitter: React.FC<PaneSplitterProps> = ({
    width,
    containerRef,
    onChange,
}) => {
    const { t } = useTranslation();
    const dragging = useRef(false);

    const move = (clientX: number) => {
        const left = containerRef.current?.getBoundingClientRect().left ?? 0;
        onChange(clientX - left);
    };

    const end = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        dragging.current = false;
        const left = containerRef.current?.getBoundingClientRect().left ?? 0;
        onChange(event.clientX - left, true);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('dailyPlan.resizePanes', 'Resize the columns')}
            aria-valuemin={PANE_MIN}
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            data-testid="pane-splitter"
            className="hidden w-1.5 shrink-0 cursor-col-resize touch-none self-stretch rounded transition-colors hover:bg-blue-500/30 focus-visible:bg-blue-500/40 focus:outline-none active:bg-blue-500/50 md:block"
            onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                dragging.current = true;
            }}
            onPointerMove={(event) => {
                if (dragging.current) move(event.clientX);
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(event) => {
                let next: number | null = null;
                if (event.key === 'ArrowLeft') next = width - KEY_STEP;
                if (event.key === 'ArrowRight') next = width + KEY_STEP;
                if (event.key === 'Home') next = PANE_MIN;
                if (event.key === 'End') next = Infinity;
                if (next === null) return;
                event.preventDefault();
                onChange(next, true);
            }}
            onDoubleClick={() => onChange(PANE_DEFAULT, true)}
        />
    );
};

export default PaneSplitter;
