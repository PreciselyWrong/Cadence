import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Window event carrying the saved Task (detail). Lists merge it into their state.
export const TASK_UPDATED_EVENT = 'tududi:task-updated';

const TASK_PARAM = 'task';
// The day a task is planned on and its start, set by the opener that knows
// them (a calendar block or a planned line). Dropped with the task.
const PLANNED_DAY_PARAM = 'on';
const PLANNED_START_PARAM = 'at';

// Where the task sits in the day it was opened from.
export interface PlannedOpen {
    date: string;
    startMinute?: number;
}

// Task and habit detail pages already show the task, so the pane stays shut there.
const DETAIL_PAGE = /^\/(task|habit)\//;

export const canShowTaskPane = (pathname: string, search: string): boolean =>
    !!new URLSearchParams(search).get(TASK_PARAM) &&
    !DETAIL_PAGE.test(pathname);

interface TaskPaneValue {
    openTaskUid: string | null;
    openTask: (uid: string, planned?: PlannedOpen) => void;
    closeTask: () => void;
}

const noop = () => {};

const TaskPaneContext = createContext<TaskPaneValue>({
    openTaskUid: null,
    openTask: noop,
    closeTask: noop,
});

// The open task lives in `?task=<uid>` so a reload keeps the pane. Changes
// replace the history entry, so Back does not walk through every row click.
export const TaskPaneProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const openTaskUid = new URLSearchParams(location.search).get(TASK_PARAM);

    // Sets the open task and its planned day together, so a planned day from
    // one task never labels another. Opening without one, or closing, drops it.
    const setTaskParam = useCallback(
        (uid: string | null, planned?: PlannedOpen) => {
            const params = new URLSearchParams(location.search);
            params.delete(TASK_PARAM);
            params.delete(PLANNED_DAY_PARAM);
            params.delete(PLANNED_START_PARAM);
            if (uid) {
                params.set(TASK_PARAM, uid);
                if (planned) {
                    params.set(PLANNED_DAY_PARAM, planned.date);
                    if (planned.startMinute !== undefined) {
                        params.set(
                            PLANNED_START_PARAM,
                            String(planned.startMinute)
                        );
                    }
                }
            }
            const search = params.toString();
            navigate(
                {
                    pathname: location.pathname,
                    search: search ? `?${search}` : '',
                    hash: location.hash,
                },
                { replace: true, state: location.state }
            );
        },
        [location, navigate]
    );

    const value = useMemo<TaskPaneValue>(
        () => ({
            openTaskUid,
            openTask: (uid, planned) => setTaskParam(uid, planned),
            closeTask: () => setTaskParam(null),
        }),
        [openTaskUid, setTaskParam]
    );

    return (
        <TaskPaneContext.Provider value={value}>
            {children}
        </TaskPaneContext.Provider>
    );
};

export const useTaskPane = (): TaskPaneValue => useContext(TaskPaneContext);
