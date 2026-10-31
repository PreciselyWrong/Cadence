import {
    abstinenceDays,
    argbToHex,
    buildGoal,
    buildSchedule,
    draftFromHabit,
    emptyDraft,
    formatMinor,
    formatWithUnit,
    groupHabits,
    habitCardColors,
    hexToArgb,
    kindOf,
    quickAmounts,
    toMinor,
    validateDraft,
} from '../cadenceHabitUtils';
import type {
    CadenceGoal,
    CadenceGroup,
    CadenceHabit,
    CadenceHabitDetail,
} from '../cadenceHabitsService';

const goal = (over: Partial<CadenceGoal> = {}): CadenceGoal => ({
    uid: 'g1',
    habit_uid: 'h1',
    target_minor: 1,
    period: 'DAY',
    goal_type: 'BINARY',
    unit_id: null,
    unit_dimension: null,
    unit_name_fr: null,
    unit_symbol: null,
    unit_scale_to_canonical: null,
    frequency_target: null,
    minimum_minor: null,
    direction: 'AT_LEAST',
    progression_step: null,
    progression_cadence: null,
    progression_cap_minor: null,
    progression_starts_on: null,
    effective_from: '2026-10-01',
    ...over,
});

const habit = (over: Partial<CadenceHabit> = {}): CadenceHabit => ({
    uid: 'h1',
    group_uid: null,
    name: 'Lire',
    description: null,
    icon_id: null,
    color_argb: null,
    active: true,
    starts_on: '2026-10-01',
    archived: false,
    sort_order: 0,
    timer_enabled: false,
    abstinence_profile: 'NONE',
    abstinence_started_at: null,
    abstinence_spending_minor: null,
    abstinence_spending_period: null,
    abstinence_savings_currency: null,
    alcohol_follow_up_time: null,
    goal: goal(),
    schedule: null,
    status: { date: '2026-10-05', evaluation: null, streak: null },
    ...over,
});

describe('kindOf', () => {
    it('tells goals, limits, free activities and abstinences apart', () => {
        expect(kindOf(goal())).toBe('goal');
        expect(kindOf(goal({ direction: 'AT_MOST', target_minor: 2 }))).toBe(
            'limit'
        );
        expect(kindOf(goal({ direction: 'AT_MOST', target_minor: 0 }))).toBe(
            'abstinence'
        );
        expect(kindOf(goal({ direction: 'TRACK_ONLY', target_minor: 0 }))).toBe(
            'tracker'
        );
    });
});

describe('quantities', () => {
    const minutes = {
        goal_type: 'DURATION' as const,
        unit_id: 'minutes',
        unit_symbol: 'min',
        unit_dimension: 'TIME' as const,
        unit_name_fr: 'Minutes',
        unit_scale_to_canonical: 60,
    };

    it('writes durations the way the app does', () => {
        expect(formatMinor(0, goal(minutes))).toBe('0 min');
        expect(formatMinor(1800, goal(minutes))).toBe('30 min');
        expect(formatMinor(3900, goal(minutes))).toBe('1 h 5 min');
        expect(formatMinor(3600, goal(minutes))).toBe('1 h');
        expect(formatMinor(90, goal(minutes))).toBe('90 s');
    });

    it('scales quantities and agrees the unit', () => {
        const km = goal({
            goal_type: 'QUANTITY',
            unit_id: 'kilometers',
            unit_symbol: 'km',
            unit_scale_to_canonical: 1000,
        });
        expect(formatMinor(2500, km)).toBe('2.5');
        expect(formatWithUnit(2500, km)).toBe('2.5 km');
        const glass = goal({
            goal_type: 'COUNT',
            unit_id: 'glass',
            unit_symbol: 'verres',
            unit_scale_to_canonical: 1,
        });
        expect(formatWithUnit(1, glass)).toBe('1 verre');
        expect(formatWithUnit(3, glass)).toBe('3 verres');
    });

    it('turns what a person types into minor units', () => {
        expect(toMinor('1,5', 1000)).toBe(1500);
        expect(toMinor('30', 60)).toBe(1800);
        expect(toMinor('0.25', 100)).toBe(25);
        expect(toMinor('', 1)).toBeNull();
        expect(toMinor('abc', 1)).toBeNull();
        expect(toMinor('-2', 1)).toBeNull();
        expect(toMinor('0', 1)).toBeNull();
    });

    it('reads quick amounts typed with spaces, commas or semicolons', () => {
        expect(quickAmounts('1 2, 5;10', 1)).toEqual([1, 2, 5, 10]);
        expect(quickAmounts('15 30', 60)).toEqual([900, 1800]);
        expect(quickAmounts('x 2', 1)).toEqual([2]);
    });
});

describe('colours', () => {
    it('round-trips the signed ARGB the server stores', () => {
        expect(hexToArgb('#b91c1c')).toBe(-4645860);
        expect(argbToHex(-4645860)).toBe('#b91c1c');
        expect(argbToHex(0xff5546ee | 0)).toBe('#5546ee');
        expect(argbToHex(null)).toBeNull();
        expect(hexToArgb('')).toBeNull();
    });

    const luminance = (hex: string) => {
        const channel = (i: number) => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    };
    const contrast = (a: string, b: string) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    it.each(['#b91c1c', '#facc15', '#15803d', '#374151', '#2dd4bf', '#ffffff'])(
        'keeps ink readable on every stop of a card tinted %s',
        (tint) => {
            const colors = habitCardColors(tint);
            expect(colors.stops).toHaveLength(3);
            for (const stop of colors.stops) {
                expect(contrast(colors.ink, stop)).toBeGreaterThanOrEqual(4.5);
            }
        }
    );
});

describe('groupHabits', () => {
    const groups: CadenceGroup[] = [
        {
            uid: 'group-day',
            name: 'Journée',
            start_minute: null,
            end_minute: null,
            sort_order: 0,
        },
        {
            uid: 'group-morning',
            name: 'Matin',
            start_minute: 300,
            end_minute: 720,
            sort_order: 1,
        },
        {
            uid: 'group-evening',
            name: 'Soir',
            start_minute: 1080,
            end_minute: 1380,
            sort_order: 3,
        },
    ];

    it('puts habits without a group in the all-day group and drops empty groups', () => {
        const result = groupHabits(
            [
                habit({ uid: 'a', group_uid: 'group-morning' }),
                habit({ uid: 'b', group_uid: null }),
                habit({ uid: 'c', group_uid: 'unknown' }),
            ],
            groups
        );
        expect(result.map((g) => g.group.uid)).toEqual([
            'group-day',
            'group-morning',
        ]);
        expect(result[0].habits.map((h) => h.uid)).toEqual(['b', 'c']);
    });

    it('orders habits by sort order then name', () => {
        const [first] = groupHabits(
            [
                habit({ uid: 'z', name: 'Zèbre', sort_order: 1 }),
                habit({ uid: 'a', name: 'Abeille', sort_order: 1 }),
                habit({ uid: 'm', name: 'Mulot', sort_order: 0 }),
            ],
            groups
        );
        expect(first.habits.map((h) => h.uid)).toEqual(['m', 'a', 'z']);
    });
});

describe('editing a habit', () => {
    it('builds the goal of each kind as the server expects it', () => {
        const base = { ...emptyDraft(), name: 'x' };
        expect(buildGoal({ ...base, kind: 'goal' })).toMatchObject({
            target_minor: 1,
            direction: 'AT_LEAST',
            goal_type: 'BINARY',
            period: 'DAY',
        });
        expect(
            buildGoal({
                ...base,
                kind: 'limit',
                goalType: 'COUNT',
                unitId: 'glass',
                target: '2',
                minimum: '1',
            })
        ).toMatchObject({
            direction: 'AT_MOST',
            target_minor: 2,
            minimum_minor: null,
        });
        expect(buildGoal({ ...base, kind: 'abstinence' })).toMatchObject({
            direction: 'AT_MOST',
            target_minor: 0,
            goal_type: 'COUNT',
            period: 'DAY',
        });
        expect(buildGoal({ ...base, kind: 'tracker' })).toMatchObject({
            direction: 'TRACK_ONLY',
            target_minor: 0,
            period: 'DAY',
            minimum_minor: null,
            frequency_target: null,
        });
    });

    it('stores minutes in seconds and keeps the unit of the app', () => {
        expect(
            buildGoal({
                ...emptyDraft(),
                goalType: 'DURATION',
                unitId: 'minutes',
                target: '30',
                minimum: '10',
            })
        ).toMatchObject({
            target_minor: 1800,
            minimum_minor: 600,
            unit_id: 'minutes',
            unit_dimension: 'TIME',
            unit_scale_to_canonical: 60,
        });
    });

    it('builds a custom unit', () => {
        expect(
            buildGoal({
                ...emptyDraft(),
                goalType: 'QUANTITY',
                unitId: 'custom',
                customName: 'Tasses',
                customSymbol: 'tasses',
                target: '3',
            })
        ).toMatchObject({
            target_minor: 3,
            unit_dimension: 'CUSTOM',
            unit_name_fr: 'Tasses',
            unit_symbol: 'tasses',
            unit_scale_to_canonical: 1,
        });
    });

    it('builds the schedule', () => {
        expect(
            buildSchedule({
                ...emptyDraft(),
                scheduleMode: 'SELECTED_DAYS',
                activeDays: ['MONDAY', 'FRIDAY'],
            })
        ).toMatchObject({
            schedule_mode: 'SELECTED_DAYS',
            active_days: 'MONDAY,FRIDAY',
        });
        expect(
            buildSchedule({
                ...emptyDraft(),
                scheduleMode: 'INTERVAL_DAYS',
                intervalDays: '3',
            })
        ).toMatchObject({ interval_days: 3 });
    });

    it('refuses what the rules of the domain refuse', () => {
        const ok = { ...emptyDraft(), name: 'Lire' };
        expect(validateDraft(ok)).toEqual([]);
        expect(validateDraft({ ...ok, name: '  ' })).toContain('name');
        expect(
            validateDraft({ ...ok, goalType: 'COUNT', target: '0' })
        ).toContain('target');
        expect(
            validateDraft({
                ...ok,
                goalType: 'COUNT',
                target: '5',
                minimum: '6',
            })
        ).toContain('minimum');
        expect(
            validateDraft({
                ...ok,
                scheduleMode: 'SELECTED_DAYS',
                activeDays: [],
            })
        ).toContain('activeDays');
        expect(
            validateDraft({
                ...ok,
                scheduleMode: 'INTERVAL_DAYS',
                intervalDays: '1',
            })
        ).toContain('intervalDays');
        expect(validateDraft({ ...ok, reminderTimes: ['25:00'] })).toContain(
            'reminderTimes'
        );
    });

    it('rebuilds a draft from a habit to edit it', () => {
        const detail = {
            ...habit({
                name: 'Courir',
                color_argb: hexToArgb('#15803d'),
                goal: goal({
                    goal_type: 'DURATION',
                    target_minor: 1800,
                    unit_id: 'minutes',
                    unit_symbol: 'min',
                    unit_dimension: 'TIME',
                    unit_name_fr: 'Minutes',
                    unit_scale_to_canonical: 60,
                    minimum_minor: 600,
                }),
                schedule: {
                    uid: 's1',
                    habit_uid: 'h1',
                    schedule_mode: 'SELECTED_DAYS',
                    active_days: 'MONDAY,THURSDAY',
                    first_day_of_week: 'MONDAY',
                    effective_from: '2026-10-01',
                    interval_days: 2,
                },
            }),
            quick_values: [
                {
                    uid: 'q1',
                    habit_uid: 'h1',
                    label: '15',
                    amount_minor: 900,
                    sort_order: 0,
                },
            ],
            reminders: [
                {
                    uid: 'r1',
                    habit_uid: 'h1',
                    time: '07:30',
                    days_of_week: '',
                    enabled: true,
                    conditional: true,
                },
            ],
        } as unknown as CadenceHabitDetail;
        const draft = draftFromHabit(detail);
        expect(draft).toMatchObject({
            name: 'Courir',
            colorHex: '#15803d',
            kind: 'goal',
            goalType: 'DURATION',
            unitId: 'minutes',
            target: '30',
            minimum: '10',
            scheduleMode: 'SELECTED_DAYS',
            activeDays: ['MONDAY', 'THURSDAY'],
            quickValues: '15',
            reminderTimes: ['07:30'],
        });
    });
});

describe('abstinenceDays', () => {
    it('marks clear days, occurrences, pauses and days before the start', () => {
        const days = abstinenceDays({
            startsOn: '2026-10-02',
            today: '2026-10-06',
            span: 6,
            entries: [{ local_date: '2026-10-03' }],
            pauses: [{ start: '2026-10-04', end_exclusive: '2026-10-05' }],
        });
        expect(days.map((d) => [d.date, d.status])).toEqual([
            ['2026-10-01', 'UNOBSERVED'],
            ['2026-10-02', 'CLEAR'],
            ['2026-10-03', 'OCCURRENCE'],
            ['2026-10-04', 'PAUSED'],
            ['2026-10-05', 'CLEAR'],
            ['2026-10-06', 'TODAY_CLEAR'],
        ]);
    });
});
