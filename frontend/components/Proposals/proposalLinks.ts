import { NavigateFunction } from 'react-router-dom';

// The open proposal lives in `?proposal=<uid>`, like `?task=` for the task
// pane, so a reload keeps the sheet and a notification can open it.
export const PROPOSAL_PARAM = 'proposal';

// Window event sent when a proposal is applied or dismissed: the pages that
// show the day or the plan re-read it, and the buttons re-read their state.
export const PROPOSAL_CHANGED_EVENT = 'tududi:proposal-changed';

export const proposalSearch = (search: string, uid: string | null): string => {
    const params = new URLSearchParams(search);
    if (uid) params.set(PROPOSAL_PARAM, uid);
    else params.delete(PROPOSAL_PARAM);
    const text = params.toString();
    return text ? `?${text}` : '';
};

type ProposalLocation = {
    pathname: string;
    search: string;
    hash: string;
    state: unknown;
};

// Replaces the history entry, as the task pane does: Back does not walk
// through every opening.
export const setProposalParam = (
    navigate: NavigateFunction,
    location: ProposalLocation,
    uid: string | null
): void => {
    navigate(
        {
            pathname: location.pathname,
            search: proposalSearch(location.search, uid),
            hash: location.hash,
        },
        { replace: true, state: location.state }
    );
};
