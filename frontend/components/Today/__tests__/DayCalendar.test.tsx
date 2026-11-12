import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayCalendar, {
    DayCalendarProps,
    DayColumnData,
    dropWarnings,
    minuteFromOffset,
    PX_PER_MINUTE,
} from '../DayCalendar';
import { DayLine } from '../dayModel';
import { Task } from '../../../entities/Task';
import { CalendarEvent } from '../../../utils/calendarFeedsService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

const RANGE = { start: 480, end: 1080 };

const lineOf = (uid: string, fields: Partial<DayLine> = {}): DayLine => ({
    uid,
    task: { uid, name: `Task ${uid}`, status: 0 } as Task,
    planned: true,
    start: null,
    dueMinute: null,
    duration: 30,
    durationKnown: true,
    done: false,
    ...fields,
});

const handlers = () => ({
    onToggle: jest.fn(),
    onOpen: jest.fn(),
    onResize: jest.fn(),
    onMove: jest.fn(),
    onUnslot: jest.fn(),
});

const DAY = '2026-11-12';

interface OneDay {
    now?: number | null;
    lines?: DayLine[];
    events?: CalendarEvent[];
    focus?: DayColumnData['focus'];
}

// One column, the way Today shows a single day.
const renderCalendar = ({
    now = null,
    lines = [],
    events = [],
    focus = [],
    ...overrides
}: OneDay & Partial<DayCalendarProps> = {}): ReturnType<typeof handlers> => {
    const h = handlers();
    render(
        <DayCalendar
            range={RANGE}
            columns={[
                {
                    date: DAY,
                    weekday: 'Thu',
                    dayNumber: 12,
                    isToday: now !== null,
                    now,
                    lines,
                    events,
                    focus,
                },
            ]}
            {...h}
            {...overrides}
        />
    );
    return h;
};

const event = (fields: Partial<CalendarEvent>): CalendarEvent =>
    ({
        uid: 'e1',
        title: 'Dentist',
        all_day: false,
        busy: true,
        start: '',
        end: '',
        start_minute: 600,
        end_minute: 660,
        feed_uid: 'f',
        feed_name: 'Family',
        color: null,
        ...fields,
    }) as CalendarEvent;

describe('DayCalendar placement', () => {
    it('places a slotted block by its start and duration', () => {
        renderCalendar({
            lines: [lineOf('a', { start: 540, duration: 90 })],
        });
        const block = screen.getByTestId('block-a');
        expect(block.style.top).toBe(`${60 * PX_PER_MINUTE}px`);
        // 2 px shorter, so back-to-back blocks keep a gap between them.
        expect(block.style.height).toBe(`${90 * PX_PER_MINUTE - 2}px`);
    });

    it('draws an appointment at its due time with a flag', () => {
        renderCalendar({
            lines: [lineOf('r', { dueMinute: 600, duration: 60 })],
        });
        const block = screen.getByTestId('appointment-r');
        expect(block.style.top).toBe(`${120 * PX_PER_MINUTE}px`);
        expect(block.querySelector('svg')).not.toBeNull();
        expect(block).toHaveAttribute('aria-label', 'Task r, due 10:00–11:00');
    });

    it('shows the now line only when a time is given', () => {
        renderCalendar();
        expect(screen.queryByTestId('now-line')).not.toBeInTheDocument();
        cleanup();

        renderCalendar({ now: 620 });
        expect(screen.getByTestId('now-line')).toBeInTheDocument();
    });

    it('lays out overlapping blocks side by side', () => {
        renderCalendar({
            events: [event({ start_minute: 540, end_minute: 600 })],
            lines: [lineOf('a', { start: 550, duration: 30 })],
        });
        const block = screen.getByTestId('block-a');
        expect(block.style.width).toContain('50%');
    });
});

describe('DayCalendar keyboard', () => {
    it('Alt+ArrowDown grows the block by 15 minutes', () => {
        const h = renderCalendar({
            lines: [lineOf('a', { start: 540, duration: 30 })],
        });
        fireEvent.keyDown(screen.getByTestId('block-a'), {
            key: 'ArrowDown',
            altKey: true,
        });
        expect(h.onResize).toHaveBeenCalledWith(DAY, 'a', 45);
    });

    it('Shift+ArrowUp moves the block 15 minutes earlier', () => {
        const h = renderCalendar({
            lines: [lineOf('a', { start: 540, duration: 30 })],
        });
        fireEvent.keyDown(screen.getByTestId('block-a'), {
            key: 'ArrowUp',
            shiftKey: true,
        });
        expect(h.onMove).toHaveBeenCalledWith(DAY, 'a', 525);
    });

    it('Delete removes the slot', () => {
        const h = renderCalendar({
            lines: [lineOf('a', { start: 540, duration: 30 })],
        });
        fireEvent.keyDown(screen.getByTestId('block-a'), { key: 'Delete' });
        expect(h.onUnslot).toHaveBeenCalledWith(DAY, 'a');
    });

    it('Space toggles the line from its block', () => {
        const line = lineOf('a', { start: 540, duration: 30 });
        const h = renderCalendar({ lines: [line] });
        fireEvent.keyDown(screen.getByTestId('block-a'), { key: ' ' });
        expect(h.onToggle).toHaveBeenCalledWith(line);
    });
});

describe('minuteFromOffset', () => {
    it('snaps the pointer position to 15 minutes', () => {
        expect(minuteFromOffset(0, RANGE)).toBe(480);
        expect(minuteFromOffset(20, RANGE)).toBe(495);
        expect(minuteFromOffset(40, RANGE)).toBe(525);
    });

    it('stays inside the range', () => {
        expect(minuteFromOffset(-100, RANGE)).toBe(480);
        expect(minuteFromOffset(100000, RANGE)).toBe(1080);
    });
});

describe('dropWarnings', () => {
    // The column is DAY: keep "today" fixed so the past-day rule is stable.
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 10, 12, 9, 0));
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    const column = (
        fields: Partial<
            Pick<DayColumnData, 'date' | 'now' | 'lines' | 'events'>
        > = {}
    ) => ({
        date: DAY,
        now: null,
        lines: [] as DayLine[],
        events: [] as CalendarEvent[],
        ...fields,
    });

    it('flags nothing for a drop on free time', () => {
        expect(
            dropWarnings(column({ lines: [lineOf('a', { start: 600 })] }), {
                minute: 720,
                duration: 30,
            })
        ).toEqual({ overlaps: false, past: false });
    });

    it('flags an overlap with a slotted block, touching edges excluded', () => {
        const lines = [lineOf('a', { start: 600, duration: 60 })];
        expect(
            dropWarnings(column({ lines }), { minute: 630, duration: 30 })
                .overlaps
        ).toBe(true);
        // Starts exactly when the block ends: no overlap.
        expect(
            dropWarnings(column({ lines }), { minute: 660, duration: 30 })
                .overlaps
        ).toBe(false);
    });

    it('flags an overlap with a timed calendar event', () => {
        expect(
            dropWarnings(
                column({
                    events: [event({ start_minute: 540, end_minute: 570 })],
                }),
                { minute: 560, duration: 30 }
            ).overlaps
        ).toBe(true);
    });

    it('ignores appointments and all-day events', () => {
        expect(
            dropWarnings(
                column({
                    lines: [lineOf('r', { dueMinute: 600 })],
                    events: [event({ all_day: true, start_minute: null })],
                }),
                { minute: 600, duration: 30 }
            )
        ).toEqual({ overlaps: false, past: false });
    });

    it('ignores the dragged task itself when the preview names its uid', () => {
        const lines = [lineOf('a', { start: 600, duration: 60 })];
        expect(
            dropWarnings(column({ lines }), {
                minute: 630,
                duration: 30,
                uid: 'a',
            }).overlaps
        ).toBe(false);
        expect(
            dropWarnings(column({ lines }), {
                minute: 630,
                duration: 30,
                uid: 'other',
            }).overlaps
        ).toBe(true);
    });

    it('flags every drop on a day before today as in the past', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 10, 12, 9, 0));
        try {
            expect(
                dropWarnings(column({ date: '2026-11-11' }), {
                    minute: 1000,
                    duration: 30,
                }).past
            ).toBe(true);
            expect(
                dropWarnings(column({ date: '2026-11-13' }), {
                    minute: 480,
                    duration: 30,
                }).past
            ).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('flags a drop that starts before the now line', () => {
        expect(
            dropWarnings(column({ now: 620 }), { minute: 600, duration: 30 })
                .past
        ).toBe(true);
        expect(
            dropWarnings(column({ now: 620 }), { minute: 620, duration: 30 })
                .past
        ).toBe(false);
    });
});

describe('DayCalendar drop preview warnings', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 10, 12, 9, 0));
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('tints the preview and labels an overlap', () => {
        renderCalendar({
            lines: [lineOf('a', { start: 600, duration: 60 })],
            drop: { date: DAY, minute: 630, duration: 30, title: 'New' },
        });
        const preview = screen.getByTestId('drop-preview');
        expect(preview).toHaveAttribute('data-warned', 'true');
        expect(preview).toHaveTextContent('Overlaps');
    });

    it('leaves a preview on free time plain', () => {
        renderCalendar({
            lines: [lineOf('a', { start: 600, duration: 30 })],
            drop: { date: DAY, minute: 720, duration: 30, title: 'New' },
        });
        const preview = screen.getByTestId('drop-preview');
        expect(preview).not.toHaveAttribute('data-warned');
        expect(preview).not.toHaveTextContent('Overlaps');
        expect(preview).not.toHaveTextContent('In the past');
    });

    it('labels a drop before the now line as in the past', () => {
        renderCalendar({
            now: 700,
            drop: { date: DAY, minute: 600, duration: 30, title: 'New' },
        });
        expect(screen.getByTestId('drop-preview')).toHaveTextContent(
            'In the past'
        );
    });
});

describe('DayCalendar opening a block', () => {
    it('reports the column day with the line', () => {
        const h = renderCalendar({
            lines: [lineOf('a', { start: 540, duration: 30 })],
        });
        fireEvent.click(screen.getByTestId('block-a'));
        expect(h.onOpen).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'a' }),
            DAY
        );
    });
});
