import type {
    AbstinenceLog,
    CadenceGoal,
    CadenceGroup,
    CadenceHabit,
    CadenceHabitDetail,
    DayName,
    GoalInput,
    GoalType,
    Period,
    ScheduleInput,
    ScheduleMode,
    UnitDimension,
} from './cadenceHabitsService';

// Pure rules and formatting of the Cadence habits screens. They mirror the
// formatting of the Android app (HabitFormatter, HabitEditorModel).

export const DAY_NAMES: DayName[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];

export const ALL_DAY_GROUP = 'group-day';

export type HabitKind = 'goal' | 'limit' | 'tracker' | 'abstinence';

export function kindOf(goal: Pick<CadenceGoal, 'direction' | 'target_minor'>) {
    if (goal.direction === 'TRACK_ONLY') return 'tracker' as const;
    if (goal.direction === 'AT_MOST') {
        return goal.target_minor === 0
            ? ('abstinence' as const)
            : ('limit' as const);
    }
    return 'goal' as const;
}

// --- Units -------------------------------------------------------------------

export interface MeasurementUnit {
    id: string;
    dimension: UnitDimension;
    nameFr: string;
    symbol: string;
    scale: number;
}

const unit = (
    id: string,
    dimension: UnitDimension,
    nameFr: string,
    symbol: string,
    scale = 1
): MeasurementUnit => ({ id, dimension, nameFr, symbol, scale });

// The built-in catalogue of the app (MeasurementUnit.BUILT_INS).
export const BUILT_IN_UNITS: MeasurementUnit[] = [
    unit('seconds', 'TIME', 'Secondes', 's'),
    unit('minutes', 'TIME', 'Minutes', 'min', 60),
    unit('hours', 'TIME', 'Heures', 'h', 3600),
    unit('count', 'COUNT', 'Fois', 'x'),
    unit('repetition', 'COUNT', 'Répétitions', 'rép'),
    unit('set', 'COUNT', 'Séries', 'séries'),
    unit('session', 'COUNT', 'Séances', 'séances'),
    unit('step', 'COUNT', 'Étapes', 'étapes'),
    unit('page', 'COUNT', 'Pages', 'pages'),
    unit('glass', 'COUNT', 'Verres', 'verres'),
    unit('item', 'COUNT', 'Éléments', 'éléments'),
    unit('meters', 'DISTANCE', 'Mètres', 'm'),
    unit('kilometers', 'DISTANCE', 'Kilomètres', 'km', 1000),
    unit('grams', 'MASS', 'Grammes', 'g'),
    unit('kilograms', 'MASS', 'Kilogrammes', 'kg', 1000),
    unit('milliliters', 'VOLUME', 'Millilitres', 'ml'),
    unit('centiliters', 'VOLUME', 'Centilitres', 'cl', 10),
    unit('liters', 'VOLUME', 'Litres', 'l', 1000),
];

const SINGULAR: Record<string, string> = {
    set: 'série',
    session: 'séance',
    step: 'étape',
    page: 'page',
    glass: 'verre',
    item: 'élément',
};

type UnitFields = Pick<
    CadenceGoal,
    | 'goal_type'
    | 'unit_id'
    | 'unit_symbol'
    | 'unit_dimension'
    | 'unit_name_fr'
    | 'unit_scale_to_canonical'
>;

export function unitOfGoal(goal: UnitFields): MeasurementUnit | null {
    if (!goal.unit_id) return null;
    return {
        id: goal.unit_id,
        dimension: goal.unit_dimension ?? 'CUSTOM',
        nameFr: goal.unit_name_fr ?? goal.unit_id,
        symbol: goal.unit_symbol ?? '',
        scale: goal.unit_scale_to_canonical ?? 1,
    };
}

function formatDuration(seconds: number, goalUnit: MeasurementUnit | null) {
    if (seconds === 0) return '0 min';
    if (goalUnit?.id === 'seconds' || seconds % 60 !== 0) {
        return `${seconds} s`;
    }
    const totalMinutes = seconds / 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`;
    if (hours > 0) return `${hours} h`;
    return `${minutes} min`;
}

function formatScaled(minor: number, scale: number) {
    if (scale <= 1) return String(minor);
    const value = minor / scale;
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/0+$/, '').replace(/[.,]$/, '');
}

export function formatMinor(minor: number, goal: UnitFields): string {
    const goalUnit = unitOfGoal(goal);
    switch (goal.goal_type) {
        case 'BINARY':
            return minor > 0 ? '1' : '0';
        case 'DURATION':
            return formatDuration(minor, goalUnit);
        default:
            return formatScaled(minor, goalUnit?.scale ?? 1);
    }
}

function singularSymbol(goalUnit: MeasurementUnit) {
    const known = SINGULAR[goalUnit.id];
    if (known) return known;
    const symbol = goalUnit.symbol;
    if (
        goalUnit.dimension === 'CUSTOM' &&
        symbol.length > 3 &&
        symbol.endsWith('s') &&
        !symbol.endsWith('ss')
    ) {
        return symbol.slice(0, -1);
    }
    return symbol;
}

export function unitSuffix(goal: UnitFields, minor?: number): string {
    if (goal.goal_type === 'DURATION') return '';
    const goalUnit = unitOfGoal(goal);
    const symbol = goalUnit?.symbol.trim();
    if (!goalUnit || !symbol) return '';
    const singular = minor !== undefined && minor / goalUnit.scale < 2;
    return ` ${singular ? singularSymbol(goalUnit) : symbol}`;
}

export const formatWithUnit = (minor: number, goal: UnitFields) =>
    formatMinor(minor, goal) + unitSuffix(goal, minor);

// What a person types (« 1,5 ») in the unit shown, as minor units. Null when it
// is not a positive amount.
export function toMinor(text: string, scale: number): number | null {
    const normalized = text.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const minor = Math.round(parseFloat(normalized) * scale);
    return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function fromMinor(minor: number, scale: number): string {
    if (scale <= 1) return String(minor);
    return String(parseFloat((minor / scale).toFixed(6)));
}

export function quickAmounts(text: string, scale: number): number[] {
    return text
        .split(/[\s;]+/)
        .map((part) => part.replace(/,+$/, ''))
        .map((part) => toMinor(part, scale))
        .filter((minor): minor is number => minor !== null);
}

// --- Colours -----------------------------------------------------------------

// The server keeps a signed 32-bit ARGB (Room's colorArgb).
export function hexToArgb(hex: string | null | undefined): number | null {
    const match = /^#([0-9a-f]{6})$/i.exec((hex ?? '').trim());
    if (!match) return null;
    return 0xff000000 | parseInt(match[1], 16) | 0;
}

export function argbToHex(argb: number | null | undefined): string | null {
    if (argb === null || argb === undefined) return null;
    return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`;
}

const WHITE = '#ffffff';
const INK = '#1b1b21';
const MIN_CONTRAST = 4.5;

const toRgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: number[]) =>
    `#${rgb
        .map((c) =>
            Math.min(255, Math.max(0, Math.round(c)))
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`;

function luminance(hex: string) {
    const [r, g, b] = toRgb(hex).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function toHsl(hex: string) {
    const [r, g, b] = toRgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
}

function fromHsl(h: number, s: number, l: number) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// Port of readableTint: keeps hue and saturation, moves only the lightness
// until the tint reaches the contrast on the background.
function readableTint(tint: string, background: string) {
    if (contrastRatio(tint, background) >= MIN_CONTRAST) return tint;
    const hsl = toHsl(tint);
    const towardDark =
        contrastRatio('#000000', background) >=
        contrastRatio(WHITE, background);
    let lightness = hsl.l;
    while (lightness >= 0 && lightness <= 1) {
        lightness += towardDark ? -0.02 : 0.02;
        const candidate = fromHsl(
            hsl.h,
            hsl.s,
            Math.min(1, Math.max(0, lightness))
        );
        if (contrastRatio(candidate, background) >= MIN_CONTRAST) {
            return candidate;
        }
    }
    return towardDark ? '#000000' : WHITE;
}

export interface HabitCardColors {
    stops: string[];
    ink: string;
    pillFill: string;
}

// Port of habitCardColors (e07): three stops of the tint, an ink that reads on
// each of them, and a veil for the action pill.
export function habitCardColors(tint: string): HabitCardColors {
    const hsl = toHsl(tint);
    const lightTint = luminance(tint) >= 0.5;
    const ink = lightTint ? INK : WHITE;
    const stops = [-0.08, 0, 0.06].map((shift) =>
        readableTint(
            fromHsl(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + shift))),
            ink
        )
    );
    return {
        stops,
        ink,
        pillFill: lightTint ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)',
    };
}

// --- Dates -------------------------------------------------------------------

const toUtc = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, days: number) =>
    fromUtc(toUtc(date) + days * 86_400_000);

export const daysBetween = (from: string, to: string) =>
    Math.round((toUtc(to) - toUtc(from)) / 86_400_000);

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function monthEnd(date: string) {
    const [y, m] = date.split('-').map(Number);
    return fromUtc(Date.UTC(y, m, 0));
}

export function shiftMonth(date: string, delta: number) {
    const [y, m] = date.split('-').map(Number);
    return fromUtc(Date.UTC(y, m - 1 + delta, 1));
}

// An instant that falls on the given civil date in any zone within +-11 h of
// UTC, for entries typed by date only.
export const instantOnDate = (date: string) => `${date}T12:00:00.000Z`;

// --- Groups ------------------------------------------------------------------

export interface GroupedHabits {
    group: CadenceGroup;
    habits: CadenceHabit[];
}

export function groupHabits(
    habits: CadenceHabit[],
    groups: CadenceGroup[]
): GroupedHabits[] {
    const known = new Set(groups.map((g) => g.uid));
    const byGroup = new Map<string, CadenceHabit[]>();
    for (const habit of habits) {
        const key =
            habit.group_uid && known.has(habit.group_uid)
                ? habit.group_uid
                : ALL_DAY_GROUP;
        byGroup.set(key, [...(byGroup.get(key) ?? []), habit]);
    }
    const ordered = [...groups].sort((a, b) => a.sort_order - b.sort_order);
    const result: GroupedHabits[] = [];
    for (const group of ordered) {
        const items = byGroup.get(group.uid);
        if (!items?.length) continue;
        items.sort(
            (a, b) =>
                a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        );
        result.push({ group, habits: items });
    }
    return result;
}

// A group is open at a minute of the day; ranges that cross midnight wrap.
export function groupIsOpenAt(group: CadenceGroup, minute: number) {
    const { start_minute: start, end_minute: end } = group;
    if (start === null || end === null) return true;
    return start <= end
        ? minute >= start && minute < end
        : minute >= start || minute < end;
}

// --- Editing -----------------------------------------------------------------

export interface HabitDraft {
    name: string;
    description: string;
    colorHex: string;
    groupUid: string;
    kind: HabitKind;
    goalType: GoalType;
    target: string;
    unitId: string;
    customName: string;
    customSymbol: string;
    period: Period;
    minimum: string;
    frequencyTarget: string;
    scheduleMode: ScheduleMode;
    activeDays: DayName[];
    firstDay: DayName;
    intervalDays: string;
    quickValues: string;
    reminderTimes: string[];
    conditionalReminders: boolean;
    timerEnabled: boolean;
    abstinenceProfile: string;
}

export const ABSTINENCE_PROFILES = [
    'ALCOHOL',
    'SMOKING',
    'VAPING',
    'CANNABIS',
    'CAFFEINE',
    'GAMBLING',
    'SOCIAL_MEDIA',
    'BEDTIME_SCREENS',
    'IMPULSE_SHOPPING',
    'PORNOGRAPHY',
    'MASTURBATION',
    'CUSTOM',
] as const;

export const emptyDraft = (): HabitDraft => ({
    name: '',
    description: '',
    colorHex: '',
    groupUid: ALL_DAY_GROUP,
    kind: 'goal',
    goalType: 'BINARY',
    target: '1',
    unitId: 'count',
    customName: '',
    customSymbol: '',
    period: 'DAY',
    minimum: '',
    frequencyTarget: '',
    scheduleMode: 'EVERY_DAY',
    activeDays: [...DAY_NAMES],
    firstDay: 'MONDAY',
    intervalDays: '2',
    quickValues: '1',
    reminderTimes: [],
    conditionalReminders: true,
    timerEnabled: false,
    abstinenceProfile: 'NONE',
});

// Units a goal type can be measured in.
export function unitsFor(goalType: GoalType): MeasurementUnit[] {
    switch (goalType) {
        case 'DURATION':
            return BUILT_IN_UNITS.filter((u) => u.dimension === 'TIME');
        case 'COUNT':
            return BUILT_IN_UNITS.filter((u) => u.dimension === 'COUNT');
        case 'QUANTITY':
            return BUILT_IN_UNITS.filter((u) =>
                ['DISTANCE', 'MASS', 'VOLUME'].includes(u.dimension)
            );
        default:
            return [];
    }
}

const CUSTOM = 'custom';

function draftUnit(draft: HabitDraft): MeasurementUnit | null {
    if (draft.kind === 'abstinence') {
        return BUILT_IN_UNITS.find((u) => u.id === 'count') ?? null;
    }
    if (draft.goalType === 'BINARY') return null;
    if (draft.unitId === CUSTOM) {
        const name = draft.customName.trim();
        const slug = name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        return {
            id: `custom:${slug || 'unit'}`,
            dimension: 'CUSTOM',
            nameFr: name,
            symbol: draft.customSymbol.trim(),
            scale: 1,
        };
    }
    return (
        BUILT_IN_UNITS.find((u) => u.id === draft.unitId) ??
        unitsFor(draft.goalType)[0] ??
        null
    );
}

const effectiveGoalType = (draft: HabitDraft): GoalType => {
    if (draft.kind === 'abstinence') return 'COUNT';
    if (draft.kind === 'goal') return draft.goalType;
    return draft.goalType === 'BINARY' ? 'COUNT' : draft.goalType;
};

export function draftScale(draft: HabitDraft): number {
    return (
        draftUnit({ ...draft, goalType: effectiveGoalType(draft) })?.scale ?? 1
    );
}

export function buildGoal(
    draft: HabitDraft,
    base?: CadenceGoal | null
): GoalInput {
    const goalType = effectiveGoalType(draft);
    const goalUnit = draftUnit({ ...draft, goalType });
    const scale = goalUnit?.scale ?? 1;
    const unitFields = goalUnit
        ? {
              unit_id: goalUnit.id,
              unit_dimension: goalUnit.dimension,
              unit_name_fr: goalUnit.nameFr,
              unit_symbol: goalUnit.symbol,
              unit_scale_to_canonical: goalUnit.scale,
          }
        : {
              unit_id: null,
              unit_dimension: null,
              unit_name_fr: null,
              unit_symbol: null,
              unit_scale_to_canonical: null,
          };

    const common = {
        goal_type: goalType,
        ...unitFields,
        progression_step: null,
        progression_cadence: null,
        progression_cap_minor: null,
        progression_starts_on: null,
    };

    if (draft.kind === 'abstinence') {
        return {
            ...common,
            target_minor: 0,
            period: 'DAY',
            direction: 'AT_MOST',
            minimum_minor: null,
            frequency_target: null,
        };
    }
    if (draft.kind === 'tracker') {
        return {
            ...common,
            target_minor: 0,
            period: 'DAY',
            direction: 'TRACK_ONLY',
            minimum_minor: null,
            frequency_target: null,
        };
    }
    const target =
        goalType === 'BINARY' ? 1 : (toMinor(draft.target, scale) ?? 0);
    if (draft.kind === 'limit') {
        return {
            ...common,
            target_minor: target,
            period: draft.period,
            direction: 'AT_MOST',
            minimum_minor: null,
            frequency_target: null,
        };
    }
    const frequency = parseInt(draft.frequencyTarget, 10);
    const keepsProgression =
        !!base?.progression_step && base.unit_id === unitFields.unit_id;
    return {
        ...common,
        target_minor: target,
        period: draft.period,
        direction: 'AT_LEAST',
        minimum_minor:
            goalType === 'BINARY' ? null : toMinor(draft.minimum, scale),
        frequency_target: frequency > 0 ? frequency : null,
        ...(keepsProgression && base
            ? {
                  progression_step: base.progression_step,
                  progression_cadence: base.progression_cadence,
                  progression_cap_minor: base.progression_cap_minor,
                  progression_starts_on: base.progression_starts_on,
              }
            : {}),
    };
}

export function buildSchedule(draft: HabitDraft): ScheduleInput {
    const interval = Math.max(2, parseInt(draft.intervalDays, 10) || 2);
    return {
        schedule_mode: draft.scheduleMode,
        active_days: (draft.scheduleMode === 'SELECTED_DAYS'
            ? DAY_NAMES.filter((d) => draft.activeDays.includes(d))
            : DAY_NAMES
        ).join(','),
        first_day_of_week: draft.firstDay,
        interval_days: interval,
    };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// The fields of the draft that the rules of the domain refuse.
export function validateDraft(draft: HabitDraft): string[] {
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push('name');
    const goalType = effectiveGoalType(draft);
    const scale = draftScale(draft);
    if (draft.kind === 'goal' || draft.kind === 'limit') {
        const needsTarget = goalType !== 'BINARY';
        const target = needsTarget ? toMinor(draft.target, scale) : 1;
        if (target === null) errors.push('target');
        if (draft.kind === 'goal' && needsTarget && draft.minimum.trim()) {
            const minimum = toMinor(draft.minimum, scale);
            if (minimum === null || (target !== null && minimum > target)) {
                errors.push('minimum');
            }
        }
        if (draft.kind === 'goal' && draft.frequencyTarget.trim()) {
            if (!(parseInt(draft.frequencyTarget, 10) > 0)) {
                errors.push('frequency');
            }
        }
    }
    if (
        draft.unitId === CUSTOM &&
        goalType !== 'BINARY' &&
        draft.kind !== 'abstinence' &&
        (!draft.customName.trim() || !draft.customSymbol.trim())
    ) {
        errors.push('customUnit');
    }
    if (draft.scheduleMode === 'SELECTED_DAYS' && !draft.activeDays.length) {
        errors.push('activeDays');
    }
    if (
        draft.scheduleMode === 'INTERVAL_DAYS' &&
        !(parseInt(draft.intervalDays, 10) >= 2)
    ) {
        errors.push('intervalDays');
    }
    if (draft.reminderTimes.some((time) => !TIME.test(time))) {
        errors.push('reminderTimes');
    }
    return errors;
}

function isFiniteDecimal(value: number, scale: number) {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    let denominator = scale / gcd(value, scale);
    while (denominator % 2 === 0) denominator /= 2;
    while (denominator % 5 === 0) denominator /= 5;
    return denominator === 1;
}

const CANONICAL: Partial<Record<UnitDimension, string>> = {
    TIME: 'seconds',
    DISTANCE: 'meters',
    MASS: 'grams',
    VOLUME: 'milliliters',
};

export function draftFromHabit(detail: CadenceHabitDetail): HabitDraft {
    const base = emptyDraft();
    const goal = detail.goal;
    const schedule = detail.schedule;
    const draft: HabitDraft = {
        ...base,
        name: detail.name,
        description: detail.description ?? '',
        colorHex: argbToHex(detail.color_argb) ?? '',
        groupUid: detail.group_uid ?? ALL_DAY_GROUP,
        timerEnabled: detail.timer_enabled,
        abstinenceProfile: detail.abstinence_profile,
        reminderTimes: detail.reminders.map((r) => r.time),
        conditionalReminders: detail.reminders.every((r) => r.conditional),
    };
    if (schedule) {
        draft.scheduleMode = schedule.schedule_mode;
        draft.activeDays = DAY_NAMES.filter((d) =>
            schedule.active_days.split(',').includes(d)
        );
        draft.firstDay = schedule.first_day_of_week;
        draft.intervalDays = String(schedule.interval_days);
    }
    if (!goal) return draft;

    draft.kind = kindOf(goal);
    draft.goalType = goal.goal_type;
    draft.period = goal.period;
    draft.frequencyTarget = goal.frequency_target
        ? String(goal.frequency_target)
        : '';

    const goalUnit = unitOfGoal(goal);
    const custom = goalUnit?.dimension === 'CUSTOM';
    let displayUnit = goalUnit;
    const values = [
        goal.target_minor,
        goal.minimum_minor,
        ...detail.quick_values.map((q) => q.amount_minor),
    ].filter((v): v is number => v !== null && v > 0);
    if (
        goalUnit &&
        !custom &&
        values.some((v) => !isFiniteDecimal(v, goalUnit.scale))
    ) {
        const canonical = BUILT_IN_UNITS.find(
            (u) => u.id === CANONICAL[goalUnit.dimension]
        );
        if (canonical) displayUnit = canonical;
    }
    const scale = displayUnit?.scale ?? 1;
    draft.unitId = custom ? CUSTOM : (displayUnit?.id ?? 'count');
    if (custom && goalUnit) {
        draft.customName = goalUnit.nameFr;
        draft.customSymbol = goalUnit.symbol;
    }
    draft.target =
        goal.target_minor > 0 ? fromMinor(goal.target_minor, scale) : '';
    draft.minimum = goal.minimum_minor
        ? fromMinor(goal.minimum_minor, scale)
        : '';
    draft.quickValues =
        [...detail.quick_values]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((q) => fromMinor(q.amount_minor, scale))
            .join(' ') || '';
    return draft;
}

// --- Status line --------------------------------------------------------------

export interface DayCell {
    date: string;
    status:
        | 'CLEAR'
        | 'OCCURRENCE'
        | 'PAUSED'
        | 'UNOBSERVED'
        | 'TODAY_CLEAR'
        | 'TODAY_OCCURRENCE';
}

// The days of an abstinence, ending today: no entry is a clear day, an entry
// an occurrence, a pause is skipped (AbstinenceStatsCalculator).
export function abstinenceDays(input: {
    startsOn: string;
    today: string;
    span: number;
    entries: Pick<AbstinenceLog, 'local_date'>[];
    pauses: { start: string; end_exclusive: string | null }[];
}): DayCell[] {
    const occurrences = new Set(input.entries.map((e) => e.local_date));
    const cells: DayCell[] = [];
    for (let offset = input.span - 1; offset >= 0; offset -= 1) {
        const date = addDays(input.today, -offset);
        const paused = input.pauses.some(
            (p) =>
                date >= p.start && (!p.end_exclusive || date < p.end_exclusive)
        );
        const isToday = date === input.today;
        const occurred = occurrences.has(date);
        let status: DayCell['status'];
        if (date < input.startsOn) status = 'UNOBSERVED';
        else if (paused) status = 'PAUSED';
        else if (isToday)
            status = occurred ? 'TODAY_OCCURRENCE' : 'TODAY_CLEAR';
        else status = occurred ? 'OCCURRENCE' : 'CLEAR';
        cells.push({ date, status });
    }
    return cells;
}

export const isAbstinenceHabit = (habit: Pick<CadenceHabit, 'goal'>) =>
    !!habit.goal && kindOf(habit.goal) === 'abstinence';

export const isAlcoholHabit = (
    habit: Pick<CadenceHabit, 'abstinence_profile'>
) => habit.abstinence_profile === 'ALCOHOL';

export const newId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
