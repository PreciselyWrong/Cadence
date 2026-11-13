import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowUturnLeftIcon,
    CheckIcon,
    ChatBubbleLeftIcon,
    ChevronDownIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import {
    ApplyResult,
    applyProposal,
    dismissProposal,
    FactRef,
    getProposal,
    ProposalDetail,
    replyProposal,
    sendProposal,
    WeekAnswer,
    WeekChange,
    WeekFacts,
    WeekTaskFact,
} from '../../utils/proposalsService';
import DecisionMenu, { DayChoice } from './DecisionMenu';
import { PROPOSAL_CHANGED_EVENT } from './proposalLinks';
import { POLL_MS } from './useProposal';
import {
    addDays,
    Decision,
    decisionsToApply,
    GroupKey,
    groupByDecision,
    notesToSend,
    plannableDays,
    sameDecision,
    suggestionOf,
} from './weekDecisions';

// How long the results stay before the sheet closes when all went through.
const RESULTS_MS = 1600;
// The leave animation; the sheet unmounts once it has run.
const LEAVE_MS = 200;
// A row gliding to its new group.
const MOVE_MS = 240;

const TRIGGER = '[data-decision-trigger]';
const NOTE_TRIGGER = '[data-note-trigger]';
// A remark is one line, as long as the agent needs to know what to change.
const NOTE_MAX = 500;
// « Autre date… » reaches this far past the period (the server's window).
const OTHER_DATE_DAYS = 30;

// Keys the window handles; typing in a field keeps its own keys.
const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const interactive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest('button, a, input, textarea, select, label');

const reducedMotion = () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const formatDay = (date: string, options: Intl.DateTimeFormatOptions) => {
    const value = new Date(`${date}T12:00:00`);
    if (Number.isNaN(value.getTime())) return date;
    return value.toLocaleDateString(undefined, options);
};

const capitalize = (text: string) =>
    text.charAt(0).toLocaleUpperCase() + text.slice(1);

const refName = (ref: FactRef | undefined): string | null => {
    if (!ref) return null;
    const name = typeof ref === 'string' ? ref : ref.name;
    return name?.trim() || null;
};

interface ProposalSheetProps {
    uid: string;
    onClose: () => void;
}

// The week's proposal as a sheet: a short headline, the agent's questions,
// then each task with its decision (the agent's by default, any other one a
// click away). Nothing changes until « Appliquer ». Nothing names the agent.
const ProposalSheet: React.FC<ProposalSheetProps> = ({ uid, onClose }) => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [detail, setDetail] = useState<ProposalDetail | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    // Only the rows the user changed; the others follow the agent.
    const [decisions, setDecisions] = useState<Map<string, Decision>>(
        () => new Map()
    );
    // Remarks by task; `noteOpen` is the row whose remark is being written.
    const [notes, setNotes] = useState<Map<string, string>>(() => new Map());
    const [noteOpen, setNoteOpen] = useState<string | null>(null);
    const [menu, setMenu] = useState<{
        taskUid: string;
        anchor: HTMLElement;
    } | null>(null);
    const [shown, setShown] = useState(false);
    const [busy, setBusy] = useState(false);
    const [replyText, setReplyText] = useState<string | null>(null);
    const [results, setResults] = useState<ApplyResult[] | null>(null);
    const leaving = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);
    const rowEls = useRef(new Map<string, HTMLElement>());
    // Row tops before a decision moved them, and the row to focus after.
    const before = useRef<Map<string, number> | null>(null);
    const focusAfter = useRef<string | null>(null);
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
        if (next.status === 'ready') {
            setDecisions(new Map());
            setNotes(new Map());
            setNoteOpen(null);
        }
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
        () => (ready ? (answer!.changes ?? []) : []),
        [ready, answer]
    );
    const tasks = useMemo(
        () =>
            new Map<string, WeekTaskFact>(
                (facts?.tasks ?? []).map((task) => [task.uid, task])
            ),
        [facts]
    );
    const nameOf = (taskUid: string) => tasks.get(taskUid)?.name ?? taskUid;
    const today = facts?.today;

    const decisionOf = useCallback(
        (change: WeekChange) =>
            decisions.get(change.task_uid) ?? suggestionOf(change),
        [decisions]
    );
    const groups = useMemo(
        () => groupByDecision(changes, decisions),
        [changes, decisions]
    );
    // A noted row waits for the agent's answer: its decision is not applied.
    const sending = useMemo(
        () => notesToSend(changes, notes),
        [changes, notes]
    );
    const notedUids = useMemo(
        () => new Set(sending.map((note) => note.task_uid)),
        [sending]
    );
    const toApply = useMemo(
        () =>
            decisionsToApply(
                changes.filter((change) => !notedUids.has(change.task_uid)),
                decisions
            ),
        [changes, decisions, notedUids]
    );

    // An empty remark is no remark: it is dropped as soon as it is cleared.
    const setNote = useCallback((taskUid: string, text: string) => {
        setNotes((current) => {
            const next = new Map(current);
            if (text.trim()) next.set(taskUid, text);
            else next.delete(taskUid);
            return next;
        });
    }, []);

    // A day past the period (« Autre date… ») names its month too.
    const periodEnd = facts?.period?.end;
    const shortDay = useCallback(
        (date: string) =>
            date === today
                ? t('proposals.decide.today', 'Auj.')
                : capitalize(
                      formatDay(date, {
                          weekday: 'short',
                          day: 'numeric',
                          month:
                              periodEnd && date > periodEnd
                                  ? 'short'
                                  : undefined,
                      })
                  ),
        [today, periodEnd, t]
    );
    const longDay = (date: string) =>
        capitalize(
            formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })
        );

    const days: DayChoice[] = useMemo(
        () =>
            plannableDays(facts?.period, today).map((date) => ({
                date,
                label: shortDay(date),
                long: capitalize(
                    formatDay(date, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                    })
                ),
            })),
        [facts, today, shortDay]
    );

    const maxDate = facts?.period?.end
        ? addDays(facts.period.end, OTHER_DATE_DAYS)
        : undefined;

    // Remember where every row is, so the regroup can glide from there.
    const snapshot = () => {
        const tops = new Map<string, number>();
        rowEls.current.forEach((el, key) =>
            tops.set(key, el.getBoundingClientRect().top)
        );
        before.current = tops;
    };

    const decide = useCallback((change: WeekChange, decision: Decision) => {
        snapshot();
        focusAfter.current = change.task_uid;
        setDecisions((current) => {
            const next = new Map(current);
            if (sameDecision(decision, suggestionOf(change))) {
                next.delete(change.task_uid);
            } else {
                next.set(change.task_uid, decision);
            }
            return next;
        });
    }, []);

    // FLIP: rows that changed group glide from their old place. The row the
    // user acted on keeps the focus, wherever it went.
    useLayoutEffect(() => {
        const tops = before.current;
        before.current = null;
        if (tops && !reducedMotion()) {
            rowEls.current.forEach((el, key) => {
                const old = tops.get(key);
                if (old === undefined || typeof el.animate !== 'function') {
                    return;
                }
                const dy = old - el.getBoundingClientRect().top;
                if (Math.abs(dy) < 1) return;
                el.animate(
                    [
                        { transform: `translateY(${dy}px)` },
                        { transform: 'translateY(0)' },
                    ],
                    { duration: MOVE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
                );
            });
        }
        const focusUid = focusAfter.current;
        if (focusUid && !menu) {
            focusAfter.current = null;
            const trigger = rowEls.current
                .get(focusUid)
                ?.querySelector<HTMLElement>(TRIGGER);
            trigger?.focus({ preventScroll: true });
            if (typeof trigger?.scrollIntoView === 'function') {
                trigger.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [decisions, menu]);

    const closeMenu = useCallback(() => {
        setMenu((current) => {
            if (current) focusAfter.current = current.taskUid;
            return null;
        });
    }, []);

    const apply = useCallback(async () => {
        if (busy || !ready || toApply.length === 0) return;
        setBusy(true);
        try {
            const outcome = await applyProposal(uid, { decisions: toApply });
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
    }, [busy, ready, toApply, uid, close, showErrorToast, t, later]);

    // The remarks go with the decisions that are not noted; the agent answers
    // again, and the header button shows it is preparing.
    const sendNotes = useCallback(async () => {
        if (busy || !ready || sending.length === 0) return;
        setBusy(true);
        try {
            await sendProposal(uid, { decisions: toApply, notes: sending });
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            showSuccessToast(
                t(
                    'proposals.sheet.notesSent',
                    '{{count}} tâches renvoyées, je te préviens quand c’est prêt',
                    { count: sending.length }
                )
            );
            close();
        } catch {
            showErrorToast(
                t(
                    'proposals.sheet.sendError',
                    'Les remarques n’ont pas pu être envoyées.'
                )
            );
        } finally {
            setBusy(false);
        }
    }, [
        busy,
        ready,
        sending,
        toApply,
        uid,
        close,
        showSuccessToast,
        showErrorToast,
        t,
    ]);

    // Esc or Enter leaves the remark; the row's remark button takes the focus.
    const collapseNote = useCallback((taskUid: string) => {
        setNoteOpen(null);
        rowEls.current
            .get(taskUid)
            ?.querySelector<HTMLElement>(NOTE_TRIGGER)
            ?.focus();
    }, []);

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

    // Escape closes; arrows move between rows; a digit plans the focused row
    // on that day of the period; Enter on a row opens its menu (the button's
    // own Enter), elsewhere it applies; Ctrl or Cmd with Enter sends a reply
    // being written. The open menu keeps its keys.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest('[data-decision-menu], [data-note-editor]')
            ) {
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                if (menu) closeMenu();
                else close();
                return;
            }
            if (typing(target)) {
                if (
                    event.key === 'Enter' &&
                    (event.ctrlKey || event.metaKey) &&
                    replyText?.trim()
                ) {
                    event.preventDefault();
                    void sendText(replyText.trim());
                }
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const triggers = Array.from(
                listRef.current?.querySelectorAll<HTMLElement>(TRIGGER) ?? []
            );
            const at = triggers.indexOf(document.activeElement as HTMLElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (triggers.length === 0) return;
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const next =
                    at === -1
                        ? step === 1
                            ? 0
                            : triggers.length - 1
                        : Math.min(Math.max(at + step, 0), triggers.length - 1);
                triggers[next]?.focus();
                return;
            }
            if (/^[1-9]$/.test(event.key) && at !== -1) {
                const day = days[Number(event.key) - 1];
                const taskUid = triggers[at].dataset.decisionTrigger;
                const change = changes.find((c) => c.task_uid === taskUid);
                if (day && change) {
                    event.preventDefault();
                    decide(change, { op: 'plan_day', date: day.date });
                }
                return;
            }
            if (event.key !== 'Enter') return;
            if (interactive(target)) return;
            if (!ready) return;
            if (sending.length > 0) {
                event.preventDefault();
                void sendNotes();
                return;
            }
            if (toApply.length === 0) return;
            event.preventDefault();
            void apply();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [
        close,
        closeMenu,
        menu,
        apply,
        sendNotes,
        sending.length,
        sendText,
        ready,
        toApply.length,
        replyText,
        days,
        changes,
        decide,
    ]);

    // Contract v2 has a short headline and a subtitle; an older answer only
    // has `summary`, shown as the subtitle under « Ta semaine » (as the
    // server and Android read it).
    const headline = answer?.headline?.trim() ?? '';
    const subtitle = ready
        ? answer?.subtitle?.trim() || answer?.summary?.trim() || ''
        : '';

    const title = (() => {
        if (ready && headline) return headline;
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
            ? `${formatDay(detail.period_start, { day: 'numeric', month: 'short' })} – ${formatDay(detail.period_end, { day: 'numeric', month: 'short' })}`
            : null;

    const decisionLabel = (decision: Decision) => {
        switch (decision.op) {
            case 'plan_day':
                return shortDay(decision.date ?? '');
            case 'due':
                return t('proposals.decide.dueOn', 'Échéance {{date}}', {
                    date: formatDay(decision.date ?? '', {
                        weekday: 'short',
                        day: 'numeric',
                    }),
                });
            case 'this_week':
                return t('proposals.ops.thisWeek', 'Cette semaine');
            case 'later':
                return t('proposals.ops.later', 'Plus tard');
            case 'keep':
                return t('proposals.decide.kept', 'Tel quel');
            default:
                return t('proposals.ops.drop', 'Abandonner');
        }
    };

    const groupTitle = (key: GroupKey) => {
        if (key.kind === 'day') {
            return key.date === today
                ? t('proposals.decide.groupToday', 'Aujourd’hui')
                : longDay(key.date);
        }
        if (key.kind === 'this_week') {
            return t('proposals.groups.thisWeek', 'Cette semaine');
        }
        if (key.kind === 'later')
            return t('proposals.groups.later', 'Plus tard');
        if (key.kind === 'keep')
            return t('proposals.decide.groupKeep', 'Tel quel');
        return t('proposals.groups.drop', 'À abandonner');
    };

    const tagOf = (task: WeekTaskFact | undefined) => {
        const goal = refName(task?.goal);
        if (goal) {
            return { text: goal, kind: t('proposals.decide.goal', 'Objectif') };
        }
        const area = refName(task?.area);
        return area
            ? { text: area, kind: t('proposals.decide.area', 'Domaine') }
            : null;
    };

    const questions = ready ? (answer!.questions ?? []) : [];
    const showChanges = ready && results === null;
    const applyLabel = t('proposals.sheet.apply', 'Appliquer ({{count}})', {
        count: toApply.length,
    });
    const menuChange = menu
        ? changes.find((c) => c.task_uid === menu.taskUid)
        : undefined;

    const renderRow = (change: WeekChange) => {
        const task = tasks.get(change.task_uid);
        const decision = decisionOf(change);
        const suggestion = suggestionOf(change);
        const noted = notedUids.has(change.task_uid);
        const note = notes.get(change.task_uid) ?? '';
        const changed = !noted && !sameDecision(decision, suggestion);
        const tag = tagOf(task);
        const label = decisionLabel(decision);
        const name = nameOf(change.task_uid);
        const quiet =
            !noted && (decision.op === 'keep' || decision.op === 'drop');
        const open = menu?.taskUid === change.task_uid;
        const editing = noteOpen === change.task_uid;
        return (
            <li
                key={change.task_uid}
                ref={(el) => {
                    if (el) rowEls.current.set(change.task_uid, el);
                    else rowEls.current.delete(change.task_uid);
                }}
                data-task-row={change.task_uid}
                className="flex min-h-[44px] flex-wrap items-start gap-x-3 gap-y-2 py-2.5"
            >
                <div className="min-w-0 flex-1">
                    <p
                        className={`break-words text-body transition-colors duration-[220ms] ${
                            quiet
                                ? 'text-surface-on-variant'
                                : 'text-surface-on'
                        } ${
                            !noted && decision.op === 'drop'
                                ? 'line-through decoration-outline-variant'
                                : ''
                        }`}
                    >
                        {name}
                    </p>
                    {(tag || change.reason || changed || noted) && (
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body-m text-surface-on-variant">
                            {noted && (
                                <span className="text-label-m text-warning">
                                    {t('proposals.sheet.toReview', 'À revoir')}
                                </span>
                            )}
                            {changed && (
                                <span className="text-label-m text-primary">
                                    {t('proposals.decide.changed', 'Modifié')}
                                </span>
                            )}
                            {tag && (
                                <span
                                    title={tag.kind}
                                    className="max-w-[12rem] truncate rounded-inner bg-surface-high px-1.5 text-label-m text-surface-on-variant"
                                >
                                    <span className="sr-only">
                                        {`${tag.kind}: `}
                                    </span>
                                    {tag.text}
                                </span>
                            )}
                            {change.reason && (
                                <span className="min-w-0">{change.reason}</span>
                            )}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {changed && (
                        <IconButton
                            label={t(
                                'proposals.decide.undo',
                                'Revenir à la suggestion : {{decision}}',
                                { decision: decisionLabel(suggestion) }
                            )}
                            onClick={() => decide(change, suggestion)}
                        >
                            <ArrowUturnLeftIcon />
                        </IconButton>
                    )}
                    <IconButton
                        label={t('proposals.sheet.note', 'Remarque')}
                        active={noted}
                        aria-expanded={editing}
                        data-note-trigger
                        onClick={() =>
                            setNoteOpen((current) =>
                                current === change.task_uid
                                    ? null
                                    : change.task_uid
                            )
                        }
                    >
                        <ChatBubbleLeftIcon />
                    </IconButton>
                    {noted ? (
                        <span className="max-w-[11rem] text-right text-label text-primary">
                            {t(
                                'proposals.sheet.noteDecision',
                                'À revoir avec ta remarque'
                            )}
                        </span>
                    ) : (
                        <button
                            type="button"
                            data-decision-trigger={change.task_uid}
                            aria-haspopup="menu"
                            aria-expanded={open}
                            aria-label={t(
                                'proposals.decide.trigger',
                                '{{decision}}, {{task}}',
                                { decision: label, task: name }
                            )}
                            onClick={(event) => {
                                const anchor = event.currentTarget;
                                setMenu((current) =>
                                    current?.taskUid === change.task_uid
                                        ? null
                                        : { taskUid: change.task_uid, anchor }
                                );
                            }}
                            className={`inline-flex h-8 max-w-[11rem] items-center gap-1 rounded-full pl-3 pr-2 text-label outline-none transition-colors duration-[220ms] focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] max-sm:min-h-[44px] ${
                                changed
                                    ? 'bg-primary-container text-primary-on-container'
                                    : 'bg-surface-high text-surface-on hover:bg-surface-highest'
                            }`}
                        >
                            <span className="truncate">{label}</span>
                            <ChevronDownIcon
                                aria-hidden="true"
                                className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-150 motion-reduce:transition-none ${
                                    open ? 'rotate-180' : ''
                                }`}
                            />
                        </button>
                    )}
                </div>
                {editing && (
                    <div data-note-editor className="w-full pb-1">
                        <textarea
                            autoFocus
                            rows={1}
                            maxLength={NOTE_MAX}
                            value={note}
                            onChange={(e) =>
                                setNote(change.task_uid, e.target.value)
                            }
                            onKeyDown={(e) => {
                                if (e.key !== 'Escape' && e.key !== 'Enter') {
                                    return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                collapseNote(change.task_uid);
                            }}
                            placeholder={t(
                                'proposals.sheet.notePlaceholder',
                                'Ce qui doit changer…'
                            )}
                            aria-label={t(
                                'proposals.sheet.noteFor',
                                'Remarque pour {{task}}',
                                { task: name }
                            )}
                            className="w-full resize-none rounded-control bg-surface-high px-3 py-2 text-body text-surface-on placeholder:text-surface-on-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                    </div>
                )}
            </li>
        );
    };

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
                aria-describedby={
                    subtitle ? 'proposal-sheet-subtitle' : undefined
                }
                className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface-card text-surface-on shadow-xl ring-1 ring-outline-variant transition-[opacity,transform] duration-200 ease-out sm:max-w-xl sm:rounded-panel motion-reduce:transform-none motion-reduce:transition-none ${
                    shown
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-6 opacity-0 sm:translate-y-2'
                }`}
            >
                <div
                    aria-hidden="true"
                    className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-outline-variant sm:hidden"
                />
                <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 sm:pt-5">
                    <div className="min-w-0">
                        {period && (
                            <span className="inline-flex h-6 items-center rounded-full bg-surface-high px-2.5 text-label-m text-surface-on-variant">
                                {period}
                            </span>
                        )}
                        <h2
                            id="proposal-sheet-title"
                            className="mt-2 text-title text-surface-on"
                        >
                            {title}
                        </h2>
                        {subtitle && (
                            <p
                                id="proposal-sheet-subtitle"
                                className="mt-1 text-body-m text-surface-on-variant"
                            >
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <IconButton
                        label={t('proposals.sheet.close', 'Fermer')}
                        onClick={close}
                    >
                        <XMarkIcon />
                    </IconButton>
                </header>

                <div
                    ref={listRef}
                    className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
                >
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

                    {questions.length > 0 && results === null && (
                        <div className="mb-2 space-y-3 rounded-card bg-surface-low p-3">
                            {questions.map((question) => (
                                <div key={question.id}>
                                    <p className="text-body-m text-surface-on">
                                        {question.text}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                                                className="h-8 rounded-full bg-surface-card px-3 text-label text-surface-on ring-1 ring-inset ring-outline-variant transition-colors duration-150 hover:bg-surface-high active:scale-[0.97] disabled:opacity-50 max-sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                                <h3 className="flex items-baseline justify-between text-label-m text-surface-on-variant">
                                    <span>{groupTitle(group.key)}</span>
                                    <span aria-hidden="true">
                                        {group.rows.length}
                                    </span>
                                </h3>
                                <ul className="mt-0.5 divide-y divide-outline-variant/60">
                                    {group.rows.map(renderRow)}
                                </ul>
                            </section>
                        ))}

                    {showChanges && changes.length === 0 && (
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
                    <footer className="space-y-3 border-t border-outline-variant/60 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
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
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="md"
                                        onClick={() => setReplyText(null)}
                                    >
                                        {t('common.cancel', 'Annuler')}
                                    </Button>
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
                        {replyText === null && (
                            <>
                                {sending.length > 0 && (
                                    <p className="text-right text-label-m text-surface-on-variant">
                                        {t(
                                            'proposals.sheet.sendCaption',
                                            '{{count}} appliquées · {{sent}} renvoyées',
                                            {
                                                count: toApply.length,
                                                sent: sending.length,
                                            }
                                        )}
                                    </p>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void ignore()}
                                        className="rounded-md px-1 text-body-m text-surface-on-variant underline-offset-2 hover:text-surface-on hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]"
                                    >
                                        {t('proposals.sheet.ignore', 'Ignorer')}
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="md"
                                            onClick={() => setReplyText('')}
                                        >
                                            {t(
                                                'proposals.sheet.reply',
                                                'Répondre'
                                            )}
                                        </Button>
                                        {sending.length > 0 ? (
                                            <Button
                                                variant="primary"
                                                size="md"
                                                disabled={busy}
                                                onClick={() => void sendNotes()}
                                            >
                                                {t(
                                                    'proposals.sheet.send',
                                                    'Envoyer'
                                                )}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="primary"
                                                size="md"
                                                disabled={
                                                    busy || toApply.length === 0
                                                }
                                                onClick={() => void apply()}
                                            >
                                                {applyLabel}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </footer>
                )}
                {(results !== null || (!ready && detail && !pending)) && (
                    <footer className="flex justify-end border-t border-outline-variant/60 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                        <Button variant="secondary" size="md" onClick={close}>
                            {t('proposals.sheet.close', 'Fermer')}
                        </Button>
                    </footer>
                )}
            </section>
            {menu && menuChange && (
                <DecisionMenu
                    anchor={menu.anchor}
                    days={days}
                    current={decisionOf(menuChange)}
                    minDate={today}
                    maxDate={maxDate}
                    onPick={(decision) => decide(menuChange, decision)}
                    onClose={closeMenu}
                />
            )}
        </div>
    );
};

export default ProposalSheet;
