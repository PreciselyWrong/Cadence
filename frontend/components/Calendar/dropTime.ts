import type React from 'react';

// Drops on the hour grid land in quarter hours.
export const DROP_STEP_MINUTES = 15;

// Minute of the day where a dragged block's top lands when it is dropped on
// the cell of `hour`: the pointer's height in that cell, less how far below
// the block's top it was grabbed, in 15-minute steps and inside the day.
// Without a pointer position (keyboard, tests) the block lands on the hour.
export const dropMinuteOfDay = (
    hour: number,
    pointerInCell: number,
    grabOffset: number,
    hourHeight: number
): number => {
    if (!Number.isFinite(pointerInCell) || hourHeight <= 0) return hour * 60;
    const offset = Number.isFinite(grabOffset) ? grabOffset : 0;
    const raw = hour * 60 + ((pointerInCell - offset) / hourHeight) * 60;
    const snapped = Math.round(raw / DROP_STEP_MINUTES) * DROP_STEP_MINUTES;
    return Math.max(0, Math.min(24 * 60 - DROP_STEP_MINUTES, snapped));
};

// How far below the element's top the pointer is, in pixels.
export const pointerOffsetIn = (e: React.DragEvent): number =>
    e.clientY - e.currentTarget.getBoundingClientRect().top;
