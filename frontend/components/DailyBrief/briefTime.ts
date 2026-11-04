// Pure helpers of the brief timeline: the axis, positions and labels. The
// axis is fixed for now (08:00 to 22:00), see docs/fork/WEB-UX-NOTES.md.

export const AXIS_START = 8 * 60;
export const AXIS_END = 22 * 60;
const AXIS_SPAN = AXIS_END - AXIS_START;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

// Left/width of a span in percent of the axis, clipped to it.
export const spanPercent = (
    start: number,
    end: number
): { left: number; width: number } => {
    const from = clamp(start, AXIS_START, AXIS_END);
    const to = clamp(end, AXIS_START, AXIS_END);
    return {
        left: ((from - AXIS_START) / AXIS_SPAN) * 100,
        width: Math.max(0, ((to - from) / AXIS_SPAN) * 100),
    };
};

// First letter upper-cased: CSS `capitalize` would also upper-case every word
// of a French date ("4 Novembre").
export const capitalizeFirst = (text: string): string =>
    text.charAt(0).toUpperCase() + text.slice(1);

export const formatClock = (minute: number): string => {
    const hours = Math.floor(minute / 60) % 24;
    const minutes = minute % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// "HH:mm" to minutes after midnight, or null when malformed.
export const parseClock = (value: string | undefined | null): number | null => {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

export interface LoadLabel {
    text: string;
    over: boolean;
}

// "40 / 90 min", or "15 min de trop" in bold when the planned minutes exceed
// the capacity. Without a capacity, only the planned minutes.
export const loadLabel = (
    planned: number,
    capacity: number | null,
    format: {
        over: (minutes: number) => string;
        ofCapacity: (planned: number, capacity: number) => string;
        planned: (minutes: number) => string;
    }
): LoadLabel => {
    if (capacity === null) {
        return { text: format.planned(planned), over: false };
    }
    if (planned > capacity) {
        return { text: format.over(planned - capacity), over: true };
    }
    return { text: format.ofCapacity(planned, capacity), over: false };
};

// Fraction of the evening window already planned, 0 to 1.
export const eveningFill = (planned: number, capacity: number): number =>
    capacity > 0 ? clamp(planned / capacity, 0, 1) : 0;
