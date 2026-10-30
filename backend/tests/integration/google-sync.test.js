const request = require('supertest');
const moment = require('moment-timezone');
const app = require('../../app');
const {
    Task,
    Project,
    GoogleAccount,
    GoogleCalendar,
    GoogleTaskLink,
} = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const { createFakeGoogle } = require('../helpers/fakeGoogle');
const client = require('../../modules/google-sync/client');
const { syncUser } = require('../../modules/google-sync/syncEngine');
const calendarFeedsService = require('../../modules/calendar-feeds/service');

const TZ = 'Europe/Zurich';

describe('Google sync', () => {
    let agent, user, google, previous;

    beforeAll(() => {
        previous = { ...process.env };
        process.env.TUDUDI_SESSION_SECRET = 'google-sync-test-secret';
        process.env.GOOGLE_CLIENT_ID = 'client-id';
        process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    });

    afterAll(() => {
        for (const key of [
            'TUDUDI_SESSION_SECRET',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
        ]) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
        client.setFetch(null);
    });

    beforeEach(async () => {
        google = createFakeGoogle();
        google.addCalendar({
            id: 'me@gmail.com',
            summary: 'Me',
            primary: true,
            backgroundColor: '#039be5',
        });
        google.addCalendar({
            id: 'holidays',
            summary: 'Holidays',
            accessRole: 'reader',
        });
        google.addList('My Tasks');
        client.setFetch(google.fetch);

        user = await createTestUser({ email: 'g@example.com', timezone: TZ });
        agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ email: 'g@example.com', password: 'password123' });
    });

    async function connect() {
        const start = await agent
            .get('/api/google/connect')
            .query({ origin: 'https://tududi.example' });
        expect(start.status).toBe(200);
        const state = new URL(start.body.url).searchParams.get('state');
        expect(new URL(start.body.url).searchParams.get('redirect_uri')).toBe(
            'https://tududi.example/api/google/oauth/callback'
        );
        const back = await agent
            .get('/api/google/oauth/callback')
            .query({ code: 'abc', state });
        expect(back.status).toBe(302);
        expect(back.headers.location).toBe(
            'https://tududi.example/calendar?google=connected'
        );
        await syncUser(user.id);
    }

    const day = (offset = 1) =>
        moment.tz(TZ).add(offset, 'day').format('YYYY-MM-DD');
    const tududiCalendar = () => {
        const entry = [...google.state.calendars.values()].find(
            (c) => c.meta.summary === 'Cadence'
        );
        return entry;
    };
    const liveEvents = (calendar) =>
        [...calendar.events.values()].filter((e) => e.status !== 'cancelled');
    const liveTasks = (listId) =>
        [...google.state.lists.get(listId).tasks.values()].filter(
            (t) => !t.deleted
        );

    async function createTask(body) {
        const res = await agent.post('/api/task').send(body);
        expect(res.status).toBe(201);
        return Task.findOne({ where: { uid: res.body.uid } });
    }

    it('connects, stores tokens encrypted and lists calendars', async () => {
        await connect();
        const account = await GoogleAccount.findOne({
            where: { user_id: user.id },
        });
        expect(account.email).toBe('me@gmail.com');
        expect(account.refresh_token_encrypted.startsWith('enc:v1:')).toBe(
            true
        );

        const res = await agent.get('/api/google');
        expect(res.body.connected).toBe(true);
        expect(JSON.stringify(res.body)).not.toContain('refresh-1');
        const names = res.body.calendars.map((c) => c.name).sort();
        expect(names).toEqual(['Cadence', 'Holidays', 'Me']);
        expect(
            res.body.calendars.find((c) => c.name === 'Holidays').writable
        ).toBe(false);
        expect(
            res.body.calendars.find((c) => c.name === 'Cadence').is_tududi
        ).toBe(true);
    });

    it('rejects a callback with a wrong state', async () => {
        const res = await agent
            .get('/api/google/oauth/callback')
            .query({ code: 'x', state: 'nope' });
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('google=error');
        expect(await GoogleAccount.count()).toBe(0);
    });

    describe('Cadence calendar', () => {
        it('puts dated open tasks on it, timed and all-day', async () => {
            await createTask({ name: 'Undated' });
            await createTask({ name: 'All day', due_date: day(1) });
            await createTask({
                name: 'Timed',
                due_date: day(2),
                due_time: '14:30',
                estimated_minutes: 30,
            });
            await connect();

            const events = liveEvents(tududiCalendar());
            expect(events.map((e) => e.summary).sort()).toEqual([
                'All day',
                'Timed',
            ]);
            const allDay = events.find((e) => e.summary === 'All day');
            expect(allDay.start.date).toBe(day(1));
            expect(allDay.end.date).toBe(day(2));
            const timed = events.find((e) => e.summary === 'Timed');
            expect(
                moment(timed.start.dateTime).tz(TZ).format('YYYY-MM-DD HH:mm')
            ).toBe(`${day(2)} 14:30`);
            expect(
                moment(timed.end.dateTime).diff(
                    moment(timed.start.dateTime),
                    'minutes'
                )
            ).toBe(30);
        });

        it('follows an event moved or renamed in Google', async () => {
            const task = await createTask({
                name: 'Call',
                due_date: day(1),
                due_time: '09:00',
            });
            await connect();
            const calendar = tududiCalendar();
            const event = liveEvents(calendar)[0];
            const start = moment.tz(`${day(3)} 11:00`, TZ);
            event.summary = 'Call bank';
            event.start = { dateTime: start.toISOString() };
            event.end = {
                dateTime: start.clone().add(90, 'minutes').toISOString(),
            };
            google.touchEvent(calendar, event);

            await syncUser(user.id);
            await task.reload();
            expect(task.name).toBe('Call bank');
            expect(task.due_has_time).toBe(true);
            expect(
                moment(task.due_date).tz(TZ).format('YYYY-MM-DD HH:mm')
            ).toBe(`${day(3)} 11:00`);
            expect(task.estimated_minutes).toBe(90);
        });

        it('takes the date off a task whose event is deleted in Google', async () => {
            const task = await createTask({
                name: 'Dentist',
                due_date: day(1),
            });
            await connect();
            const calendar = tududiCalendar();
            const event = liveEvents(calendar)[0];
            event.status = 'cancelled';
            google.touchEvent(calendar, event);

            await syncUser(user.id);
            await task.reload();
            expect(task.due_date).toBeNull();
            expect(await Task.count({ where: { id: task.id } })).toBe(1);
        });

        it('removes the event of a completed task', async () => {
            const task = await createTask({ name: 'Pay', due_date: day(1) });
            await connect();
            expect(liveEvents(tududiCalendar())).toHaveLength(1);
            await agent.patch(`/api/task/${task.uid}`).send({ status: 'done' });
            await syncUser(user.id);
            expect(liveEvents(tududiCalendar())).toHaveLength(0);
        });

        it('moves the event when the task moves in Cadence', async () => {
            const task = await createTask({ name: 'Gym', due_date: day(1) });
            await connect();
            await agent
                .patch(`/api/task/${task.uid}`)
                .send({ due_date: day(4) });
            await syncUser(user.id);
            const [event] = liveEvents(tududiCalendar());
            expect(event.start.date).toBe(day(4));
        });

        it('turns an event added to the Cadence calendar into a task', async () => {
            await connect();
            const calendar = tududiCalendar();
            google.putEvent(calendar.meta.id, {
                summary: 'From phone',
                start: { date: day(2) },
                end: { date: day(3) },
            });
            await syncUser(user.id);
            const task = await Task.findOne({ where: { name: 'From phone' } });
            expect(task).not.toBeNull();
            expect(moment(task.due_date).tz(TZ).format('YYYY-MM-DD')).toBe(
                day(2)
            );
            await syncUser(user.id);
            expect(liveEvents(calendar)).toHaveLength(1);
        });
    });

    describe('other calendars', () => {
        it('shows their events, hides a calendar, and edits from Cadence', async () => {
            const start = moment.tz(`${day(1)} 10:00`, TZ);
            google.putEvent('me@gmail.com', {
                summary: 'Meeting',
                start: { dateTime: start.toISOString() },
                end: { dateTime: start.clone().add(1, 'hour').toISOString() },
            });
            google.putEvent('holidays', {
                summary: 'Holiday',
                start: { date: day(2) },
                end: { date: day(3) },
            });
            await connect();

            const range = () =>
                agent
                    .get('/api/calendar-feeds/events')
                    .query({ start: day(0), end: day(5) });
            let res = await range();
            expect(res.status).toBe(200);
            const meeting = res.body.events.find((e) => e.title === 'Meeting');
            expect(meeting.start_minute).toBe(600);
            expect(meeting.editable).toBe(true);
            expect(
                res.body.events.find((e) => e.title === 'Holiday').editable
            ).toBe(false);

            const holidays = await GoogleCalendar.findOne({
                where: { google_id: 'holidays' },
            });
            await agent
                .patch(`/api/google/calendars/${holidays.uid}`)
                .send({ show_on_calendar: false });
            // Today and the planner leave a hidden calendar out.
            const dayView = await calendarFeedsService.eventsForDay(
                user,
                day(2)
            );
            expect(
                dayView.events.find((e) => e.title === 'Holiday')
            ).toBeUndefined();
            expect(dayView.events).toHaveLength(0);

            const me = await GoogleCalendar.findOne({
                where: { google_id: 'me@gmail.com' },
            });
            const moved = moment.tz(`${day(1)} 15:00`, TZ);
            res = await agent
                .patch(`/api/google/events/${me.uid}/${meeting.event_id}`)
                .send({
                    start: moved.toISOString(),
                    end: moved.clone().add(30, 'minutes').toISOString(),
                });
            expect(res.status).toBe(200);
            const stored = google.state.calendars
                .get('me@gmail.com')
                .events.get(meeting.event_id);
            expect(stored.start.dateTime).toBe(moved.toISOString());

            res = await agent.post('/api/google/events').send({
                calendar_uid: me.uid,
                title: 'Lunch',
                start: moved.clone().add(1, 'day').toISOString(),
                end: moved.clone().add(1, 'day').add(1, 'hour').toISOString(),
            });
            expect(res.status).toBe(201);
            res = await range();
            expect(res.body.events.map((e) => e.title)).toContain('Lunch');

            res = await agent.post('/api/google/events').send({
                calendar_uid: holidays.uid,
                title: 'Nope',
                all_day: true,
                start_date: day(1),
            });
            expect(res.status).toBe(400);

            res = await agent.delete(
                `/api/google/events/${me.uid}/${meeting.event_id}`
            );
            expect(res.status).toBe(204);
            expect(stored.status).toBe('cancelled');
        });

        it('picks up changes made in Google on the next sync', async () => {
            await connect();
            const start = moment.tz(`${day(1)} 08:00`, TZ);
            google.putEvent('me@gmail.com', {
                summary: 'Later',
                start: { dateTime: start.toISOString() },
                end: { dateTime: start.clone().add(1, 'hour').toISOString() },
            });
            await syncUser(user.id);
            const res = await agent
                .get('/api/calendar-feeds/events')
                .query({ start: day(0), end: day(2) });
            expect(res.body.events.map((e) => e.title)).toContain('Later');
        });
    });

    describe('Google Tasks', () => {
        const defaultList = () => google.state.defaultListId;

        it('sends tasks to the default list and project tasks to their own list', async () => {
            const project = await Project.create({
                user_id: user.id,
                name: 'House',
            });
            await createTask({ name: 'Inbox thing', note: 'details' });
            await createTask({
                name: 'Paint',
                project_id: project.id,
                due_date: day(1),
            });
            await connect();

            const inbox = liveTasks(defaultList());
            expect(inbox.map((t) => t.title)).toEqual(['Inbox thing']);
            expect(inbox[0].notes).toBe('details');
            const house = [...google.state.lists.values()].find(
                (l) => l.title === 'House'
            );
            const [paint] = liveTasks(house.id);
            expect(paint.title).toBe('Paint');
            expect(paint.due).toBe(`${day(1)}T00:00:00.000Z`);
        });

        it('imports new Google tasks and lists', async () => {
            await connect();
            google.putTask(defaultList(), { title: 'Milk', notes: '2 litres' });
            const work = google.addList('Work');
            google.putTask(work, {
                title: 'Report',
                due: `${day(2)}T00:00:00.000Z`,
            });
            await syncUser(user.id);

            const milk = await Task.findOne({ where: { name: 'Milk' } });
            expect(milk.note).toBe('2 litres');
            expect(milk.project_id).toBeNull();
            const report = await Task.findOne({ where: { name: 'Report' } });
            const workProject = await Project.findOne({
                where: { name: 'Work' },
            });
            expect(report.project_id).toBe(workProject.id);
            expect(moment(report.due_date).tz(TZ).format('YYYY-MM-DD')).toBe(
                day(2)
            );
            // Not sent back as a second copy.
            await syncUser(user.id);
            expect(liveTasks(defaultList())).toHaveLength(1);
        });

        it('completes, reopens and deletes in both directions', async () => {
            const task = await createTask({ name: 'Both ways' });
            await connect();
            const [remote] = liveTasks(defaultList());

            google.putTask(defaultList(), {
                ...remote,
                status: 'completed',
                completed: new Date().toISOString(),
            });
            await syncUser(user.id);
            await task.reload();
            expect(task.status).toBe(Task.STATUS.DONE);

            await agent
                .patch(`/api/task/${task.uid}`)
                .send({ status: 'not_started' });
            await syncUser(user.id);
            expect(liveTasks(defaultList())[0].status).toBe('needsAction');

            await agent.delete(`/api/task/${task.uid}`);
            await syncUser(user.id);
            expect(liveTasks(defaultList())).toHaveLength(0);

            const other = await createTask({ name: 'Gone on Google' });
            await syncUser(user.id);
            const copy = liveTasks(defaultList()).find(
                (t) => t.title === 'Gone on Google'
            );
            google.putTask(defaultList(), { ...copy, deleted: true });
            await syncUser(user.id);
            expect(await Task.count({ where: { id: other.id } })).toBe(0);
        });

        it('advances a recurring task completed in Google and reopens it there', async () => {
            const task = await createTask({
                name: 'Water plants',
                due_date: day(0),
                recurrence_type: 'daily',
            });
            await connect();
            const [remote] = liveTasks(defaultList());
            expect(remote.due).toBe(`${day(0)}T00:00:00.000Z`);

            google.putTask(defaultList(), { ...remote, status: 'completed' });
            await syncUser(user.id);
            await task.reload();
            expect(task.status).toBe(Task.STATUS.NOT_STARTED);
            expect(moment(task.due_date).tz(TZ).format('YYYY-MM-DD')).toBe(
                day(1)
            );
            const [after] = liveTasks(defaultList());
            expect(after.status).toBe('needsAction');
            expect(after.due).toBe(`${day(1)}T00:00:00.000Z`);
        });

        it('keeps a subtask under its parent', async () => {
            const parent = await createTask({ name: 'Trip' });
            const child = await createTask({
                name: 'Passport',
                parent_task_id: parent.id,
            });
            expect(child.parent_task_id).toBe(parent.id);
            await connect();
            const tasks = liveTasks(defaultList());
            const trip = tasks.find((t) => t.title === 'Trip');
            expect(tasks.find((t) => t.title === 'Passport').parent).toBe(
                trip.id
            );
        });

        it('keeps the Cadence time when Google keeps the same day', async () => {
            const task = await createTask({
                name: 'Timed',
                due_date: day(1),
                due_time: '16:00',
            });
            await connect();
            const remote = liveTasks(defaultList())[0];
            google.putTask(defaultList(), {
                ...remote,
                title: 'Timed renamed',
            });
            await syncUser(user.id);
            await task.reload();
            expect(task.name).toBe('Timed renamed');
            expect(task.due_has_time).toBe(true);
        });
    });

    it('retries after a rate limit', async () => {
        client.setFetch(
            (() => {
                let limited = 2;
                return (url, options) => {
                    if (limited > 0 && url.includes('/calendarList')) {
                        limited -= 1;
                        return Promise.resolve({
                            ok: false,
                            status: 429,
                            text: async () =>
                                '{"error":{"message":"slow down"}}',
                        });
                    }
                    return google.fetch(url, options);
                };
            })(),
            { retryBaseMs: 1 }
        );
        await connect();
        const res = await agent.get('/api/google');
        expect(res.body.last_error).toBeNull();
        expect(res.body.calendars.length).toBe(3);
    });

    it('skips an item Google refuses and syncs the rest', async () => {
        await createTask({ name: 'Fine' });
        await createTask({ name: 'Refused' });
        client.setFetch((url, options) => {
            if (
                options?.method === 'POST' &&
                url.includes('/tasks') &&
                String(options.body).includes('Refused')
            ) {
                return Promise.resolve({
                    ok: false,
                    status: 400,
                    text: async () => '{"error":{"message":"Invalid value"}}',
                });
            }
            return google.fetch(url, options);
        });
        await connect();
        expect(
            liveTasks(google.state.defaultListId).map((t) => t.title)
        ).toEqual(['Fine']);
        const res = await agent.get('/api/google');
        expect(res.body.last_error).toMatch(
            /1 item\(s\) could not sync: Invalid value/
        );

        client.setFetch(google.fetch);
        await syncUser(user.id);
        expect(
            liveTasks(google.state.defaultListId)
                .map((t) => t.title)
                .sort()
        ).toEqual(['Fine', 'Refused']);
    });

    it('hides Google events when calendar sync is off', async () => {
        const start = moment.tz(`${day(1)} 10:00`, TZ);
        google.putEvent('me@gmail.com', {
            summary: 'Meeting',
            start: { dateTime: start.toISOString() },
            end: { dateTime: start.clone().add(1, 'hour').toISOString() },
        });
        await connect();
        await agent.patch('/api/google/settings').send({ sync_events: false });
        const res = await agent
            .get('/api/calendar-feeds/events')
            .query({ start: day(0), end: day(2) });
        expect(
            res.body.events.find((e) => e.title === 'Meeting')
        ).toBeUndefined();
        expect(await GoogleTaskLink.count({ where: { kind: 'event' } })).toBe(
            0
        );
    });

    it('reports a revoked Google access', async () => {
        await connect();
        const account = await GoogleAccount.findOne({
            where: { user_id: user.id },
        });
        await account.update({ access_token_expires_at: new Date(0) });
        google.state.tokenRevoked = true;
        await expect(syncUser(user.id)).rejects.toThrow(/revoked/);
        const res = await agent.get('/api/google');
        expect(res.body.last_error).toMatch(/Connect Google again/);
    });

    it('disconnects and keeps the tasks', async () => {
        await createTask({ name: 'Stays', due_date: day(1) });
        await connect();
        const res = await agent.delete('/api/google');
        expect(res.status).toBe(204);
        expect(await GoogleAccount.count()).toBe(0);
        expect(await GoogleTaskLink.count()).toBe(0);
        expect(await Task.count({ where: { name: 'Stays' } })).toBe(1);
    });
});
