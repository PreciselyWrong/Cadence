import type { CSSProperties } from 'react';
import { ACCENT, accentVars, resolveColor } from '../../constants/colorPalette';
import type { Commitment } from '../Upcoming/horizons';

// The colour of a chip of the task sheet: each filled chip takes the colour
// of what it holds, an empty one stays a quiet grey. `horizon` (soft violet)
// and `low` (soft blue) are palette hues; `{ color }` is a project's or a
// tag's own colour.
export type ChipTone =
    | 'empty'
    | 'neutral'
    | 'danger'
    | 'success'
    | 'warning'
    | 'horizon'
    | 'low'
    | { color: string };

const HORIZON_COLOR = 'purple';
const LOW_COLOR = 'blue';

// Overdue red, today green, another day neutral; without a date, a passed
// commitment is red (« À replanifier ») and a horizon violet.
export const dueTone = ({
    date,
    today,
    commitment = null,
}: {
    date: string | null;
    today: string;
    commitment?: Commitment | null;
}): ChipTone => {
    if (date) {
        const day = date.slice(0, 10);
        if (day < today) return 'danger';
        return day === today ? 'success' : 'neutral';
    }
    if (commitment === 'replan') return 'danger';
    return commitment ? 'horizon' : 'empty';
};

export const priorityTone = (
    priority: 'low' | 'medium' | 'high' | null
): ChipTone =>
    priority === 'high'
        ? 'danger'
        : priority === 'medium'
          ? 'warning'
          : priority === 'low'
            ? 'low'
            : 'empty';

// A colour from the palette (or a legacy hex); none gives a neutral chip.
export const colorTone = (color: string | null | undefined): ChipTone => {
    const resolved = resolveColor(color);
    return resolved ? { color: resolved.value } : 'neutral';
};

export const filledTone = (filled: boolean): ChipTone =>
    filled ? 'neutral' : 'empty';

const CLASSES: Record<Exclude<ChipTone, object>, string> = {
    empty: 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-400 dark:hover:bg-gray-700',
    neutral:
        'bg-surface-highest text-surface-on hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-50 dark:hover:bg-gray-500',
    danger: 'bg-danger-container/70 text-danger-on-container hover:bg-danger-container',
    success: 'bg-success-container/60 text-success hover:bg-success-container',
    warning: 'bg-warning-container/70 text-warning hover:bg-warning-container',
    horizon: '',
    low: '',
};

// A tint of the colour with text pulled toward the mode's ink, so any hue
// keeps AA contrast (ACCENT.softBg, ACCENT.chipText).
const TINTED = `${ACCENT.softBg} ${ACCENT.chipText} hover:brightness-95 dark:hover:brightness-110`;

export const chipToneProps = (
    tone: ChipTone
): { className: string; style?: CSSProperties } => {
    if (typeof tone === 'object' || tone === 'horizon' || tone === 'low') {
        const color = resolveColor(
            typeof tone === 'object'
                ? tone.color
                : tone === 'horizon'
                  ? HORIZON_COLOR
                  : LOW_COLOR
        );
        return { className: TINTED, style: accentVars(color) };
    }
    return { className: CLASSES[tone] };
};
