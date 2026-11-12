import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import TaskCard, { TaskCardProps } from '../TaskCard';
import type { DayLine } from '../../Today/dayModel';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

const line = (
    fields: Partial<Omit<DayLine, 'task'>> & { task?: Partial<Task> }
): DayLine =>
    ({
        uid: 'a',
        planned: true,
        start: null,
        dueMinute: null,
        duration: 30,
        durationKnown: false,
        done: false,
        ...fields,
        task: {
            uid: 'a',
            name: 'Write report',
            status: 0,
            ...fields.task,
        } as Task,
    }) as DayLine;

const renderCard = (
    overrides: Partial<TaskCardProps> & { line: DayLine }
): Record<'onToggle' | 'onOpen' | 'onToggleSubtask', jest.Mock> => {
    const handlers = {
        onToggle: jest.fn(),
        onOpen: jest.fn(),
        onToggleSubtask: jest.fn(),
    };
    render(
        <DndContext>
            <SortableContext items={['card:2026-11-12:a']}>
                <TaskCard
                    date="2026-11-12"
                    selected={false}
                    {...handlers}
                    {...overrides}
                />
            </SortableContext>
        </DndContext>
    );
    return handlers;
};

describe('TaskCard', () => {
    it('puts the round check before the title on the first line', () => {
        renderCard({ line: line({ task: {} }) });

        const card = screen.getByTestId('upcoming-card');
        const check = within(card).getByRole('checkbox', {
            name: 'Mark as done',
        });
        const title = within(card).getByText('Write report');

        expect(check.compareDocumentPosition(title)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
    });

    it('toggles the task from its check without opening it', () => {
        const h = renderCard({ line: line({ task: {} }) });

        fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as done' }));

        expect(h.onToggle).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'a' })
        );
        expect(h.onOpen).not.toHaveBeenCalled();
    });

    it('shows a filled check and a struck title when done', () => {
        renderCard({ line: line({ done: true, task: { status: 2 } }) });

        const check = screen.getByRole('checkbox', {
            name: 'Mark as not done',
        });
        expect(check).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('Write report')).toHaveClass('line-through');
    });

    it('shows the start time and duration on the meta line, with the project', () => {
        renderCard({
            line: line({
                start: 9 * 60,
                durationKnown: true,
                duration: 45,
                task: {
                    Project: {
                        name: 'Home',
                        color: '#00ff00',
                    } as Task['Project'],
                },
            }),
        });

        expect(screen.getByText('09:00')).toBeInTheDocument();
        expect(screen.getByText('45m')).toBeInTheDocument();
        expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('shows the first line of the note greyed', () => {
        renderCard({
            line: line({ task: { note: 'Draft the summary\nsecond line' } }),
        });

        expect(screen.getByText('Draft the summary')).toBeInTheDocument();
        expect(screen.queryByText(/second line/)).not.toBeInTheDocument();
    });

    it('marks a selected card with a ring', () => {
        renderCard({ line: line({ task: {} }), selected: true });

        expect(screen.getByTestId('upcoming-card')).toHaveClass('ring-2');
        expect(screen.getByTestId('upcoming-card')).toHaveAttribute(
            'aria-selected',
            'true'
        );
    });

    it('keeps the data-task-row marker used by outside-click handling', () => {
        renderCard({ line: line({ task: {} }) });

        expect(screen.getByTestId('upcoming-card')).toHaveAttribute(
            'data-task-row'
        );
    });

    it('opens the card with Enter', () => {
        const h = renderCard({ line: line({ task: {} }) });

        fireEvent.keyDown(screen.getByTestId('upcoming-card'), {
            key: 'Enter',
        });

        expect(h.onOpen).toHaveBeenCalledTimes(1);
    });

    it('does not toggle the task when Space is pressed on the card', () => {
        const h = renderCard({ line: line({ task: {} }) });

        fireEvent.keyDown(screen.getByTestId('upcoming-card'), { key: ' ' });

        expect(h.onToggle).not.toHaveBeenCalled();
        expect(h.onOpen).not.toHaveBeenCalled();
    });

    it('lists its subtasks, except those with a card of their own', () => {
        renderCard({
            line: line({
                task: {
                    subtasks: [
                        { uid: 's1', name: 'Own step', status: 0 } as Task,
                        { uid: 's2', name: 'Listed step', status: 0 } as Task,
                    ],
                },
            }),
            ownCardKeys: new Set(['s1']),
        });

        expect(screen.queryByText('Own step')).not.toBeInTheDocument();
        expect(screen.getByText('Listed step')).toBeInTheDocument();
    });

    it('names the parent of a subtask card', () => {
        renderCard({
            line: line({
                task: {
                    name: 'Child step',
                    parent_task: { id: 1, uid: 'p', name: 'Parent task' },
                } as Partial<Task>,
            }),
        });

        expect(screen.getByText('↳ Parent task')).toBeInTheDocument();
    });
});
