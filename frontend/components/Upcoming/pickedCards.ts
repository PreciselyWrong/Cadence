import { createContext } from 'react';
import type { CardData } from './TaskCard';

/**
 * Cards picked with Ctrl, Cmd or Shift click on the Days layout: a drag, a
 * day shortcut or the selection bar then moves them all. Null where picking
 * is off (Horizons layout).
 */
export interface PickedCards {
    picked: ReadonlyMap<string, CardData>;
    toggle(card: CardData): void;
}

export const PickedCardsContext = createContext<PickedCards | null>(null);

// A click that picks rather than opens.
export const isPickClick = (event: {
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}): boolean => event.ctrlKey || event.metaKey || event.shiftKey;
