import React, { useRef, useState } from 'react';
import { addMinutes } from 'date-fns';
import { CalendarEvent, RESIZE_STEP_MINUTES, clampMinutes } from './taskEvents';

// Drag the bottom edge of a timed block to change where it ends. The block
// previews its new end while the pointer moves and reports it on release.
export const useEventResize = (
    hourHeight: number,
    onResize?: (eventId: string, newEnd: Date) => void
) => {
    const [preview, setPreview] = useState<{ id: string; end: Date } | null>(
        null
    );
    // The click that ends a resize must not open the task.
    const justResized = useRef(false);

    const begin = (event: CalendarEvent, e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startMinutes =
            (event.end.getTime() - event.start.getTime()) / 60000;
        let latest = event.end;
        setPreview({ id: event.id, end: latest });

        const move = (ev: PointerEvent) => {
            const delta =
                Math.round(
                    ((ev.clientY - startY) / hourHeight) *
                        (60 / RESIZE_STEP_MINUTES)
                ) * RESIZE_STEP_MINUTES;
            latest = addMinutes(
                event.start,
                clampMinutes(startMinutes + delta)
            );
            setPreview({ id: event.id, end: latest });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setPreview(null);
            justResized.current = true;
            setTimeout(() => (justResized.current = false), 0);
            if (latest.getTime() !== event.end.getTime())
                onResize?.(event.id, latest);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    return {
        begin,
        resizingId: preview?.id ?? null,
        endOf: (event: CalendarEvent) =>
            preview && preview.id === event.id ? preview.end : event.end,
        consumeClick: () => justResized.current,
    };
};

export const ResizeHandle: React.FC<{
    label: string;
    onPointerDown: (e: React.PointerEvent) => void;
}> = ({ label, onPointerDown }) => (
    <div
        role="separator"
        aria-label={label}
        data-testid="calendar-resize-handle"
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
        onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        className="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize rounded-b-lg hover:bg-black/20"
    />
);
