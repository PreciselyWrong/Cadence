import React, { useCallback, useEffect, useRef, useState } from 'react';
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
// right pane its minimum; remembered per browser. `fits` is false when the
// container is too narrow for both columns (sidebar open on a tablet): the
// panes then stack instead of squeezing the day into a scrolling sliver.
export const usePaneWidth = (containerRef: React.RefObject<HTMLElement>) => {
    const [width, setWidth] = useState(readWidth);
    const [total, setTotal] = useState(0);
    const observed = useRef<{
        el: HTMLElement;
        observer: ResizeObserver;
    } | null>(null);
    // The container mounts only once the day has loaded, and can be
    // replaced: check after every render and follow the current element.
    useEffect(() => {
        const el = containerRef.current;
        if (observed.current?.el === el) return;
        observed.current?.observer.disconnect();
        observed.current = null;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver((entries) => {
            setTotal(entries[0].contentRect.width);
        });
        observer.observe(el);
        observed.current = { el, observer };
    });
    useEffect(() => () => observed.current?.observer.disconnect(), []);
    const clamp = useCallback(
        (value: number) => {
            const available = containerRef.current?.clientWidth || 0;
            const max = available
                ? Math.max(PANE_MIN, available - RIGHT_MIN)
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
    // The stored width can be wider than this window allows.
    const shown = total
        ? Math.min(width, Math.max(PANE_MIN, total - RIGHT_MIN))
        : width;
    const fits = total === 0 || total >= PANE_MIN + RIGHT_MIN;
    return { width: shown, update, fits };
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
