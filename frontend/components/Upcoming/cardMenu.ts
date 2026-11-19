import { createContext } from 'react';
import { Task } from '../../entities/Task';

// Opens the task menu of a Plan card: right click, long press or the menu
// key. The board knows the card's place (day, overdue, horizon) from `el`.
export type OpenCardMenu = (
    task: Task,
    el: HTMLElement,
    at: { x: number; y: number }
) => void;

export const CardMenuContext = createContext<OpenCardMenu | null>(null);
