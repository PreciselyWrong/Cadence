import { createFromDraft, updateFromDraft } from '../cadenceHabitSave';
import { draftFromHabit, emptyDraft, hexToArgb } from '../cadenceHabitUtils';
import * as service from '../cadenceHabitsService';
import {
    detail,
    minutesGoal,
    quick,
} from '../../components/Habits/__tests__/fixtures';

jest.mock('../cadenceHabitsService', () => ({
    ...jest.requireActual('../cadenceHabitsService'),
    createCadenceHabit: jest.fn(),
    updateCadenceHabit: jest.fn(),
    createRow: jest.fn(),
    updateRow: jest.fn(),
    deleteRow: jest.fn(),
    fetchCadenceHabit: jest.fn(),
}));

const api = service as jest.Mocked<typeof service>;

beforeEach(() => {
    jest.resetAllMocks();
    api.createCadenceHabit.mockResolvedValue(detail({ uid: 'new-habit' }));
    api.createRow.mockResolvedValue({});
    api.updateRow.mockResolvedValue({});
    api.deleteRow.mockResolvedValue({ deleted: true });
    api.updateCadenceHabit.mockResolvedValue(detail());
    api.fetchCadenceHabit.mockResolvedValue(detail());
});

describe('createFromDraft', () => {
    it('creates the habit with its first goal and schedule', async () => {
        await createFromDraft({
            ...emptyDraft(),
            name: ' Lire ',
            colorHex: '#15803d',
            groupUid: 'group-morning',
        });
        const body = api.createCadenceHabit.mock.calls[0][0];
        expect(body).toMatchObject({
            name: 'Lire',
            color_argb: hexToArgb('#15803d'),
            group_uid: 'group-morning',
            goal: {
                target_minor: 1,
                goal_type: 'BINARY',
                direction: 'AT_LEAST',
            },
            schedule: { schedule_mode: 'EVERY_DAY' },
        });
        expect(body.description).toBeNull();
        expect(api.createRow).not.toHaveBeenCalled();
    });

    it('adds the quick values and the reminders of the habit', async () => {
        await createFromDraft({
            ...emptyDraft(),
            name: 'Courir',
            kind: 'goal',
            goalType: 'DURATION',
            unitId: 'minutes',
            target: '30',
            quickValues: '10 20',
            reminderTimes: ['07:30'],
            conditionalReminders: false,
        });
        const calls = api.createRow.mock.calls.map(
            ([uid, collection, body]) => [uid, collection, body]
        );
        expect(calls).toEqual([
            [
                'new-habit',
                'quick-values',
                expect.objectContaining({ amount_minor: 600, sort_order: 0 }),
            ],
            [
                'new-habit',
                'quick-values',
                expect.objectContaining({ amount_minor: 1200, sort_order: 1 }),
            ],
            [
                'new-habit',
                'reminders',
                expect.objectContaining({
                    time: '07:30',
                    conditional: false,
                    enabled: true,
                }),
            ],
        ]);
    });

    it('marks the start of an abstinence and keeps its profile', async () => {
        await createFromDraft({
            ...emptyDraft(),
            name: 'Sans tabac',
            kind: 'abstinence',
            abstinenceProfile: 'SMOKING',
        });
        expect(api.createCadenceHabit.mock.calls[0][0]).toMatchObject({
            abstinence_profile: 'SMOKING',
            abstinence_started_at: expect.any(String),
            goal: { direction: 'AT_MOST', target_minor: 0 },
        });
    });
});

describe('updateFromDraft', () => {
    const current = detail({
        goal: minutesGoal(),
        goals: [minutesGoal({ uid: 'goal-1' })],
        schedule: {
            uid: 's1',
            habit_uid: 'h1',
            schedule_mode: 'EVERY_DAY',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
            first_day_of_week: 'MONDAY',
            effective_from: '2026-10-01',
            interval_days: 2,
        },
        quick_values: [quick('q1', 600), quick('q2', 900)],
        reminders: [
            {
                uid: 'r1',
                habit_uid: 'h1',
                time: '08:00',
                days_of_week: '',
                enabled: true,
                conditional: true,
            },
        ],
    });

    it('touches nothing when nothing changed', async () => {
        await updateFromDraft(current, draftFromHabit(current), {
            apply: 'new',
            from: '2026-10-05',
        });
        expect(api.updateCadenceHabit).not.toHaveBeenCalled();
        expect(api.createRow).not.toHaveBeenCalled();
        expect(api.updateRow).not.toHaveBeenCalled();
        expect(api.deleteRow).not.toHaveBeenCalled();
    });

    it('appends a goal version from a date instead of overwriting history', async () => {
        const draft = { ...draftFromHabit(current), target: '45' };
        await updateFromDraft(current, draft, {
            apply: 'new',
            from: '2026-10-05',
        });
        expect(api.createRow).toHaveBeenCalledWith(
            'h1',
            'goals',
            expect.objectContaining({
                target_minor: 2700,
                effective_from: '2026-10-05',
            })
        );
        expect(api.updateRow).not.toHaveBeenCalled();
    });

    it('corrects the current version when asked to', async () => {
        const draft = { ...draftFromHabit(current), target: '45' };
        await updateFromDraft(current, draft, {
            apply: 'fix',
            from: '2026-10-05',
        });
        expect(api.updateRow).toHaveBeenCalledWith(
            'h1',
            'goals',
            'goal-1',
            expect.objectContaining({ target_minor: 2700 })
        );
        const body = api.updateRow.mock.calls[0][3] as Record<string, unknown>;
        expect(body).not.toHaveProperty('effective_from');
    });

    it('versions the schedule as well', async () => {
        const draft = {
            ...draftFromHabit(current),
            scheduleMode: 'SELECTED_DAYS' as const,
            activeDays: ['MONDAY' as const, 'FRIDAY' as const],
        };
        await updateFromDraft(current, draft, {
            apply: 'new',
            from: '2026-10-05',
        });
        expect(api.createRow).toHaveBeenCalledWith(
            'h1',
            'schedules',
            expect.objectContaining({
                schedule_mode: 'SELECTED_DAYS',
                active_days: 'MONDAY,FRIDAY',
                effective_from: '2026-10-05',
            })
        );
    });

    it('patches only the changed habit fields', async () => {
        const draft = {
            ...draftFromHabit(current),
            name: 'Courir plus',
            colorHex: '#b91c1c',
        };
        await updateFromDraft(current, draft, {
            apply: 'new',
            from: '2026-10-05',
        });
        expect(api.updateCadenceHabit).toHaveBeenCalledWith('h1', {
            name: 'Courir plus',
            color_argb: hexToArgb('#b91c1c'),
        });
    });

    it('replaces quick values and reminders by what was typed', async () => {
        const draft = {
            ...draftFromHabit(current),
            quickValues: '10 30',
            reminderTimes: ['08:00', '19:00'],
        };
        await updateFromDraft(current, draft, {
            apply: 'new',
            from: '2026-10-05',
        });
        expect(api.deleteRow).toHaveBeenCalledWith('h1', 'quick-values', 'q2');
        expect(api.createRow).toHaveBeenCalledWith(
            'h1',
            'quick-values',
            expect.objectContaining({ amount_minor: 1800 })
        );
        expect(api.createRow).toHaveBeenCalledWith(
            'h1',
            'reminders',
            expect.objectContaining({ time: '19:00' })
        );
        expect(api.deleteRow).not.toHaveBeenCalledWith('h1', 'reminders', 'r1');
    });
});
