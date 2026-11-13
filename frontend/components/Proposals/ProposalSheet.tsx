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
import DecisionMenu, { DayChoice, DayDetailView } from './DecisionMenu';
import { PROPOSAL_CHANGED_EVENT } from './proposalLinks';
import { POLL_MS } from './useProposal';
import {
    addDays,
    DATED_OPS,
    daysLate,
    Decision,
    dayLoad,
    DayLoad,
    decisionsToApply,
    notesToSend,
    plannableDays,
    restingCount,
    rowsOf,
    SectionId,
    sameDecision,
    suggestionOf,
    weekSections,
} from './weekDecisions';

// How long the results stay before the sheet closes when all went through.
const RESULTS_MS = 1600;
// The leave animation; the sheet unmounts once it has run.
const LEAVE_MS = 200;
// A row gliding to its new group.
const MOVE_MS = 240;

const TRIGGER = '[data-decision-trigger]';
const DOT_TONE: Record<SectionId, string> = {
    overdue: 'bg-warning',
    days: 'bg-primary',
    later: 'bg-outline-variant',
};
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

const dateOf = (decision: Decision): string | undefined =>
    DATED_OPS.includes(decision.op) ? decision.date : undefined;

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
// click away). Nothing changes until « Appliquer » or « Envoyer ». Nothing
// names the agent.
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
    // The choice picked for each question; a click picks, changes or clears it.
    // Nothing is sent until « Envoyer ».
    const [answers, setAnswers] = useState<Map<string, string>>(
        () => new Map()
    );
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
            setAnswers(new Map());
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
    const tasks = useMemo(
        () =>
            new Map<string, WeekTaskFact>(
                (facts?.tasks ?? []).map((task) => [task.uid, task])
            ),
        [facts]
    );
    // Every task of the facts has a row; one the agent gave no change for
    // starts on « Garder tel quel ».
    const changes = useMemo(
        () => (ready ? rowsOf(facts?.tasks ?? [], answer!.changes ?? []) : []),
        [ready, answer, facts]
    );
    const nameOf = (taskUid: string) => tasks.get(taskUid)?.name ?? taskUid;
    const today = facts?.today;

    const decisionOf = useCallback(
        (change: WeekChange) =>
            decisions.get(change.task_uid) ?? suggestionOf(change),
        [decisions]
    );
    const sections = useMemo(
        () => weekSections(changes, tasks, decisions),
        [changes, tasks, decisions]
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
    const questions = ready ? (answer!.questions ?? []) : [];
    const answerList = questions.flatMap((question) => {
        const choice = answers.get(question.id);
        return choice === undefined
            ? []
            : [{ question_id: question.id, choice }];
    });
    // Remarks or answers make « Envoyer » the primary action.
    const sendable = sending.length > 0 || answerList.length > 0;
    const toApply = useMemo(
        () =>
            decisionsToApply(
                changes.filter((change) => !notedUids.has(change.task_uid)),
                decisions
            ),
        [changes, decisions, notedUids]
    );

    const resting = useMemo(
        () => restingCount(changes, decisions, notedUids),
        [changes, decisions, notedUids]
    );

    const pickAnswer = useCallback((questionId: string, choice: string) => {
        setAnswers((current) => {
            const next = new Map(current);
            if (next.get(questionId) === choice) next.delete(questionId);
            else next.set(questionId, choice);
            return next;
        });
    }, []);

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

    // The week's days as the server computes them now; the facts' loads when
    // the server sent none (then no details and no bars in the strip).
    const dayDetails = useMemo(
        () => new Map((detail?.days ?? []).map((day) => [day.date, day])),
        [detail?.days]
    );
    const factLoads = useMemo(
        () =>
            new Map(
                (facts?.days ?? []).map((day) => [day.date, day.load_minutes])
            ),
        [facts]
    );
    const loadOn = useCallback(
        (date: string) =>
            dayDetails.get(date)?.load_minutes ?? factLoads.get(date) ?? 0,
        [dayDetails, factLoads]
    );
    const stripDays = useMemo(
        () => plannableDays(facts?.period, undefined),
        [facts]
    );

    // Hours as « 3 h » or « 3 h 30 »: durations and the clock of the day.
    const hoursText = (totalMinutes: number) => {
        const hours = Math.floor(totalMinutes / 60);
        const rest = totalMinutes % 60;
        return rest === 0
            ? t('proposals.load.hours', '{{hours}} h', { hours })
            : t('proposals.load.hoursMinutes', '{{hours}} h {{minutes}}', {
                  hours,
                  minutes: String(rest).padStart(2, '0'),
              });
    };
    const duration = (minutes: number) =>
        minutes < 60
            ? t('proposals.load.minutes', '{{count}} min', { count: minutes })
            : hoursText(minutes);
    const clockOf = (time: string | undefined) => {
        const [hours, minutes] = (time ?? '').split(':').map(Number);
        return Number.isNaN(hours)
            ? (time ?? '')
            : hoursText(hours * 60 + (minutes || 0));
    };
    const loadLabel = (load: DayLoad) => {
        if (load.busy) return t('proposals.load.busy', 'Occupé');
        return load.minutes > 0 ? duration(load.minutes) : '—';
    };

    const days: DayChoice[] = plannableDays(facts?.period, today).map(
        (date) => {
            const minutes = loadOn(date);
            return {
                date,
                label: t('proposals.decide.dayLoad', '{{day}} · {{load}}', {
                    day: shortDay(date),
                    load:
                        minutes > 0
                            ? duration(minutes)
                            : t('proposals.load.free', 'libre'),
                }),
                long: longDay(date),
            };
        }
    );

    // What is planned on one day, for the picker; none without the detail.
    const dayView = (date: string | undefined): DayDetailView | null => {
        const day = date ? dayDetails.get(date) : undefined;
        if (!day) return null;
        return {
            heading:
                day.load_minutes > 0
                    ? t(
                          'proposals.decide.dayHeading',
                          '{{day}} · {{load}} prévues',
                          {
                              day: longDay(day.date),
                              load: duration(day.load_minutes),
                          }
                      )
                    : longDay(day.date),
            items: day.items.map((item) => ({
                id: item.task_uid,
                name: item.name,
                duration: duration(item.minutes),
            })),
            events: day.events.map((event, index) => ({
                id: `${index}`,
                title: event.title,
                time: event.all_day
                    ? t('proposals.decide.allDay', 'Toute la journée')
                    : `${clockOf(event.start)}–${clockOf(event.end)}`,
            })),
            work: day.work
                ? t(
                      'proposals.decide.workLine',
                      '{{name}} · {{start}}–{{end}}',
                      {
                          name:
                              day.work.label ||
                              t(
                                  'proposals.decide.workHours',
                                  'Heures de travail'
                              ),
                          start: clockOf(day.work.start),
                          end: clockOf(day.work.end),
                      }
                  )
                : null,
        };
    };

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

    // « Envoyer »: the decisions that are not noted, the remarks and the
    // answers go together. With remarks the agent answers again for those
    // tasks; without, the decisions are applied and the answers announced.
    const send = useCallback(async () => {
        if (busy || !ready || !sendable) return;
        setBusy(true);
        try {
            const outcome = await sendProposal(uid, {
                decisions: toApply,
                notes: sending,
                answers: answerList,
            });
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            if (sending.length > 0) {
                showSuccessToast(
                    t(
                        'proposals.sheet.notesSent',
                        '{{count}} tâches renvoyées, je te préviens quand c’est prêt',
                        { count: sending.length }
                    )
                );
                close();
                return;
            }
            setResults(outcome.results);
            setDetail((current) =>
                current ? { ...current, status: outcome.status } : current
            );
            if (outcome.results.every((r) => r.state === 'applied')) {
                later(close, RESULTS_MS);
            }
        } catch {
            showErrorToast(
                sending.length > 0
                    ? t(
                          'proposals.sheet.sendError',
                          'Les remarques n’ont pas pu être envoyées.'
                      )
                    : t(
                          'proposals.apply.error',
                          'Les changements n’ont pas pu être appliqués.'
                      )
            );
        } finally {
            setBusy(false);
        }
    }, [
        busy,
        ready,
        sendable,
        sending,
        answerList,
        toApply,
        uid,
        close,
        showSuccessToast,
        showErrorToast,
        t,
        later,
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
            if (sendable) {
                event.preventDefault();
                void send();
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
        send,
        sendable,
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
            case 'next_week':
                return t('proposals.ops.nextWeek', 'Semaine prochaine');
            case 'this_month':
                return t('proposals.ops.thisMonth', 'Ce mois-ci');
            case 'next_month':
                return t('proposals.ops.nextMonth', 'Le mois prochain');
            case 'later':
                return t('proposals.ops.later', 'Plus tard');
            case 'keep':
                return t('proposals.decide.kept', 'Tel quel');
            default:
                return t('proposals.ops.drop', 'Abandonner');
        }
    };

    const sectionTitle = (id: SectionId) => {
        if (id === 'overdue') {
            return t('proposals.sheet.sectionOverdue', 'Échues');
        }
        if (id === 'days') return t('proposals.sheet.sectionDays', 'Par jour');
        return t('proposals.sheet.sectionLater', 'Plus loin');
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

    const showChanges = ready && results === null;
    const applyLabel = t('proposals.sheet.apply', 'Appliquer ({{count}})', {
        count: toApply.length,
    });
    const menuChange = menu
        ? changes.find((c) => c.task_uid === menu.taskUid)
        : undefined;
    // The day the open picker is on: its strip cell is marked.
    const pickedDate = menuChange ? dateOf(decisionOf(menuChange)) : undefined;

    const renderRow = (change: WeekChange, section: SectionId) => {
        const task = tasks.get(change.task_uid);
        const decision = decisionOf(change);
        const suggestion = suggestionOf(change);
        const noted = notedUids.has(change.task_uid);
        const note = notes.get(change.task_uid) ?? '';
        const changed = !noted && !sameDecision(decision, suggestion);
        const tag = tagOf(task);
        const late = daysLate(task, today);
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
                <span
                    aria-hidden="true"
                    className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[section]}`}
                />
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
                    {(late !== null ||
                        tag ||
                        change.reason ||
                        changed ||
                        noted) && (
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body-m text-surface-on-variant">
                            {late !== null && (
                                <span className="text-label-m text-warning">
                                    {late === 1
                                        ? t(
                                              'proposals.sheet.lateYesterday',
                                              'hier'
                                          )
                                        : t(
                                              'proposals.sheet.lateDays',
                                              '{{count}} j',
                                              { count: late }
                                          )}
                                </span>
                            )}
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
                {open && menu && (
                    <DecisionMenu
                        anchor={menu.anchor}
                        days={days}
                        current={decision}
                        detail={dayView(dateOf(decision) ?? dateOf(suggestion))}
                        minDate={today}
                        maxDate={maxDate}
                        onPick={(next) => decide(change, next)}
                        onClose={closeMenu}
                    />
                )}
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
                                        {question.choices.map((choice) => {
                                            const picked =
                                                answers.get(question.id) ===
                                                choice;
                                            return (
                                                <button
                                                    key={choice}
                                                    type="button"
                                                    aria-pressed={picked}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        pickAnswer(
                                                            question.id,
                                                            choice
                                                        )
                                                    }
                                                    className={`h-8 rounded-full px-3 text-label transition-colors duration-150 active:scale-[0.97] disabled:opacity-50 max-sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                                        picked
                                                            ? 'bg-primary-container text-primary-on-container'
                                                            : 'bg-surface-card text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high'
                                                    }`}
                                                >
                                                    {choice}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showChanges && stripDays.length > 0 && (
                        <ol
                            aria-label={t(
                                'proposals.sheet.days',
                                'Les jours de la semaine'
                            )}
                            className="mb-3 grid grid-cols-7 gap-1"
                        >
                            {stripDays.map((date) => {
                                const load = dayLoad(
                                    loadOn(date),
                                    dayDetails.get(date)
                                );
                                const picked = date === pickedDate;
                                return (
                                    <li
                                        key={date}
                                        data-day-cell={date}
                                        aria-current={picked || undefined}
                                        className={`min-w-0 rounded-inner bg-surface-high px-1 py-2 text-center ${
                                            picked ? 'ring-2 ring-primary' : ''
                                        }`}
                                    >
                                        <p className="truncate text-label-m text-surface-on">
                                            {formatDay(date, {
                                                weekday: 'short',
                                                day: 'numeric',
                                            })}
                                        </p>
                                        <p
                                            className={`truncate text-label-m ${
                                                load.full
                                                    ? 'text-warning'
                                                    : 'text-surface-on-variant'
                                            }`}
                                        >
                                            {loadLabel(load)}
                                        </p>
                                        {load.share !== null && (
                                            <div className="mx-auto mt-1 h-1 w-10/12 overflow-hidden rounded-full bg-surface-highest">
                                                <div
                                                    className={`h-full rounded-full ${
                                                        load.full
                                                            ? 'bg-warning'
                                                            : 'bg-primary'
                                                    }`}
                                                    style={{
                                                        width: `${Math.round(
                                                            load.share * 100
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {showChanges &&
                        sections.map((section) => (
                            <section
                                key={section.id}
                                className="pt-3"
                                aria-label={sectionTitle(section.id)}
                            >
                                <h3 className="flex items-baseline justify-between text-label-m text-surface-on-variant">
                                    <span>{sectionTitle(section.id)}</span>
                                    <span aria-hidden="true">
                                        {section.rows.length}
                                    </span>
                                </h3>
                                <ul className="mt-0.5 divide-y divide-outline-variant/60">
                                    {section.rows.map((row) =>
                                        renderRow(row, section.id)
                                    )}
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
                                {changes.length > 0 && sending.length === 0 && (
                                    <p className="text-right text-label-m text-surface-on-variant">
                                        {t(
                                            'proposals.sheet.changesCaption',
                                            '{{count}} changements · {{kept}} restent tels quels',
                                            {
                                                count: toApply.length,
                                                kept: resting,
                                            }
                                        )}
                                    </p>
                                )}
                                {answerList.length > 0 && (
                                    <p className="text-right text-label-m text-surface-on-variant">
                                        {t(
                                            'proposals.sheet.answersCaption',
                                            '{{count}} réponse donnée',
                                            { count: answerList.length }
                                        )}
                                    </p>
                                )}
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
                                        {sendable ? (
                                            <Button
                                                variant="primary"
                                                size="md"
                                                disabled={busy}
                                                onClick={() => void send()}
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
        </div>
    );
};

export default ProposalSheet;
