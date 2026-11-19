import { useCallback, useEffect, useState } from 'react';
import {
    createProposal,
    listProposals,
    ProposalKind,
    ProposalStatus,
} from '../../utils/proposalsService';

// Five seconds: the agent answers in tens of seconds, and this only runs while
// a proposal is pending.
export const POLL_MS = 5000;

export interface ProposalState {
    uid: string;
    status: ProposalStatus;
}

// The latest proposal of one kind, kept fresh while it is pending. A failed
// read leaves the button idle: the proposal is not lost, the next visit reads
// it again.
export function useProposal(kind: ProposalKind) {
    const [latest, setLatest] = useState<ProposalState | null>(null);
    // Unknown until read: nothing of the AI shows before it is known.
    const [agent, setAgent] = useState(false);
    const pendingUid = latest?.status === 'pending' ? latest.uid : null;

    const refresh = useCallback(() => {
        return listProposals()
            .then(({ proposals, agent: listening }) => {
                setAgent(listening);
                const found = proposals.find((p) => p.kind === kind);
                setLatest(
                    found ? { uid: found.uid, status: found.status } : null
                );
            })
            .catch(() => undefined);
    }, [kind]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!pendingUid) return;
        const timer = setInterval(() => void refresh(), POLL_MS);
        return () => clearInterval(timer);
    }, [pendingUid, refresh]);

    const request = useCallback(async () => {
        const started = await createProposal(kind);
        setLatest({ uid: started.uid, status: started.status });
        return started;
    }, [kind]);

    return {
        agent,
        uid: latest?.uid ?? null,
        status: latest?.status ?? null,
        request,
        refresh,
    };
}
