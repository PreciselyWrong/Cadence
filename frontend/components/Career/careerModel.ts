import type {
    CareerDecision,
    CareerProposal,
} from '../../utils/proposalsService';

export type CareerKind = CareerDecision['kind'];

// One decision per item, keyed `kind:id` (ids are unique within a kind).
export const itemKey = (kind: CareerKind, id: string): string =>
    `${kind}:${id}`;

// « Plus tard » is not final on the server: the item comes back on the next
// visit, so only final decisions are read back from the proposal.
export const decisionMap = (
    decisions: readonly CareerDecision[] | undefined
): Map<string, CareerDecision> =>
    new Map(
        (decisions ?? [])
            .filter((d) => d.op !== 'later')
            .map((d) => [itemKey(d.kind, d.id), d])
    );

// The newest ready proposal: the server sends the latest first, but the page
// does not rely on it.
export const latestProposal = (
    proposals: readonly CareerProposal[]
): CareerProposal | null =>
    proposals
        .filter((p) => p.answer)
        .reduce<CareerProposal | null>(
            (best, p) => (!best || p.created_at > best.created_at ? p : best),
            null
        );

// Addresses come from the agent: only http and https open, never
// `javascript:` or another scheme.
export const safeUrl = (value: string | undefined): string | null => {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:'
            ? url.href
            : null;
    } catch {
        return null;
    }
};

const DAY_MS = 86400000;

// Whole calendar days from `from` to `to`, by local date.
export const daysBetween = (from: Date, to: Date): number => {
    const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / DAY_MS);
};

// A plain date (YYYY-MM-DD) is read as a local day, not UTC midnight.
export const parseDay = (value: string): Date | null => {
    const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(plain ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? null : date;
};

// « il y a 3 semaines », « hier », « il y a 2 mois »: days under two weeks,
// weeks under two months, months after.
export const agoText = (
    value: string,
    now: Date,
    language: string
): string | null => {
    const date = parseDay(value);
    if (!date) return null;
    const days = Math.max(0, daysBetween(date, now));
    const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    if (days < 14) return format.format(-days, 'day');
    if (days < 60) return format.format(-Math.round(days / 7), 'week');
    return format.format(-Math.round(days / 30), 'month');
};

// Days left before an offer closes; negative once it is past.
export const daysLeft = (value: string, now: Date): number | null => {
    const date = parseDay(value);
    return date ? daysBetween(now, date) : null;
};

export const inDaysText = (days: number, language: string): string =>
    new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
        days,
        'day'
    );

// « 9 h 15 » in French, the locale's own clock elsewhere.
export const clockText = (value: string, language: string): string | null => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (language.startsWith('fr')) {
        return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return new Intl.DateTimeFormat(language, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

// The quiet label a decided item keeps; there is no undo.
export const STATE_LABELS: Record<string, [string, string]> = {
    'offer:apply': ['career.state.applied', 'Postulé'],
    'offer:skip': ['career.state.skipped', 'Passée'],
    'offer:later': ['career.state.later', 'Plus tard'],
    'followup:done': ['career.state.done', 'Faite'],
    'followup:later': ['career.state.later', 'Plus tard'],
    'followup:task': ['career.state.taskCreated', 'Tâche créée'],
    'task:create': ['career.state.added', 'Ajoutée'],
    'task:skip': ['career.state.dismissed', 'Écartée'],
};

export const stateLabelOf = (decision: CareerDecision): [string, string] =>
    STATE_LABELS[`${decision.kind}:${decision.op}`] ?? [
        'career.state.later',
        'Plus tard',
    ];

// The button a staged choice names, as « choisi : Postuler ».
export const CHOICE_LABELS: Record<string, [string, string]> = {
    'offer:apply': ['career.offers.apply', 'Postuler'],
    'offer:skip': ['career.skip', 'Passer'],
    'offer:later': ['career.later', 'Plus tard'],
    'followup:done': ['career.followups.done', 'Fait'],
    'followup:task': ['career.followups.createTask', 'Créer la tâche'],
    'followup:later': ['career.later', 'Plus tard'],
    'task:create': ['career.tasks.add', 'Ajouter'],
    'task:skip': ['career.skip', 'Passer'],
};

export const choiceLabelOf = (decision: CareerDecision): [string, string] =>
    CHOICE_LABELS[`${decision.kind}:${decision.op}`] ?? [
        'career.later',
        'Plus tard',
    ];
