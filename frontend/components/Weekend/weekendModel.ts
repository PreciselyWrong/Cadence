import type {
    WeekendAnswer,
    WeekendDecisionInput,
    WeekendOp,
    WeekendPart,
    WeekendSlot,
    WeekendWeather,
} from '../../utils/proposalsService';

// The translator the sheet passes in: `t(key, fallback, options)`.
export type Translate = (
    key: string,
    fallback: string,
    options?: Record<string, unknown>
) => string;

// A note goes to the agent as one line, as long as the server accepts.
export const NOTE_MAX = 500;

// The picks of the sheet: one op per open slot, not sent until « Valider ».
export type Picks = ReadonlyMap<string, WeekendOp>;

// A slot takes a pick while it has an outing and no final decision. « Autre
// idée » is not final: the slot stays open with the request shown.
export const isOpenSlot = (slot: WeekendSlot): boolean =>
    !!slot.activity && (!slot.decision || slot.decision.op === 'other');

// A busy slot is what the calendar already holds: it never takes a decision.
export const isBusySlot = (slot: WeekendSlot): boolean =>
    !slot.activity && !!slot.busy;

// The agent's advice is preselected: « Mettre à l’agenda » on each slot it
// recommends and that is still open.
export const initialPicks = (
    answer: WeekendAnswer | null
): Map<string, WeekendOp> =>
    new Map(
        (answer?.slots ?? [])
            .filter((slot) => isOpenSlot(slot) && slot.recommended)
            .map((slot): [string, WeekendOp] => [slot.id, 'calendar'])
    );

// A tap picks its op; the same op tapped again clears the slot.
export const togglePick = (
    picks: Picks,
    slotId: string,
    op: WeekendOp
): Map<string, WeekendOp> => {
    const next = new Map(picks);
    if (next.get(slotId) === op) next.delete(slotId);
    else next.set(slotId, op);
    return next;
};

// The body of « Valider »: the picks only, in slot order, each with its
// trimmed note when there is one.
export const applyBody = (
    answer: WeekendAnswer | null,
    picks: Picks,
    notes: ReadonlyMap<string, string>
): WeekendDecisionInput[] =>
    (answer?.slots ?? []).flatMap((slot) => {
        const op = picks.get(slot.id);
        if (!op || !isOpenSlot(slot)) return [];
        const note = notes.get(slot.id)?.trim().slice(0, NOTE_MAX);
        return [{ slot_id: slot.id, op, ...(note ? { note } : {}) }];
    });

// The footer's count, e.g. « À l’agenda : 2 · Autre idée demandée : 1 ».
export const countLine = (picks: Picks, t: Translate): string => {
    const ops = [...picks.values()];
    const calendar = ops.filter((op) => op === 'calendar').length;
    const other = ops.filter((op) => op === 'other').length;
    const parts: string[] = [];
    if (calendar) {
        parts.push(
            t('weekend.countCalendar', 'À l’agenda : {{count}}', {
                count: calendar,
            })
        );
    }
    if (other) {
        parts.push(
            t('weekend.countOther', 'Autre idée demandée : {{count}}', {
                count: other,
            })
        );
    }
    return parts.length > 0
        ? parts.join(' · ')
        : t('weekend.countNone', 'Rien de choisi');
};

const PART_FALLBACK: Record<WeekendPart, string> = {
    morning: 'matin',
    afternoon: 'après-midi',
    day: 'journée',
};

export const partLabel = (part: WeekendPart, t: Translate): string =>
    t(`weekend.part.${part}`, PART_FALLBACK[part]);

const WEATHER_FALLBACK: Record<WeekendWeather, string> = {
    sun: 'ensoleillé',
    partly: 'éclaircies',
    cloud: 'nuageux',
    rain: 'pluie',
    snow: 'neige',
    storm: 'orage',
    fog: 'brouillard',
};

export const weatherLabel = (weather: WeekendWeather, t: Translate): string =>
    t(`weekend.weather.${weather}`, WEATHER_FALLBACK[weather]);

// The weekday name of a plain date (YYYY-MM-DD), read as a local day.
export const dayName = (date: string, language: string): string => {
    const value = new Date(`${date}T12:00:00`);
    if (Number.isNaN(value.getTime())) return date;
    try {
        return value.toLocaleDateString(language, { weekday: 'long' });
    } catch {
        return value.toLocaleDateString('fr', { weekday: 'long' });
    }
};

const capitalize = (text: string): string =>
    text.charAt(0).toLocaleUpperCase() + text.slice(1);

// « Samedi matin », the heading of a slot.
export const slotTitle = (
    slot: WeekendSlot,
    language: string,
    t: Translate
): string =>
    `${capitalize(dayName(slot.date, language))} ${partLabel(slot.part, t)}`;

// The decision as a muted label once it is final, with the calendar state for
// an accepted outing. Null while the slot is open.
export const decisionLabel = (
    slot: WeekendSlot,
    t: Translate
): string | null => {
    const decision = slot.decision;
    if (!decision) return null;
    if (decision.op === 'other') {
        return t('weekend.otherAsked', 'Autre idée demandée');
    }
    if (decision.op === 'skip') return t('weekend.decided.skip', 'Ignorée');
    switch (slot.event?.state) {
        case 'requested':
            return t('weekend.event.requested', 'Ajout en cours');
        case 'created':
            return t('weekend.event.created', 'Ajouté à l’agenda');
        case 'failed':
            return t('weekend.event.failed', 'Pas ajouté');
        default:
            return t('weekend.decided.calendar', 'À l’agenda');
    }
};

// Addresses from the agent: only https opens, never another scheme.
export const safeHttpsUrl = (value: string | undefined): string | null => {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
};
