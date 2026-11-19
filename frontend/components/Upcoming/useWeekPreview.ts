import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    applyProposal,
    createProposal,
    dismissProposal,
    getProposal,
    ProposalDetail,
    sendProposal,
    WeekAnswer,
    WeekFacts,
} from '../../utils/proposalsService';
import {
    Decision,
    decisionsToApply,
    plannableDays,
    rowsOf,
    sameDecision,
    suggestionOf,
} from '../Proposals/weekDecisions';
import { PROPOSAL_CHANGED_EVENT } from '../Proposals/proposalLinks';
import { POLL_MS } from '../Proposals/useProposal';
import { previewMoves } from './weekPreview';

export type PreviewOutcome =
    | { kind: 'applied'; applied: number; failed: number }
    | { kind: 'dismissed' };

/**
 * The week the AI proposed, read for the Plan board's preview: the answer,
 * the user's decisions and answers (local until « Appliquer »), the moves
 * they make. Polls while the proposal is pending.
 */
export function useWeekPreview(uid: string | null) {
    const [detail, setDetail] = useState<ProposalDetail | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [decisions, setDecisions] = useState<Map<string, Decision>>(
        () => new Map()
    );
    const [answers, setAnswers] = useState<Map<string, string>>(
        () => new Map()
    );
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setDetail(null);
        setLoadFailed(false);
        setDecisions(new Map());
        setAnswers(new Map());
        if (!uid) return;
        let alive = true;
        getProposal(uid)
            .then((next) => alive && setDetail(next))
            .catch(() => alive && setLoadFailed(true));
        return () => {
            alive = false;
        };
    }, [uid]);

    const pending = detail?.status === 'pending';
    useEffect(() => {
        if (!uid || !pending) return;
        const timer = setInterval(
            () =>
                void getProposal(uid)
                    .then(setDetail)
                    .catch(() => undefined),
            POLL_MS
        );
        return () => clearInterval(timer);
    }, [uid, pending]);

    const isWeek = detail?.kind === 'week';
    const answer = isWeek ? (detail?.answer as WeekAnswer | null) : null;
    const facts = isWeek ? (detail?.facts as WeekFacts) : null;
    const ready = isWeek && detail?.status === 'ready' && !!answer && !!facts;

    const rows = useMemo(
        () =>
            ready && facts && answer
                ? rowsOf(facts.tasks ?? [], answer.changes ?? [])
                : [],
        [ready, facts, answer]
    );
    const moves = useMemo(
        () => (ready && facts ? previewMoves(facts, rows, decisions) : []),
        [ready, facts, rows, decisions]
    );
    const days = useMemo(
        () => plannableDays(facts?.period, facts?.today),
        [facts]
    );

    // A decision equal to the agent's is no decision of the user's.
    const decide = useCallback(
        (taskUid: string, decision: Decision) => {
            const row = rows.find((r) => r.task_uid === taskUid);
            if (!row) return;
            setDecisions((current) => {
                const next = new Map(current);
                if (sameDecision(decision, suggestionOf(row))) {
                    next.delete(taskUid);
                } else {
                    next.set(taskUid, decision);
                }
                return next;
            });
        },
        [rows]
    );
    const decidable = useCallback(
        (taskUid: string) => rows.some((r) => r.task_uid === taskUid),
        [rows]
    );

    const choose = useCallback((questionId: string, choice: string) => {
        setAnswers((current) => {
            const next = new Map(current);
            if (next.get(questionId) === choice) next.delete(questionId);
            else next.set(questionId, choice);
            return next;
        });
    }, []);

    const toApply = useMemo(
        () => decisionsToApply(rows, decisions),
        [rows, decisions]
    );
    const answerList = useMemo(
        () =>
            [...answers].map(([question_id, choice]) => ({
                question_id,
                choice,
            })),
        [answers]
    );

    const apply = useCallback(async (): Promise<PreviewOutcome | null> => {
        if (!uid || !ready || busy) return null;
        setBusy(true);
        try {
            const outcome =
                answerList.length > 0
                    ? await sendProposal(uid, {
                          decisions: toApply,
                          notes: [],
                          answers: answerList,
                      })
                    : await applyProposal(uid, { decisions: toApply });
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            const failed = outcome.results.filter(
                (result) => result.state === 'failed'
            ).length;
            return {
                kind: 'applied',
                applied: outcome.results.length - failed,
                failed,
            };
        } finally {
            setBusy(false);
        }
    }, [uid, ready, busy, answerList, toApply]);

    const dismiss = useCallback(async (): Promise<PreviewOutcome | null> => {
        if (!uid) return null;
        await dismissProposal(uid);
        window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
        return { kind: 'dismissed' };
    }, [uid]);

    const retry = useCallback(() => createProposal('week'), []);

    return {
        uid,
        detail,
        loadFailed,
        isWeek,
        ready,
        pending,
        failed: detail?.status === 'failed',
        closed: detail?.status === 'applied' || detail?.status === 'dismissed',
        answer,
        facts,
        rows,
        moves,
        days,
        decisions,
        answers,
        busy,
        toApply,
        decide,
        decidable,
        choose,
        apply,
        dismiss,
        retry,
        resetAll: () => setDecisions(new Map()),
    };
}

export type WeekPreviewState = ReturnType<typeof useWeekPreview>;
