import type {
    WeekendActivity,
    WeekendAnswer,
    WeekendDay,
    WeekendProposal,
    WeekendDecisionInput,
    WeekendNearby,
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

export const activityMetaLine = (activity: WeekendActivity): string =>
    [activity.place, activity.start, activity.travel]
        .filter(Boolean)
        .join(' · ');

export const nearbyMetaLine = (
    item: WeekendNearby,
    language: string
): string => {
    const day = dayName(item.date, language);
    const when = item.start ? `${day} ${item.start}` : day;
    return [when, item.place, item.travel].filter(Boolean).join(' · ');
};

// Groups nearby events by day in the order each day first appears.
export const groupNearbyByDay = (
    nearby: readonly WeekendNearby[] | undefined
): Array<{ date: string; items: WeekendNearby[] }> => {
    if (!nearby || nearby.length === 0) return [];
    const byDate = new Map<string, WeekendNearby[]>();
    for (const item of nearby) {
        const list = byDate.get(item.date);
        if (list) list.push(item);
        else byDate.set(item.date, [item]);
    }
    return [...byDate.entries()].map(([date, items]) => ({ date, items }));
};

// On demand (docs/48-weekend.md › Day picker). Shared cases with Android:
// fixtures/weekend/request-and-share.json.
export const REQUEST_MAX_DAYS = 4;
export const PICKER_DAYS = 14;

const parseDay = (date: string): Date => new Date(`${date}T12:00:00Z`);
const formatDay = (value: Date): string => value.toISOString().slice(0, 10);
const addDays = (date: string, days: number): string => {
    const value = parseDay(date);
    value.setUTCDate(value.getUTCDate() + days);
    return formatDay(value);
};
const weekdayOf = (date: string): number => parseDay(date).getUTCDay();

// The 14 days the picker offers, from today.
export const pickerDays = (today: string): string[] =>
    Array.from({ length: PICKER_DAYS }, (_, i) => addDays(today, i));

// The Saturday on or after today and its Sunday; on a Sunday, today only.
export const defaultDays = (today: string): string[] => {
    if (weekdayOf(today) === 0) return [today];
    const saturday = addDays(today, (6 - weekdayOf(today) + 7) % 7);
    return [saturday, addDays(saturday, 1)];
};

// A tap adds or removes a day; a fifth day is refused. Sorted.
export const toggleDay = (
    selected: readonly string[],
    date: string
): string[] => {
    if (selected.includes(date)) return selected.filter((d) => d !== date);
    if (selected.length >= REQUEST_MAX_DAYS) return [...selected];
    return [...selected, date].sort();
};

export const isWeekendDay = (date: string): boolean =>
    [0, 6].includes(weekdayOf(date));

// « sam. 28 », the label of a day in the picker and the pending line.
export const shortDay = (date: string, language: string): string => {
    const value = parseDay(date);
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        timeZone: 'UTC',
    };
    let weekday: string;
    try {
        weekday = value.toLocaleDateString(language, options);
    } catch {
        weekday = value.toLocaleDateString('fr', options);
    }
    return `${weekday} ${value.getUTCDate()}`;
};

// What the sheet shows when opened without a uid: the pending request (if
// any) and the last weekend shown, from the list of the server.
export const latestWeekends = (
    proposals: readonly WeekendProposal[]
): { request: WeekendProposal | null; shown: WeekendProposal | null } => {
    const first = proposals[0] ?? null;
    const asked =
        first && ['pending', 'failed'].includes(first.status) && !first.answer
            ? first
            : null;
    const shown =
        proposals.find(
            (p) => p.answer && ['ready', 'applied'].includes(p.status)
        ) ?? null;
    return { request: asked, shown };
};

// Share (docs/48-weekend.md › Share).
export type ShareState = 'calendar' | 'open' | 'busy';

export interface ShareItem {
    id: string;
    part: WeekendPart;
    title: string;
    place: string | null;
    start: string | null;
    travel: string | null;
    state: ShareState;
}

export interface ShareDay {
    date: string;
    weather: WeekendWeather | null;
    min: number | null;
    max: number | null;
    items: ShareItem[];
}

// The days of the image: skipped ideas left out, calendar ones marked.
export const shareDays = (answer: WeekendAnswer, picks: Picks): ShareDay[] =>
    (answer.days ?? []).map((day) => ({
        date: day.date,
        weather: day.weather ?? null,
        min: day.min ?? null,
        max: day.max ?? null,
        items: answer.slots
            .filter((slot) => slot.date === day.date)
            .flatMap((slot): ShareItem[] => {
                const base = { id: slot.id, part: slot.part };
                if (!slot.activity) {
                    if (!slot.busy) return [];
                    return [
                        {
                            ...base,
                            title: slot.busy,
                            place: null,
                            start: null,
                            travel: null,
                            state: 'busy',
                        },
                    ];
                }
                const op = slot.decision?.op ?? null;
                const pick = picks.get(slot.id) ?? null;
                if (op === 'skip' || pick === 'skip') return [];
                const chosen = op === 'calendar' || pick === 'calendar';
                return [
                    {
                        ...base,
                        title: slot.activity.title,
                        place: slot.activity.place ?? null,
                        start: slot.activity.start ?? null,
                        travel: slot.activity.travel ?? null,
                        state: chosen ? 'calendar' : 'open',
                    },
                ];
            }),
    }));

// The most frequent weather of the days; a tie goes to the first of them.
export const dominantWeather = (
    days: readonly Pick<WeekendDay, 'weather'>[]
): WeekendWeather => {
    const counts = new Map<WeekendWeather, number>();
    for (const day of days) {
        if (day.weather)
            counts.set(day.weather, (counts.get(day.weather) ?? 0) + 1);
    }
    let best: WeekendWeather = 'partly';
    let top = 0;
    for (const [weather, count] of counts) {
        if (count > top) {
            best = weather;
            top = count;
        }
    }
    return best;
};
