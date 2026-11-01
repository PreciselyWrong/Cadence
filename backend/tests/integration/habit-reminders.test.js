const request = require('supertest');
const app = require('../../app');
const { Notification, User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const {
    checkHabitReminders,
} = require('../../modules/habits/cadence/reminderService');
const taskScheduler = require('../../modules/tasks/taskScheduler');

// 2026-11-02 is a Monday; Zurich is on CET (UTC+1) then.
const at = (hhmm, date = '2026-11-02') => new Date(`${date}T${hhmm}:30.000Z`);
// 08:30 in Zurich.
const MORNING = at('07:30');

describe('Server-side habit reminders', () => {
    let agent;
    let user;

    beforeEach(async () => {
        const email = 'habit-reminders@example.com';
        user = await createTestUser({ email });
        await User.update(
            { timezone: 'Europe/Zurich' },
            { where: { id: user.id } }
        );
        agent = request.agent(app);
        await agent.post('/api/login').send({ email, password: 'password123' });
    });

    const createHabit = async (uid = 'rem-habit-0001', extra = {}) => {
        const res = await agent.post('/api/cadence/habits').send({
            uid,
            name: 'Stretch',
            starts_on: '2026-10-01',
            goal: { target_minor: 1, period: 'DAY', goal_type: 'BINARY' },
            schedule: { schedule_mode: 'EVERY_DAY' },
            ...extra,
        });
        expect(res.status).toBe(201);
        return uid;
    };

    const addReminder = async (habitUid, extra = {}) => {
        const res = await agent
            .post(`/api/cadence/habits/${habitUid}/reminders`)
            .send({
                time: '08:30',
                days_of_week: '',
                enabled: true,
                conditional: true,
                ...extra,
            });
        expect(res.status).toBe(201);
        return res.body.uid;
    };

    const rows = () =>
        Notification.findAll({
            where: { user_id: user.id },
            order: [['id', 'ASC']],
        });

    const logEntry = (habitUid, date) =>
        agent.post(`/api/cadence/habits/${habitUid}/entries`).send({
            local_date: date,
            value_minor: 1,
            observed_zone_id: 'Europe/Zurich',
        });

    it('rings an unread in-app reminder at the local time, with neutral wording', async () => {
        const habit = await createHabit();
        const reminder = await addReminder(habit);

        const result = await checkHabitReminders(MORNING);

        expect(result.remindersSent).toBe(1);
        const [row] = await rows();
        expect(row.type).toBe('reminder');
        expect(row.message).toBe('Rappel : Stretch');
        expect(row.read_at).toBeNull();
        expect(row.sources).toEqual([]);
        expect(row.data).toMatchObject({
            reason: 'habit_reminder',
            habitUid: habit,
            reminderUid: reminder,
            date: '2026-11-02',
        });
    });

    it('sends each reminder once per day, again the next day', async () => {
        const habit = await createHabit();
        await addReminder(habit);

        await checkHabitReminders(MORNING);
        await checkHabitReminders(at('07:35'));
        expect(await rows()).toHaveLength(1);

        await checkHabitReminders(at('07:30', '2026-11-03'));
        expect(await rows()).toHaveLength(2);
    });

    it('waits for the time and gives up on one missed for long', async () => {
        const habit = await createHabit();
        await addReminder(habit);

        await checkHabitReminders(at('07:29'));
        expect(await rows()).toHaveLength(0);

        await checkHabitReminders(at('07:50'));
        expect(await rows()).toHaveLength(0);

        await checkHabitReminders(at('07:38'));
        expect(await rows()).toHaveLength(1);
    });

    it('reads the time in the timezone of the user', async () => {
        await User.update(
            { timezone: 'Pacific/Auckland' },
            { where: { id: user.id } }
        );
        const habit = await createHabit();
        await addReminder(habit, { time: '20:30' });

        // 08:30 in Zurich is 20:30 in Auckland (NZDT, UTC+13).
        expect((await checkHabitReminders(MORNING)).remindersSent).toBe(1);
        const [row] = await rows();
        expect(row.data.date).toBe('2026-11-02');
    });

    it('skips a day the reminder is not set for', async () => {
        const habit = await createHabit();
        await addReminder(habit, { days_of_week: 'TUESDAY,WEDNESDAY' });

        await checkHabitReminders(MORNING);
        expect(await rows()).toHaveLength(0);

        await checkHabitReminders(at('07:30', '2026-11-03'));
        expect(await rows()).toHaveLength(1);
    });

    it('skips a day the habit is not planned', async () => {
        const habit = await createHabit('rem-mondays-001', {
            schedule: {
                schedule_mode: 'SELECTED_DAYS',
                active_days: 'FRIDAY',
            },
        });
        await addReminder(habit);

        await checkHabitReminders(MORNING);
        expect(await rows()).toHaveLength(0);
    });

    it('stays silent while the habit is paused', async () => {
        const habit = await createHabit();
        await addReminder(habit);
        const pause = await agent
            .post(`/api/cadence/habits/${habit}/pauses`)
            .send({
                start: '2026-11-01',
                end_exclusive: '2026-11-04',
                reason: 'REST',
            });
        expect(pause.status).toBe(201);

        await checkHabitReminders(MORNING);
        expect(await rows()).toHaveLength(0);
    });

    it('stays silent when the goal is already met, unless the reminder is not conditional', async () => {
        const habit = await createHabit();
        const conditional = await addReminder(habit);
        await logEntry(habit, '2026-11-02');

        await checkHabitReminders(MORNING);
        expect(await rows()).toHaveLength(0);

        await agent
            .patch(`/api/cadence/habits/${habit}/reminders/${conditional}`)
            .send({ conditional: false });
        await checkHabitReminders(MORNING);
        expect(await rows()).toHaveLength(1);
    });

    it('ignores disabled reminders, archived and inactive habits', async () => {
        const off = await createHabit('rem-off-000001');
        await addReminder(off, { enabled: false });
        const archived = await createHabit('rem-archived-01');
        await addReminder(archived);
        await agent
            .patch(`/api/cadence/habits/${archived}`)
            .send({ archived: true });
        const inactive = await createHabit('rem-inactive-01');
        await addReminder(inactive);
        await agent
            .patch(`/api/cadence/habits/${inactive}`)
            .send({ active: false });

        const result = await checkHabitReminders(MORNING);

        expect(result.remindersSent).toBe(0);
        expect(await rows()).toHaveLength(0);
    });

    describe('delivery', () => {
        const setPrefs = (habitReminders) =>
            User.update(
                { notification_preferences: { habitReminders } },
                { where: { id: user.id } }
            );

        it('is in-app only by default: the phone rings locally', async () => {
            const habit = await createHabit();
            await addReminder(habit);

            await checkHabitReminders(MORNING);

            const [row] = await rows();
            expect(row.sources).toEqual([]);
        });

        it('routes to the channels the user chose', async () => {
            await setPrefs({ inApp: true, push: true, desktop: true });
            const habit = await createHabit();
            await addReminder(habit);

            await checkHabitReminders(MORNING);

            const [row] = await rows();
            expect(row.sources.sort()).toEqual(['desktop', 'push']);
            expect(row.read_at).toBeNull();
        });

        it('stores a read row when only an external channel is on', async () => {
            await setPrefs({ inApp: false, push: true });
            const habit = await createHabit();
            await addReminder(habit);

            await checkHabitReminders(MORNING);

            const [row] = await rows();
            expect(row.sources).toEqual(['push']);
            expect(row.read_at).not.toBeNull();
        });

        it('sends nothing when every channel is off', async () => {
            await setPrefs({ inApp: false });
            const habit = await createHabit();
            await addReminder(habit);

            const result = await checkHabitReminders(MORNING);

            expect(result.remindersSent).toBe(0);
            expect(await rows()).toHaveLength(0);
        });

        it('holds external delivery during quiet hours', async () => {
            await setPrefs({ inApp: true, push: true });
            await User.update(
                {
                    quiet_hours: {
                        enabled: true,
                        start: '00:00',
                        end: '23:59',
                    },
                },
                { where: { id: user.id } }
            );
            const habit = await createHabit();
            await addReminder(habit);

            await checkHabitReminders(MORNING);

            const [row] = await rows();
            expect(row.deliver_after).not.toBeNull();
            expect(row.read_at).toBeNull();
        });
    });

    it('runs from the scheduler every minute', () => {
        expect(taskScheduler._getCronExpression('habit_reminders')).toBe(
            '* * * * *'
        );
    });
});
