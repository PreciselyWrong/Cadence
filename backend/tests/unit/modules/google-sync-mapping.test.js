const moment = require('moment-timezone');
const {
    taskEventTimes,
    toGoogleTask,
    fromGoogleTask,
    fromGoogleEvent,
    hash,
    localTaskProjection,
} = require('../../../modules/google-sync/mapping');

const TZ = 'Europe/Zurich';
const endOfDay = (day) => moment.tz(day, TZ).endOf('day').toDate();
const at = (value) => moment.tz(value, 'YYYY-MM-DD HH:mm', TZ).toDate();

describe('google-sync mapping', () => {
    it('places a timed task at its due time for its estimate', () => {
        const times = taskEventTimes(
            {
                due_date: at('2026-11-02 14:00'),
                due_has_time: true,
                estimated_minutes: 45,
            },
            TZ
        );
        expect(times.allDay).toBe(false);
        expect(moment(times.end).diff(times.start, 'minutes')).toBe(45);
    });

    it('spans whole days from a whole-day start to the due day', () => {
        const times = taskEventTimes(
            {
                due_date: endOfDay('2026-11-04'),
                due_has_time: false,
                start_date: moment.tz('2026-11-02', TZ).startOf('day').toDate(),
            },
            TZ
        );
        expect(times).toMatchObject({
            allDay: true,
            start: '2026-11-02',
            end: '2026-11-05',
        });
    });

    it('sends only the day of a due date to Google Tasks', () => {
        const body = toGoogleTask(
            {
                name: ' Buy ',
                note: null,
                status: 0,
                due_date: at('2026-11-02 23:30'),
                due_has_time: true,
            },
            TZ
        );
        expect(body).toMatchObject({
            title: 'Buy',
            status: 'needsAction',
            due: '2026-11-02T00:00:00.000Z',
        });
    });

    it('keeps the Tududi time when Google keeps the same day', () => {
        const task = {
            name: 'A',
            note: '',
            status: 0,
            due_date: at('2026-11-02 16:00'),
            due_has_time: true,
        };
        const { attrs, completion } = fromGoogleTask(
            {
                title: 'A',
                due: '2026-11-02T00:00:00.000Z',
                status: 'needsAction',
            },
            task,
            TZ
        );
        expect(attrs).toEqual({});
        expect(completion).toBeNull();
    });

    it('asks to complete or reopen from the Google status', () => {
        const open = { name: 'A', status: 0 };
        const done = { name: 'A', status: 2 };
        expect(
            fromGoogleTask({ title: 'A', status: 'completed' }, open, TZ)
                .completion
        ).toBe('complete');
        expect(
            fromGoogleTask({ title: 'A', status: 'needsAction' }, done, TZ)
                .completion
        ).toBe('reopen');
    });

    it('turns an all-day event back into a whole-day due', () => {
        const attrs = fromGoogleEvent(
            {
                summary: 'X',
                start: { date: '2026-11-03' },
                end: { date: '2026-11-04' },
            },
            { name: 'X', due_date: at('2026-11-02 09:00'), due_has_time: true },
            TZ
        );
        expect(attrs.due_has_time).toBe(false);
        expect(moment(attrs.due_date).tz(TZ).format('YYYY-MM-DD')).toBe(
            '2026-11-03'
        );
    });

    it('moves start and due together for a start-to-due task', () => {
        const task = {
            name: 'X',
            start_date: at('2026-11-02 09:00'),
            start_has_time: true,
            due_date: at('2026-11-02 11:00'),
            due_has_time: true,
        };
        const attrs = fromGoogleEvent(
            {
                summary: 'X',
                start: { dateTime: at('2026-11-03 10:00').toISOString() },
                end: { dateTime: at('2026-11-03 13:00').toISOString() },
            },
            task,
            TZ
        );
        expect(attrs.start_date.toISOString()).toBe(
            at('2026-11-03 10:00').toISOString()
        );
        expect(attrs.due_date.toISOString()).toBe(
            at('2026-11-03 13:00').toISOString()
        );
        expect(attrs.estimated_minutes).toBeUndefined();
    });

    it('hashes only the synced fields', () => {
        const a = { name: 'A', note: 'n', status: 0, priority: 0 };
        const b = { ...a, priority: 2 };
        expect(hash(localTaskProjection(a, TZ))).toBe(
            hash(localTaskProjection(b, TZ))
        );
    });
});
