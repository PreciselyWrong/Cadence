import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import {
    ApplyResult,
    applyProposal,
    dismissProposal,
    getProposal,
    ProposalDetail,
    replyProposal,
    WeekAnswer,
    WeekChange,
    WeekFacts,
} from '../../utils/proposalsService';
import { PROPOSAL_CHANGED_EVENT } from './proposalLinks';
import { POLL_MS } from './useProposal';

// How long the results stay before the sheet closes when all went through.
const RESULTS_MS = 1600;
// The leave animation; the sheet unmounts once it has run.
const LEAVE_MS = 200;

export type GroupKey =
    | { id: string; kind: 'day'; date: string }
    | { id: string; kind: 'this_week' | 'later' | 'drop' };

export interface ChangeGroup {
    key: GroupKey;
    rows: WeekChange[];
}

// Changes by day first (plan and due date), then the week's, parked and
// dropped ones. Pure: the order is the one the user reads top to bottom.
export function groupChanges(changes: WeekChange[]): ChangeGroup[] {
    const days = new Map<string, WeekChange[]>();
    const others: Record<'this_week' | 'later' | 'drop', WeekChange[]> = {
        this_week: [],
        later: [],
        drop: [],
    };
    for (const change of changes) {
        if (change.op === 'plan_day' || change.op === 'due') {
            const date = change.date ?? '';
            days.set(date, [...(days.get(date) ?? []), change]);
        } else if (change.op === 'this_week') {
            others.this_week.push(change);
        } else if (change.op === 'later') {
            others.later.push(change);
        } else {
            others.drop.push(change);
        }
    }
    const groups: ChangeGroup[] = [...days.keys()].sort().map((date) => ({
        key: { id: `day:${date}`, kind: 'day', date },
        rows: days.get(date) ?? [],
    }));
    for (const kind of ['this_week', 'later', 'drop'] as const) {
        if (others[kind].length > 0) {
            groups.push({
                key: { id: kind, kind },
                rows: others[kind],
            });
        }
    }
    return groups;
}

// Keys the window handles; typing in a field keeps its own keys.
const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const interactive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest('button, a, input, textarea, select, label');

const dayName = (date: string, long: boolean) => {
    const value = new Date(`${date}T12:00:00`);
    if (Number.isNaN(value.getTime())) return date;
    return value.toLocaleDateString(undefined, {
        weekday: long ? 'long' : undefined,
        day: 'numeric',
        month: long ? 'long' : 'short',
    });
};

const capitalize = (text: string) =>
    text.charAt(0).toLocaleUpperCase() + text.slice(1);

interface ProposalSheetProps {
    uid: string;
    onClose: () => void;
}

// The week's proposal as a sheet: the summary, the agent's questions, the
// changes to apply (all checked, uncheck what you refuse). Nothing changes
// until « Appliquer ». Nothing names the agent behind it.
const ProposalSheet: React.FC<ProposalSheetProps> = ({ uid, onClose }) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [detail, setDetail] = useState<ProposalDetail | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
    const [shown, setShown] = useState(false);
    const [busy, setBusy] = useState(false);
    const [replyText, setReplyText] = useState<string | null>(null);
    const [results, setResults] = useState<ApplyResult[] | null>(null);
    const leaving = useRef(false);
    // Timers die with the sheet: a close that is still due must not run after
    // the user has left the page.
    const timers = useRef<number[]>([]);
    useEffect(
        () => () => timers.current.forEach((id) => window.clearTimeout(id)),
        []
    );
    const later = useCallback((callback: () => void, ms: number) => {
        timers.current.push(window.setTimeout(callback, ms));
    }, []);

    const accept = useCallback((next: ProposalDetail) => {
        setDetail(next);
        if (next.status === 'ready') setUnchecked(new Set());
    }, []);

    useEffect(() => {
        let alive = true;
        getProposal(uid)
            .then((next) => alive && accept(next))
            .catch(() => alive && setLoadFailed(true));
        return () => {
            alive = false;
        };
    }, [uid, accept]);

    // A reply or a fresh request is pending: read it until it is answered.
    const pending = detail?.status === 'pending';
    useEffect(() => {
        if (!pending) return;
        const timer = setInterval(
            () =>
                void getProposal(uid)
                    .then(accept)
                    .catch(() => undefined),
            POLL_MS
        );
        return () => clearInterval(timer);
    }, [pending, uid, accept]);

    // The sheet starts hidden and glides in on the next paint.
    useEffect(() => {
        const frame = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const close = useCallback(() => {
        if (leaving.current) return;
        leaving.current = true;
        setShown(false);
        later(onClose, LEAVE_MS);
    }, [onClose, later]);

    const answer = detail?.answer as WeekAnswer | null | undefined;
    const facts = detail?.facts as WeekFacts | undefined;
    const ready =
        detail?.status === 'ready' && detail.kind === 'week' && !!answer;
    const changes = useMemo(
        () => (ready ? answer!.changes : []),
        [ready, answer]
    );
    const selected = changes.filter((c) => !unchecked.has(c.task_uid));
    const groups = useMemo(() => groupChanges(changes), [changes]);
    const names = useMemo(
        () =>
            new Map((facts?.tasks ?? []).map((task) => [task.uid, task.name])),
        [facts]
    );
    const nameOf = (taskUid: string) => names.get(taskUid) ?? taskUid;

    const toggle = (taskUid: string) =>
        setUnchecked((current) => {
            const next = new Set(current);
            if (next.has(taskUid)) next.delete(taskUid);
            else next.add(taskUid);
            return next;
        });

    const apply = useCallback(async () => {
        if (busy || !ready || selected.length === 0) return;
        setBusy(true);
        try {
            const outcome = await applyProposal(uid, {
                task_uids: selected.map((c) => c.task_uid),
            });
            setResults(outcome.results);
            setDetail((current) =>
                current ? { ...current, status: outcome.status } : current
            );
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            if (outcome.results.every((r) => r.state === 'applied')) {
                later(close, RESULTS_MS);
            }
        } catch {
            showErrorToast(
                t(
                    'proposals.apply.error',
                    'Les changements n’ont pas pu être appliqués.'
                )
            );
        } finally {
            setBusy(false);
        }
    }, [busy, ready, selected, uid, close, showErrorToast, t]);

    // A reply, or a question's answer as one: the agent asks again.
    const sendText = useCallback(
        async (text: string) => {
            if (busy) return;
            setBusy(true);
            try {
                await replyProposal(uid, text);
                setReplyText(null);
                setDetail((current) =>
                    current
                        ? { ...current, status: 'pending', reply_text: text }
                        : current
                );
            } catch {
                showErrorToast(
                    t(
                        'proposals.reply.error',
                        'Ta réponse n’a pas été envoyée.'
                    )
                );
            } finally {
                setBusy(false);
            }
        },
        [busy, uid, showErrorToast, t]
    );

    const ignore = async () => {
        try {
            await dismissProposal(uid);
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            close();
        } catch {
            showErrorToast(
                t(
                    'proposals.dismiss.error',
                    'Impossible d’ignorer la proposition.'
                )
            );
        }
    };

    // Escape closes; Enter applies unless a control has the focus (it keeps
    // its own Enter); Ctrl or Cmd with Enter sends a reply being written.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== 'Enter') return;
            if (typing(event.target)) {
                if ((event.ctrlKey || event.metaKey) && replyText?.trim()) {
                    event.preventDefault();
                    void sendText(replyText.trim());
                }
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (interactive(event.target)) return;
            if (!ready || selected.length === 0) return;
            event.preventDefault();
            void apply();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close, apply, sendText, ready, selected.length, replyText]);

    const title = (() => {
        if (ready && answer?.summary) return answer.summary;
        if (pending)
            return t('proposals.sheet.preparing', 'Ta semaine se prépare…');
        if (detail?.status === 'failed') {
            return t(
                'proposals.sheet.failed',
                'Ta semaine n’a pas pu être préparée.'
            );
        }
        return t('proposals.sheet.title', 'Ta semaine');
    })();

    const period =
        detail?.period_start && detail.period_end
            ? `${dayName(detail.period_start, false)} – ${dayName(detail.period_end, false)}`
            : null;

    const opText = (change: WeekChange) => {
        switch (change.op) {
            case 'plan_day':
                return t('proposals.ops.planDay', 'Au plan du jour');
            case 'due':
                return t('proposals.ops.due', 'Échéance le {{date}}', {
                    date: dayName(change.date ?? '', false),
                });
            case 'this_week':
                return t('proposals.ops.thisWeek', 'Cette semaine');
            case 'later':
                return t('proposals.ops.later', 'Plus tard');
            default:
                return t('proposals.ops.drop', 'Abandonner');
        }
    };

    const groupTitle = (key: GroupKey) => {
        if (key.kind === 'day') return capitalize(dayName(key.date, true));
        if (key.kind === 'this_week') {
            return t('proposals.groups.thisWeek', 'Cette semaine');
        }
        if (key.kind === 'later')
            return t('proposals.groups.later', 'Plus tard');
        return t('proposals.groups.drop', 'À abandonner');
    };

    const questions = ready ? answer!.questions : [];
    const showChanges = ready && results === null;
    const applyLabel = t('proposals.sheet.apply', 'Appliquer ({{count}})', {
        count: selected.length,
    });

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <div
                aria-hidden="true"
                onClick={close}
                className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${
                    shown ? 'opacity-100' : 'opacity-0'
                }`}
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="proposal-sheet-title"
                className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface-card text-surface-on shadow-xl ring-1 ring-outline-variant transition-[opacity,transform] duration-200 ease-out sm:max-w-lg sm:rounded-panel motion-reduce:transform-none motion-reduce:transition-none ${
                    shown
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-6 opacity-0 sm:translate-y-2'
                }`}
            >
                <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
                    <div className="min-w-0">
                        {period && (
                            <p className="text-label-m text-surface-on-variant">
                                {period}
                            </p>
                        )}
                        <h2
                            id="proposal-sheet-title"
                            className="mt-0.5 text-title text-surface-on"
                        >
                            {title}
                        </h2>
                    </div>
                    <IconButton
                        label={t('proposals.sheet.close', 'Fermer')}
                        onClick={close}
                    >
                        <XMarkIcon />
                    </IconButton>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                    {loadFailed && (
                        <p className="py-6 text-body-m text-surface-on-variant">
                            {t(
                                'proposals.sheet.loadError',
                                'Impossible d’ouvrir cette proposition.'
                            )}
                        </p>
                    )}
                    {!loadFailed && !detail && (
                        <div aria-hidden="true" className="space-y-3 py-4">
                            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-high" />
                            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-high" />
                        </div>
                    )}
                    {pending && (
                        <p className="py-6 text-body-m text-surface-on-variant">
                            {t(
                                'proposals.sheet.preparingHint',
                                'Tu peux fermer cette fenêtre : elle t’attendra.'
                            )}
                        </p>
                    )}
                    {detail?.status === 'ready' && !answer && (
                        <p className="py-6 text-body-m text-surface-on-variant">
                            {t(
                                'proposals.sheet.empty',
                                'Rien à changer cette semaine.'
                            )}
                        </p>
                    )}
                    {detail?.status === 'applied' && results === null && (
                        <p className="py-6 text-body-m text-surface-on-variant">
                            {t(
                                'proposals.sheet.alreadyApplied',
                                'Déjà appliquée.'
                            )}
                        </p>
                    )}

                    {questions.length > 0 && (
                        <div className="space-y-4 pb-4">
                            {questions.map((question) => (
                                <div key={question.id}>
                                    <p className="text-body text-surface-on">
                                        {question.text}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {question.choices.map((choice) => (
                                            <button
                                                key={choice}
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void sendText(
                                                        `Q: ${question.text} R: ${choice}`
                                                    )
                                                }
                                                className="rounded-full px-3.5 py-1.5 text-body-m text-surface-on ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-high disabled:opacity-50 max-sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            >
                                                {choice}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showChanges &&
                        groups.map((group) => (
                            <section
                                key={group.key.id}
                                className="pt-3"
                                aria-label={groupTitle(group.key)}
                            >
                                <h3 className="text-label-m text-surface-on-variant">
                                    {groupTitle(group.key)}
                                </h3>
                                <ul className="mt-1 divide-y divide-outline-variant">
                                    {group.rows.map((change) => (
                                        <li key={change.task_uid}>
                                            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-[22px] w-[22px] shrink-0 cursor-pointer accent-primary"
                                                    checked={
                                                        !unchecked.has(
                                                            change.task_uid
                                                        )
                                                    }
                                                    onChange={() =>
                                                        toggle(change.task_uid)
                                                    }
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-baseline justify-between gap-3">
                                                        <span className="truncate text-body text-surface-on">
                                                            {nameOf(
                                                                change.task_uid
                                                            )}
                                                        </span>
                                                        <span className="shrink-0 text-label-m text-primary">
                                                            {opText(change)}
                                                        </span>
                                                    </span>
                                                    {change.reason && (
                                                        <span className="block truncate text-body-m text-surface-on-variant">
                                                            {change.reason}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}

                    {showChanges && ready && changes.length === 0 && (
                        <p className="py-6 text-body-m text-surface-on-variant">
                            {t(
                                'proposals.sheet.empty',
                                'Rien à changer cette semaine.'
                            )}
                        </p>
                    )}

                    {results !== null && (
                        <div className="py-4">
                            <p className="text-body text-surface-on">
                                {t(
                                    'proposals.sheet.appliedCount',
                                    '{{count}} sur {{total}} appliqués',
                                    {
                                        count: results.filter(
                                            (r) => r.state === 'applied'
                                        ).length,
                                        total: results.length,
                                    }
                                )}
                            </p>
                            <ul className="mt-3 space-y-2">
                                {results.map((result) => (
                                    <li
                                        key={result.task_uid}
                                        className="flex items-center gap-3 text-body-m text-surface-on"
                                    >
                                        {result.state === 'applied' ? (
                                            <CheckIcon
                                                aria-hidden="true"
                                                className="h-4 w-4 shrink-0 text-success"
                                            />
                                        ) : (
                                            <XMarkIcon
                                                aria-hidden="true"
                                                className="h-4 w-4 shrink-0 text-danger"
                                            />
                                        )}
                                        <span className="min-w-0 flex-1 truncate">
                                            {nameOf(result.task_uid)}
                                        </span>
                                        {result.state === 'failed' && (
                                            <span className="shrink-0 text-danger">
                                                {t(
                                                    'proposals.apply.failedOne',
                                                    'Pas appliqué'
                                                )}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {results === null && ready && (
                    <footer className="space-y-3 border-t border-outline-variant px-5 py-3">
                        {replyText !== null && (
                            <div className="space-y-2">
                                <textarea
                                    autoFocus
                                    rows={2}
                                    value={replyText}
                                    onChange={(e) =>
                                        setReplyText(e.target.value)
                                    }
                                    placeholder={t(
                                        'proposals.sheet.replyPlaceholder',
                                        'Dis-moi ce qui change…'
                                    )}
                                    aria-label={t(
                                        'proposals.sheet.reply',
                                        'Répondre'
                                    )}
                                    className="w-full resize-none rounded-control bg-surface-high px-3 py-2 text-body text-surface-on placeholder:text-surface-on-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                />
                                <div className="flex justify-end">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={busy || !replyText.trim()}
                                        onClick={() =>
                                            void sendText(replyText.trim())
                                        }
                                    >
                                        {t('proposals.sheet.send', 'Envoyer')}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => void ignore()}
                                className="rounded-md px-1 text-body-m text-surface-on-variant underline-offset-2 hover:text-surface-on hover:underline max-sm:min-h-[44px]"
                            >
                                {t('proposals.sheet.ignore', 'Ignorer')}
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="md"
                                    onClick={close}
                                >
                                    {t('proposals.sheet.later', 'Plus tard')}
                                </Button>
                                {replyText === null && (
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        onClick={() => setReplyText('')}
                                    >
                                        {t('proposals.sheet.reply', 'Répondre')}
                                    </Button>
                                )}
                                <Button
                                    variant="primary"
                                    size="md"
                                    disabled={busy || selected.length === 0}
                                    onClick={() => void apply()}
                                >
                                    {applyLabel}
                                </Button>
                            </div>
                        </div>
                    </footer>
                )}
                {(results !== null || (!ready && detail && !pending)) && (
                    <footer className="flex justify-end border-t border-outline-variant px-5 py-3">
                        <Button variant="secondary" size="md" onClick={close}>
                            {t('proposals.sheet.close', 'Fermer')}
                        </Button>
                    </footer>
                )}
            </section>
        </div>
    );
};

export default ProposalSheet;
