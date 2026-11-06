import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayTimeline from '../DayTimeline';
import { CalendarEvent } from '../../../utils/calendarFeedsService';
import { DailyPlanItem } from '../../../utils/dailyPlanService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
        i18n: { language: 'en' },
    }),
}));

const mockOpenTaskPanel = jest.fn();
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: (uid: string) => mockOpenTaskPanel(uid),
}));

const HINT = 'Drag tasks here, or press + to drop them into the next free slot';

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
        feed_uid: 'feed1',
        feed_name: 'Family',
        color: null,
        ...fields,
    }) as CalendarEvent;

const planned = (uid: string, start: number): DailyPlanItem =>
    ({
        task_uid: uid,
        position: 0,
        start_minute: start,
        duration_minutes: 60,
        task: { uid, name: uid, status: 0, completed_at: null },
    }) as DailyPlanItem;

const renderTimeline = (events: CalendarEvent[], items: DailyPlanItem[] = []) =>
    render(
        <DayTimeline
            items={items}
            events={events}
            range={{ start: 480, end: 1080 }}
            now={null}
            onResize={jest.fn()}
            onRemove={jest.fn()}
            onReschedule={jest.fn()}
        />
    );

describe('DayTimeline', () => {
    it('names a timed task once, without a calendar badge', () => {
        renderTimeline([
            event({
                uid: 'task-1',
                title: 'Sport',
                feed_uid: 'tasks',
                feed_name: 'Sport',
                task_uid: 'abc',
            }),
        ]);
        expect(screen.getAllByText('Sport')).toHaveLength(1);
        expect(screen.queryByTestId('calendar-badge')).toBeNull();
    });

    it('lets a timed task be moved and opened, unlike a calendar event', () => {
        renderTimeline([
            event({
                uid: 'task-1',
                title: 'Sport',
                feed_uid: 'tasks',
                feed_name: 'Sport',
                task_uid: 'abc',
            }),
            event({
                uid: 'e2',
                title: 'Dentist',
                start_minute: 900,
                end_minute: 960,
            }),
        ]);
        expect(
            screen.getByRole('button', { name: 'Move {{name}}' })
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sport' }));
        expect(mockOpenTaskPanel).toHaveBeenCalledWith('abc');
        expect(
            screen.getByRole('button', { name: 'Sport' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Dentist' })).toBeNull();
    });

    it('still says which calendar an event comes from', () => {
        renderTimeline([event({})]);
        expect(screen.getByTestId('calendar-badge')).toHaveTextContent(
            'Family'
        );
    });

    it('keeps the hint off the hours, where it would cover what is there', () => {
        renderTimeline([event({})]);
        expect(screen.getByText(HINT)).toBeInTheDocument();
        expect(
            within(screen.getByTestId('day-timeline')).queryByText(HINT)
        ).toBeNull();
    });

    it('shows no hint once a task is planned', () => {
        renderTimeline([], [planned('a', 600)]);
        expect(screen.queryByText(HINT)).toBeNull();
    });

    it('puts overlapping events side by side', () => {
        renderTimeline([
            event({
                uid: 'a',
                title: 'First',
                start_minute: 915,
                end_minute: 975,
            }),
            event({
                uid: 'b',
                title: 'Second',
                start_minute: 930,
                end_minute: 990,
            }),
        ]);
        const first = screen.getByText('First').parentElement as HTMLElement;
        const second = screen.getByText('Second').parentElement as HTMLElement;
        expect(first.style.left).not.toBe(second.style.left);
        expect(first.style.width).toContain('50%');
        expect(second.style.width).toContain('50%');
    });

    it('keeps a planned task beside the event it overlaps', () => {
        renderTimeline(
            [event({ title: 'Dentist', start_minute: 600, end_minute: 660 })],
            [planned('a', 630)]
        );
        expect(screen.getByTestId('block-a').style.width).toContain('50%');
    });
});
