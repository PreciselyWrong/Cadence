import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

// A task link (/task/<uid>) lands on all tasks with that task open in the
// common sheet (`?task=<uid>`). The full task page lives at
// /task/<uid>/details.
const TaskLinkRedirect: React.FC = () => {
    const { uid } = useParams<{ uid: string }>();
    const to = uid ? `/tasks?task=${encodeURIComponent(uid)}` : '/tasks';

    return <Navigate to={to} replace />;
};

export default TaskLinkRedirect;
