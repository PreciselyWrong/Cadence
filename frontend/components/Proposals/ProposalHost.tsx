import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProposalSheet from './ProposalSheet';
import WeekendSheet from '../Weekend/WeekendSheet';
import { PROPOSAL_PARAM, setProposalParam } from './proposalLinks';
import { getProposal, ProposalKind } from '../../utils/proposalsService';

interface SheetByKindProps {
    uid: string;
    onClose: () => void;
}

// The sheet of a proposal depends on its kind; the kind is read once. A failed
// read falls back to the week sheet, which shows its own error.
const SheetByKind: React.FC<SheetByKindProps> = ({ uid, onClose }) => {
    const [kind, setKind] = useState<ProposalKind | null>(null);
    useEffect(() => {
        let alive = true;
        getProposal(uid)
            .then((proposal) => alive && setKind(proposal.kind))
            .catch(() => alive && setKind('week'));
        return () => {
            alive = false;
        };
    }, [uid]);
    if (!kind) return null;
    if (kind === 'weekend') return <WeekendSheet uid={uid} onClose={onClose} />;
    return <ProposalSheet uid={uid} onClose={onClose} />;
};

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
        <SheetByKind
            key={uid}
            uid={uid}
            onClose={() => setProposalParam(navigate, latest.current, null)}
        />
    );
};

export default ProposalHost;
