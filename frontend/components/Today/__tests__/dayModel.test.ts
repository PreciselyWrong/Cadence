import {
    applyOpsLocally,
    reflowSlots,
    coveredMinutes,
    dayLines,
    daySummary,
    visibleLines,
} from '../dayModel';
import type { DailyPlanItem } from '../../../utils/dailyPlanService';
import type { Task } from '../../../entities/Task';

const DATE = '2026-11-12';

const task = (uid: string, extra: Partial<Task> = {}): Task =>
    ({
        uid,
        name: uid,
        status: 'not_started',
        completed_at: null,
        ...extra,
    }) as Task;

const item = (
    uid: string,
    position: number,
    start: number | null,
    duration = 30,
    extra: Partial<Task> = {}
): DailyPlanItem => ({
    task_uid: uid,
    task: task(uid, extra),
    position,
    start_minute: start,
    duration_minutes: duration,
});

describe('dayLines', () => {
    it('puts each task once: a planned task due today is not repeated', () => {
        const lines = dayLines(
            [item('a', 0, null)],
            [task('a', { due_date: DATE }), task('b', { due_date: DATE })],
            DATE
        );
        expect(lines.anytime.map((l) => l.uid)).toEqual(['a', 'b']);
        expect(lines.anytime[0].planned).toBe(true);
        expect(lines.anytime[1].planned).toBe(false);
    });

    it('sorts by slot or due time, untimed lines keep the plan order', () => {
        const lines = dayLines(
            [
                item('late', 0, 14 * 60),
                item('x', 1, null),
                item('early', 2, 9 * 60),
                item('y', 3, null),
            ],
            [task('meet', { due_date: DATE, due_time: '11:00' })],
            DATE
        );
        expect(lines.timed.map((l) => l.uid)).toEqual([
            'early',
            'meet',
            'late',
        ]);
        expect(lines.anytime.map((l) => l.uid)).toEqual(['x', 'y']);
        expect(lines.timed[1].start).toBeNull();
        expect(lines.timed[1].dueMinute).toBe(660);
    });

    it('a due time on another day is not a time of this day', () => {
        const lines = dayLines(
            [
                item('a', 0, null, 30, {
                    due_date: '2026-11-20',
                    due_time: '10:00',
                }),
            ],
            [],
            DATE
        );
        expect(lines.anytime[0].dueMinute).toBeNull();
    });

    it('done lines go apart, recurring occurrences included', () => {
        const done = item('d', 0, 600);
        done.occurrence_done = true;
        const lines = dayLines([done, item('o', 1, null)], [], DATE);
        expect(lines.done.map((l) => l.uid)).toEqual(['d']);
        expect(lines.timed).toHaveLength(0);
    });

    it('marks a guessed duration as unknown', () => {
        const lines = dayLines([], [task('b', { due_date: DATE })], DATE);
        expect(lines.anytime[0].duration).toBe(30);
        expect(lines.anytime[0].durationKnown).toBe(false);
    });
});

describe('applyOpsLocally', () => {
    const tasks = new Map([['n', task('n', { estimated_minutes: 45 })]]);
    const base = [item('a', 0, null), item('b', 1, 600)];

    it('adds with the estimate and never duplicates', () => {
        const next = applyOpsLocally(
            base,
            [{ op: 'add', task_uid: 'n' }],
            tasks
        );
        expect(
            next.map((i) => [i.task_uid, i.position, i.duration_minutes])
        ).toEqual([
            ['a', 0, 30],
            ['b', 1, 30],
            ['n', 2, 45],
        ]);
        const again = applyOpsLocally(
            next,
            [{ op: 'add', task_uid: 'n', start_minute: 540 }],
            tasks
        );
        expect(again).toHaveLength(3);
        expect(again[2].start_minute).toBe(540);
    });

    it('slots a task not yet in the plan (drop from the list)', () => {
        const next = applyOpsLocally(
            base,
            [{ op: 'slot', task_uid: 'n', start_minute: 900 }],
            tasks
        );
        expect(next[2]).toMatchObject({
            task_uid: 'n',
            start_minute: 900,
            duration_minutes: 45,
        });
    });

    it('unslot keeps the line, remove drops it, move takes it off this day', () => {
        expect(
            applyOpsLocally(base, [{ op: 'unslot', task_uid: 'b' }], tasks)[1]
                .start_minute
        ).toBeNull();
        expect(
            applyOpsLocally(base, [{ op: 'remove', task_uid: 'a' }], tasks).map(
                (i) => i.task_uid
            )
        ).toEqual(['b']);
        expect(
            applyOpsLocally(
                base,
                [{ op: 'move', task_uid: 'a', to_date: '2026-11-13' }],
                tasks
            ).map((i) => i.task_uid)
        ).toEqual(['b']);
    });

    it('reorders and renumbers', () => {
        const next = applyOpsLocally(
            [...base, item('c', 2, null)],
            [{ op: 'reorder', task_uid: 'c', before_uid: 'a' }],
            tasks
        );
        expect(next.map((i) => [i.task_uid, i.position])).toEqual([
            ['c', 0],
            ['a', 1],
            ['b', 2],
        ]);
    });

    it('resize changes only the plan duration', () => {
        const next = applyOpsLocally(
            base,
            [{ op: 'resize', task_uid: 'b', duration_minutes: 90 }],
            tasks
        );
        expect(next[1].duration_minutes).toBe(90);
        expect(next[1].task.estimated_minutes).toBeUndefined();
    });
});

describe('daySummary', () => {
    const hours = { start: 8 * 60, end: 18 * 60 };

    it('counts what the open tasks need against free time', () => {
        const lines = dayLines(
            [item('a', 0, 540, 60), item('b', 1, null, 120)],
            [],
            DATE
        );
        const summary = daySummary(
            lines,
            [{ start: 600, end: 720 }],
            hours,
            null
        );
        expect(summary).toEqual({
            open: 2,
            needed: 180,
            free: 480,
            over: false,
        });
    });

    it('today counts from now; a missed slot still needs its time', () => {
        const lines = dayLines(
            [item('missed', 0, 540, 60), item('running', 1, 840, 60)],
            [],
            DATE
        );
        const summary = daySummary(lines, [], hours, 870);
        expect(summary.needed).toBe(60 + 30);
        expect(summary.free).toBe(18 * 60 - 870);
    });

    it('flags an overloaded day', () => {
        const lines = dayLines([item('a', 0, null, 300)], [], DATE);
        expect(
            daySummary(lines, [{ start: 480, end: 900 }], hours, null).over
        ).toBe(true);
    });

    it('an unslotted due-time task is busy time, not needed time', () => {
        const lines = dayLines(
            [],
            [
                task('meet', {
                    due_date: DATE,
                    due_time: '11:00',
                    estimated_minutes: 60,
                }),
            ],
            DATE
        );
        expect(daySummary(lines, [], hours, null).needed).toBe(0);
    });
});

describe('coveredMinutes', () => {
    it('merges overlaps and clips to the range', () => {
        expect(
            coveredMinutes(
                [
                    { start: 500, end: 600 },
                    { start: 550, end: 650 },
                    { start: 1000, end: 1200 },
                ],
                480,
                1080
            )
        ).toBe(150 + 80);
    });
});

describe('reflowSlots', () => {
    const slotted = () =>
        dayLines(
            [
                item('a', 0, 540, 60),
                item('b', 1, 660, 30),
                item('c', 2, 840, 45),
            ],
            [],
            DATE
        ).timed;

    it('moving a task down swaps it into the later slot times', () => {
        const [a, , c] = slotted();
        const changes = reflowSlots(slotted(), a, c.uid, []);
        // New order b, c, a on the slot times 9:00, 11:00, 14:00.
        expect(changes).toEqual([
            { uid: 'b', start: 540, duration: 30 },
            { uid: 'c', start: 660, duration: 45 },
            { uid: 'a', start: 840, duration: 60 },
        ]);
    });

    it('moving a task up takes the earlier slot and pushes the next one', () => {
        const [, , c] = slotted();
        const changes = reflowSlots(slotted(), c, 'a', []);
        // Order c, a, b: c at 9:00 (45 min), a at 11:00, b after a.
        expect(changes).toEqual([
            { uid: 'c', start: 540, duration: 45 },
            { uid: 'a', start: 660, duration: 60 },
            { uid: 'b', start: 840, duration: 30 },
        ]);
    });

    it('never puts a task over busy time', () => {
        const [a, b] = slotted();
        const changes = reflowSlots(slotted(), b, a.uid, [
            { start: 540, end: 600 },
        ]);
        expect(changes[0]).toEqual({ uid: 'b', start: 600, duration: 30 });
    });

    it('gives a slot to a task that had none', () => {
        const free = dayLines([item('n', 3, null, 30)], [], DATE).anytime[0];
        const changes = reflowSlots(slotted(), free, 'b', []);
        expect(changes.find((c) => c.uid === 'n')).toEqual({
            uid: 'n',
            start: 660,
            duration: 30,
        });
    });
});

describe('visibleLines', () => {
    const lines = dayLines(
        [
            item('open', 0, 540),
            item('done-timed', 1, 600, 30, { status: 'done' }),
            item('done-anytime', 2, null, 30, { status: 'done' }),
        ],
        [],
        DATE
    );

    it('keeps every line when completed tasks are shown', () => {
        expect(visibleLines(lines, false)).toBe(lines);
    });

    it('drops the done lines, timed or not, and keeps the open ones', () => {
        const shown = visibleLines(lines, true);
        expect(shown.done).toEqual([]);
        expect(shown.timed.map((l) => l.uid)).toEqual(['open']);
        expect(shown.anytime).toEqual([]);
    });
});
