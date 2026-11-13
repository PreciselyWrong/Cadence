import { useEffect, useRef } from 'react';
import { PROPOSAL_CHANGED_EVENT } from './proposalLinks';

// Calls `onChanged` when a proposal was applied or dismissed anywhere in the
// app. The latest callback is used, so callers need not memoise it.
export function useProposalChanged(onChanged: () => void): void {
    const handlerRef = useRef(onChanged);
    handlerRef.current = onChanged;

    useEffect(() => {
        const listener = () => handlerRef.current();
        window.addEventListener(PROPOSAL_CHANGED_EVENT, listener);
        return () =>
            window.removeEventListener(PROPOSAL_CHANGED_EVENT, listener);
    }, []);
}
