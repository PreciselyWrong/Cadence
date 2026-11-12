import type { CSSProperties } from 'react';

import { blockFill } from '../Shared/task/blockFill';
import type { CalendarEvent } from './taskEvents';

// A calendar block's look: its colour as a flat fill with readable text, or
// the neutral token fill when it has no colour. Done blocks are faded.
export const blockTone = (
    event: CalendarEvent
): { className: string; style: CSSProperties } => {
    const fill = blockFill(event.color);
    return {
        className: `${fill ? 'text-surface-on' : 'bg-primary-container text-primary-on-container'} ${event.done ? 'opacity-50' : ''}`,
        style: { backgroundColor: fill },
    };
};
