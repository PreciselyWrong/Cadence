import React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import PageShell, { PAGE_GUTTER } from '../Shared/ui/PageShell';
import InboxTriage from './InboxTriage';
import { useInboxIdeaActions } from './useInboxIdeaActions';

/**
 * `/inbox`: the inbox lives in Plan's column now. Only the one-at-a-time
 * triage (`?triage=1`) keeps a page; any other visit lands on Plan.
 */
const TriagePage: React.FC = () => {
    const navigate = useNavigate();
    const { projects, reloadProjects } = useInboxIdeaActions();
    return (
        <PageShell template="list" className={`pt-6 ${PAGE_GUTTER}`}>
            <InboxTriage
                projects={projects}
                onExit={() => navigate('/upcoming')}
                onProjectsChanged={reloadProjects}
            />
        </PageShell>
    );
};

const InboxRoute: React.FC = () => {
    const [searchParams] = useSearchParams();
    if (searchParams.get('triage') !== '1') {
        return <Navigate to="/upcoming" replace />;
    }
    return <TriagePage />;
};

export default InboxRoute;
