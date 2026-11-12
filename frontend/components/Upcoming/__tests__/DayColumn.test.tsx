import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayColumn, { DayColumnProps } from '../DayColumn';
import type { DayResponse } from '../../../utils/dayService';
import type { DailyPlanItem } from '../../../utils/dailyPlanService';
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

const DAY = '2026-11-12';

const task = (uid: string, name: string, fields: Partial<Task> = {}): Task =>
    ({ uid, name, status: 0, ...fields }) as Task;

const planItem = (
    uid: string,
    position: number,
    fields: Partial<DailyPlanItem> = {}
): DailyPlanItem =>
    ({
        task_uid: uid,
        task: task(uid, `Task ${uid}`),
        position,
        start_minute: null,
        duration_minutes: 30,
        occurrence_done: false,
        ...fields,
    }) as DailyPlanItem;

const dayWith = (items: DailyPlanItem[] = [], due: Task[] = []): DayResponse =>
    ({
        date: DAY,
        is_today: true,
        plan: { items },
        due,
    }) as unknown as DayResponse;

const handlers = () => ({
    onSelect: jest.fn(),
    onAdd: jest.fn(),
    onOpen: jest.fn(),
    onToggle: jest.fn(),
    onToggleSubtask: jest.fn(),
});

const renderColumn = (
    overrides: Partial<DayColumnProps> = {}
): ReturnType<typeof handlers> => {
    const h = handlers();
    render(
        <DayColumn
            date={DAY}
            isToday
            day={dayWith()}
            selected={false}
            openTaskUid={null}
            {...h}
            {...overrides}
        />
    );
    return h;
};

const cardTitles = (): string[] =>
    screen
        .queryAllByTestId('upcoming-card')
        .map((card) => card.getAttribute('aria-label') ?? '');

describe('DayColumn', () => {
    it('shows the weekday and date of its day', () => {
        renderColumn();

        const column = screen.getByTestId('upcoming-column');
        expect(column).toHaveAttribute('data-date', DAY);
        expect(column).toHaveAccessibleName(/Thursday/);
        expect(
            within(column).getByRole('heading', { name: 'Thursday' })
        ).toBeInTheDocument();
    });

    it('marks the column of today', () => {
        renderColumn({ isToday: true });

        expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('does not mark other days as today', () => {
        renderColumn({ isToday: false });

        expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });

    it('renders one card per planned task, in plan order', () => {
        renderColumn({
            day: dayWith([planItem('b', 2), planItem('a', 1)]),
        });

        expect(cardTitles()).toEqual(['Task a', 'Task b']);
    });

    it('lists tasks due that day but not planned, after the planned ones', () => {
        renderColumn({
            day: dayWith([planItem('a', 1)], [task('due', 'Due only')]),
        });

        expect(cardTitles()).toEqual(['Task a', 'Due only']);
    });

    it('puts done cards after open ones', () => {
        renderColumn({
            day: dayWith([
                planItem('done', 1, { occurrence_done: true }),
                planItem('open', 2),
            ]),
        });

        expect(cardTitles()).toEqual(['Task open', 'Task done']);
    });

    it('counts done and total cards in the progress bar', () => {
        renderColumn({
            day: dayWith([
                planItem('done', 1, { occurrence_done: true }),
                planItem('open', 2),
            ]),
        });

        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '1');
        expect(bar).toHaveAttribute('aria-valuemax', '2');
        expect(bar).toHaveAccessibleName('1 of 2 done');
    });

    it('shows the empty state when the day has nothing', () => {
        renderColumn({ day: dayWith() });

        expect(screen.getByText('Nothing planned.')).toBeInTheDocument();
        expect(screen.queryAllByTestId('upcoming-card')).toHaveLength(0);
    });

    it('hides the empty state while the day is loading', () => {
        renderColumn({ day: undefined });

        expect(screen.queryByText('Nothing planned.')).not.toBeInTheDocument();
    });

    it('keeps the add field hidden until the add button is clicked', () => {
        renderColumn();

        expect(
            screen.queryByRole('textbox', { name: 'Add a task' })
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Add a task/ }));

        expect(
            screen.getByRole('textbox', { name: 'Add a task' })
        ).toBeInTheDocument();
    });

    it('places the add button after the cards', () => {
        renderColumn({ day: dayWith([planItem('a', 1)]) });

        const button = screen.getByRole('button', { name: /Add a task/ });
        const card = screen.getByTestId('upcoming-card');

        expect(card.compareDocumentPosition(button)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
    });

    it('adds a task with its trimmed name and clears the field', () => {
        const h = renderColumn();
        fireEvent.click(screen.getByRole('button', { name: /Add a task/ }));
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: '  Water the plants  ' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(h.onAdd).toHaveBeenCalledWith(DAY, 'Water the plants');
        expect(input).toHaveValue('');
    });

    it('ignores a blank name', () => {
        const h = renderColumn();
        fireEvent.click(screen.getByRole('button', { name: /Add a task/ }));
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(h.onAdd).not.toHaveBeenCalled();
    });

    it('hides the add field on Escape', () => {
        renderColumn();
        fireEvent.click(screen.getByRole('button', { name: /Add a task/ }));

        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Add a task' }), {
            key: 'Escape',
        });

        expect(
            screen.queryByRole('textbox', { name: 'Add a task' })
        ).not.toBeInTheDocument();
    });

    it('puts the checkbox before the title in reading order', () => {
        renderColumn({ day: dayWith([planItem('a', 1)]) });

        const card = screen.getByTestId('upcoming-card');
        const check = within(card).getByRole('checkbox');
        const title = within(card).getByText('Task a');

        expect(check.compareDocumentPosition(title)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
    });

    it('hides done cards when showCompleted is off', () => {
        renderColumn({
            showCompleted: false,
            day: dayWith([
                planItem('done', 1, { occurrence_done: true }),
                planItem('open', 2),
            ]),
        });

        expect(cardTitles()).toEqual(['Task open']);
    });

    it('still counts hidden done cards in the progress bar', () => {
        renderColumn({
            showCompleted: false,
            day: dayWith([
                planItem('done', 1, { occurrence_done: true }),
                planItem('open', 2),
            ]),
        });

        expect(screen.getByRole('progressbar')).toHaveAttribute(
            'aria-valuemax',
            '2'
        );
    });

    it('renders sub-headers and one group per value when grouped', () => {
        renderColumn({
            groupBy: 'project',
            day: dayWith([
                planItem('a', 1, {
                    task: task('a', 'Task a', {
                        Project: { name: 'Work' } as Task['Project'],
                    }),
                }),
                planItem('b', 2),
            ]),
        });

        expect(screen.getByRole('group', { name: 'Work' })).toBeInTheDocument();
        expect(
            screen.getByRole('group', { name: 'No project' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: /No project/ })
        ).toBeInTheDocument();
    });

    it('renders no sub-headers without grouping', () => {
        renderColumn({ day: dayWith([planItem('a', 1)]) });

        expect(
            screen.queryByRole('heading', { level: 3 })
        ).not.toBeInTheDocument();
    });

    it('sorts cards by name when asked', () => {
        renderColumn({
            sortBy: 'name',
            day: dayWith([planItem('b', 1), planItem('a', 2)]),
        });

        expect(cardTitles()).toEqual(['Task a', 'Task b']);
    });

    it('selects its day when clicked', () => {
        const h = renderColumn();

        fireEvent.click(screen.getByTestId('upcoming-column'));

        expect(h.onSelect).toHaveBeenCalledWith(DAY);
    });

    it('marks each card as a task row so a click on it is not an outside click', () => {
        renderColumn({ day: dayWith([planItem('a', 1)]) });

        expect(screen.getByTestId('upcoming-card')).toHaveAttribute(
            'data-task-row'
        );
    });

    it('opens a card without toggling it', () => {
        const h = renderColumn({
            day: dayWith([planItem('a', 1)]),
        });

        fireEvent.click(screen.getByTestId('upcoming-card'));

        expect(h.onOpen).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'a', planned: true })
        );
        expect(h.onToggle).not.toHaveBeenCalled();
    });
});
