import { createContext, useContext } from 'react';

// Provided by a project page: which of its tasks is the project's next
// action, and how to change it. Task rows outside a project page get no
// context and show no entry.
export interface NextActionContextValue {
    nextTaskUid: string | null;
    // null clears the pick.
    setNextAction: (taskUid: string | null) => Promise<void>;
}

export const NextActionContext = createContext<NextActionContextValue | null>(
    null
);

export const useNextAction = (): NextActionContextValue | null =>
    useContext(NextActionContext);
