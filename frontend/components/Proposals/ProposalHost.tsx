import React, { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProposalSheet from './ProposalSheet';
import { PROPOSAL_PARAM, setProposalParam } from './proposalLinks';

// One sheet for every page: `?proposal=<uid>` opens it, closing removes it.
const ProposalHost: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    // The close can fire after the page moved on: it keeps the place it has now.
    const latest = useRef(location);
    latest.current = location;
    const uid = new URLSearchParams(location.search).get(PROPOSAL_PARAM);
    if (!uid) return null;
    return (
        <ProposalSheet
            key={uid}
            uid={uid}
            onClose={() => setProposalParam(navigate, latest.current, null)}
        />
    );
};

export default ProposalHost;
