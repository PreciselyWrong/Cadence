import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../Calendar/CalendarDayView';
import { resizeUpdate, taskToEvents } from '../Calendar/taskEvents';
import { RecurringScopeDialogHost } from '../Task/RecurringScopeDialog';
import { saveTaskEdit } from '../../utils/recurringScope';
import { editTaskOccurrence, updateTask } from '../../utils/tasksService';
import { Task } from '../../entities/Task';

jest.mock('../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

jest.mock('../../utils/tasksService', () => ({
    editTaskOccurrence: jest.fn(),
    deleteTaskOccurrence: jest.fn(),
    updateTask: jest.fn(),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
        i18n: { language: 'en' },
    }),
}));

// jsdom has no PointerEvent; a MouseEvent carries the clientY the resize reads.
if (!(window as any).PointerEvent) {
    (window as any).PointerEvent = window.MouseEvent;
}

const mockedEdit = editTaskOccurrence as jest.MockedFunction<
    typeof editTaskOccurrence
>;

// A later occurrence of a daily 10:00 task, as the calendar receives it.
const occurrence = {
    id: 4,
    uid: 'series-uid',
    name: 'Stretch',
    due_date: '2026-11-05',
    due_time: '10:00',
    due_has_time: true,
    estimated_minutes: 30,
    recurrence_type: 'daily',
    is_virtual_occurrence: true,
    occurrence_index: 3,
    status: 'not_started',
} as unknown as Task;

// The calendar's resize path: the new end becomes the task's fields, saved
// through the recurring prompt.
const renderDay = () => {
    const events = taskToEvents(occurrence as any);
    const saves: Promise<Task>[] = [];
    render(
        <>
            <CalendarDayView
                currentDate={new Date(2026, 10, 5)}
                events={events}
                onEventResize={(id: string, end: Date) => {
                    const event = events.find((e) => e.id === id)!;
                    saves.push(
                        saveTaskEdit(occurrence, resizeUpdate(event, end))
                    );
                }}
            />
            <RecurringScopeDialogHost />
        </>
    );
    return saves;
};

const dragBottomEdge = (pixels: number) => {
    const handle = screen.getByTestId('calendar-resize-handle');
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 100 + pixels });
    fireEvent.pointerUp(window);
};

describe('resizing a recurring occurrence in the calendar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedEdit.mockResolvedValue({
            task: { uid: 'series-uid' } as Task,
            edited: { uid: 'copy-uid' } as Task,
        });
    });

    it('asks once, then changes the length of that occurrence alone', async () => {
        const saves = renderDay();

        // Day view hours are 48px tall: 36px is 45 minutes.
        dragBottomEdge(36);

        expect(
            await screen.findByText('Edit this task or the series?')
        ).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByTestId('recurring-scope-this'));
            await Promise.all(saves);
        });

        expect(mockedEdit).toHaveBeenCalledTimes(1);
        expect(mockedEdit).toHaveBeenCalledWith('series-uid', {
            scope: 'this',
            occurrence_date: '2026-11-05',
            changes: { estimated_minutes: 75 },
        });
        expect(updateTask).not.toHaveBeenCalled();
        expect(
            screen.queryByTestId('recurring-scope-dialog')
        ).not.toBeInTheDocument();
    });

    it('saves nothing when the prompt is cancelled', async () => {
        const saves = renderDay();

        dragBottomEdge(36);
        await screen.findByTestId('recurring-scope-dialog');
        await act(async () => {
            fireEvent.click(screen.getByTestId('recurring-scope-cancel'));
            await Promise.allSettled(saves);
        });

        expect(mockedEdit).not.toHaveBeenCalled();
        expect(updateTask).not.toHaveBeenCalled();
    });
});
