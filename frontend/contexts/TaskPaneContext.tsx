import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Window event carrying the saved Task (detail). Lists merge it into their state.
export const TASK_UPDATED_EVENT = 'tududi:task-updated';

const TASK_PARAM = 'task';

// Task and habit detail pages already show the task, so the pane stays shut there.
const DETAIL_PAGE = /^\/(task|habit)\//;

export const canShowTaskPane = (pathname: string, search: string): boolean =>
    !!new URLSearchParams(search).get(TASK_PARAM) &&
    !DETAIL_PAGE.test(pathname);

interface TaskPaneValue {
    openTaskUid: string | null;
    openTask: (uid: string) => void;
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

    const setTaskParam = useCallback(
        (uid: string | null) => {
            const params = new URLSearchParams(location.search);
            if (uid) params.set(TASK_PARAM, uid);
            else params.delete(TASK_PARAM);
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
            openTask: (uid) => setTaskParam(uid),
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
