import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../Calendar/CalendarDayView';
import CalendarAgendaView from '../Calendar/CalendarAgendaView';
import { TaskToggleContext } from '../Calendar/TaskCheck';
import { taskToEvents } from '../Calendar/taskEvents';

const day = new Date(2026, 8, 24);
const timed = taskToEvents({
    id: 7,
    name: 'Call the plumber',
    due_date: '2026-09-24',
    due_time: '10:00',
});
const done = taskToEvents({
    id: 8,
    name: 'Pay rent',
    due_date: '2026-09-24',
    completed_at: '2026-09-24T08:00:00Z',
});

describe('Ticking tasks off in the calendar', () => {
    it('marks task events as completable with their done state', () => {
        expect(timed[0]).toMatchObject({ completable: true, completed: false });
        expect(done[0]).toMatchObject({ completable: true, completed: true });
    });

    it('does not tick off a later occurrence of a recurring task', () => {
        const [occurrence] = taskToEvents({
            id: 9,
            name: 'Water plants',
            due_date: '2026-09-25',
            is_virtual_occurrence: true,
            occurrence_index: 1,
        });
        expect(occurrence.completable).toBeUndefined();
    });

    it('toggles a timed task without opening it', () => {
        const toggle = jest.fn();
        const open = jest.fn();
        render(
            <TaskToggleContext.Provider value={toggle}>
                <CalendarDayView
                    currentDate={day}
                    events={[...timed, ...done]}
                    onEventClick={open}
                />
            </TaskToggleContext.Provider>
        );
        fireEvent.click(screen.getByTestId('calendar-task-check-task-7'));
        expect(toggle).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'task-7' })
        );
        expect(open).not.toHaveBeenCalled();
        expect(
            screen.getByTestId('calendar-task-check-task-8')
        ).toHaveAttribute('aria-checked', 'true');
    });

    it('shows a box in the agenda list', () => {
        const toggle = jest.fn();
        render(
            <TaskToggleContext.Provider value={toggle}>
                <CalendarAgendaView start={day} end={day} events={timed} />
            </TaskToggleContext.Provider>
        );
        fireEvent.click(screen.getByTestId('calendar-task-check-task-7'));
        expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('draws no box without a provider', () => {
        render(<CalendarDayView currentDate={day} events={timed} />);
        expect(
            screen.queryByTestId('calendar-task-check-task-7')
        ).not.toBeInTheDocument();
    });
});
