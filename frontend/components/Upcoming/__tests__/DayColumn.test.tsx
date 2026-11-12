import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import DayColumn, { DayColumnProps } from '../DayColumn';
import { formatDuration } from '../../DailyPlan/planUtils';
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
    it('shows the weekday as the label and the date on its own line', () => {
        renderColumn({ isToday: false });

        const column = screen.getByTestId('upcoming-column');
        expect(column).toHaveAttribute('data-date', DAY);
        expect(column).toHaveAccessibleName('Thursday · Nov 12');
        const header = within(column).getByRole('heading', {
            name: 'Thursday',
        });
        expect(header).toHaveClass('whitespace-nowrap');
        expect(header).not.toHaveClass('truncate');
        const date = within(column).getByText('Nov 12');
        expect(date.closest('time')).toHaveAttribute('datetime', DAY);
        expect(date).not.toHaveClass('truncate');
    });

    it('marks the column of today in its header with the weekday in the date', () => {
        renderColumn({ isToday: true });

        expect(
            screen.getByRole('heading', { name: 'Today' })
        ).toBeInTheDocument();
        expect(screen.getByText('Thu, Nov 12')).not.toHaveClass('truncate');
        expect(screen.getByTestId('upcoming-column')).toHaveAccessibleName(
            'Today · Thu, Nov 12'
        );
    });

    it('names the day after today Tomorrow', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 10, 11, 9));
        try {
            renderColumn({ date: '2026-11-12', isToday: false });

            expect(
                screen.getByRole('heading', { name: 'Tomorrow' })
            ).toBeInTheDocument();
            expect(screen.getByText('Thu, Nov 12')).toBeInTheDocument();
            expect(screen.getByTestId('upcoming-column')).toHaveAccessibleName(
                'Tomorrow · Thu, Nov 12'
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('tints the header of a weekend day', () => {
        renderColumn({ date: '2026-11-14', isToday: false });

        expect(
            screen.getByRole('heading', { name: 'Saturday' })
        ).toBeInTheDocument();
        expect(screen.getByText('Nov 14')).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Saturday' }).closest('header')
        ).toHaveAttribute('data-weekend', 'true');
    });

    it('labels the ISO week above the first day of the week', () => {
        renderColumn({ weekStartsOn: 4 });

        expect(screen.getByText('Week 46')).toBeInTheDocument();
    });

    it('shows no week label on other days of the week', () => {
        renderColumn({ weekStartsOn: 1 });

        expect(screen.queryByText(/Week \d+/)).not.toBeInTheDocument();
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

    it('puts done cards under a collapsed Done toggle after the open ones', () => {
        renderColumn({
            day: dayWith([
                planItem('done', 1, { occurrence_done: true }),
                planItem('open', 2),
            ]),
        });

        const toggle = screen.getByRole('button', { name: 'Done (1)' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(cardTitles()).toEqual(['Task open']);

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(cardTitles()).toEqual(['Task open', 'Task done']);
    });

    it('keeps done cards last whatever the grouping and sorting', () => {
        renderColumn({
            groupBy: 'project',
            sortBy: 'name',
            day: dayWith([
                planItem('done', 1, {
                    occurrence_done: true,
                    task: task('done', 'Aaa', {
                        Project: { name: 'A' } as Task['Project'],
                    }),
                }),
                planItem('open', 2, {
                    task: task('open', 'Zzz', {
                        Project: { name: 'Z' } as Task['Project'],
                    }),
                }),
            ]),
        });

        fireEvent.click(screen.getByRole('button', { name: 'Done (1)' }));

        expect(cardTitles()).toEqual(['Zzz', 'Aaa']);
    });

    it('shows no Done toggle when there is nothing done', () => {
        renderColumn({ day: dayWith([planItem('open', 1)]) });

        expect(
            screen.queryByRole('button', { name: /Done/ })
        ).not.toBeInTheDocument();
    });

    it('shows the planned load of the open cards against the available time', () => {
        renderColumn({
            availableMinutes: 480,
            day: dayWith([
                planItem('a', 1, { duration_minutes: 190 }),
                planItem('b', 2, {
                    duration_minutes: 60,
                    occurrence_done: true,
                }),
            ]),
        });

        expect(screen.getByTestId('upcoming-load')).toHaveTextContent(
            `${formatDuration(190)} / ${formatDuration(480)}`
        );
        expect(screen.getByTestId('upcoming-load')).toHaveAttribute(
            'data-over',
            'false'
        );
    });

    it('marks the load in the danger colour when it is over the available time', () => {
        renderColumn({
            availableMinutes: 660,
            day: dayWith([planItem('a', 1, { duration_minutes: 705 })]),
        });

        const load = screen.getByTestId('upcoming-load');
        expect(load).toHaveTextContent(
            `${formatDuration(705)} / ${formatDuration(660)}`
        );
        expect(load).toHaveAttribute('data-over', 'true');
        expect(load).toHaveClass(
            'bg-danger-container',
            'text-danger-on-container'
        );
    });

    it('keeps the header to two lines: no truncation, the load never wraps', () => {
        renderColumn({
            availableMinutes: 660,
            day: dayWith([planItem('a', 1, { duration_minutes: 705 })]),
        });

        expect(screen.getByRole('heading', { name: 'Today' })).not.toHaveClass(
            'truncate'
        );
        expect(screen.getByText('Thu, Nov 12')).not.toHaveClass('truncate');
        expect(screen.getByTestId('upcoming-load')).toHaveClass(
            'whitespace-nowrap',
            'tabular-nums'
        );
    });

    it('shows the selected column with a token that reads in both themes', () => {
        renderColumn({ selected: true });

        const column = screen.getByTestId('upcoming-column');
        expect(column).not.toHaveClass('bg-surface-high/40');
        expect(column).toHaveClass('ring-1', 'ring-primary/40');
    });

    it('keeps the add draft when onAdd resolves to false', async () => {
        const onAdd = jest.fn().mockResolvedValue(false);
        renderColumn({ onAdd });
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: 'Keep me' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        await waitFor(() => expect(onAdd).toHaveBeenCalledWith(DAY, 'Keep me'));
        await act(async () => undefined);
        expect(input).toHaveValue('Keep me');
    });

    it('clears the add draft when onAdd resolves to true', async () => {
        const onAdd = jest.fn().mockResolvedValue(true);
        renderColumn({ onAdd });
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: 'Done' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        await waitFor(() => expect(input).toHaveValue(''));
    });

    it('counts a void onAdd as success and clears the draft', () => {
        renderColumn({ onAdd: jest.fn() });
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: 'Plain' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(input).toHaveValue('');
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

        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );

        expect(
            screen.getByRole('textbox', { name: 'Add a task' })
        ).toBeInTheDocument();
    });

    it('opens the add field from the + of its header', () => {
        renderColumn();
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        expect(screen.getByLabelText('Add a task')).toHaveFocus();
    });

    it('opens the add field above the cards, with no second add button', () => {
        renderColumn({ day: dayWith([planItem('a', 1)]) });

        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });
        const card = screen.getByTestId('upcoming-card');

        expect(input.compareDocumentPosition(card)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
        expect(
            screen.queryByRole('button', { name: 'Add a task' })
        ).not.toBeInTheDocument();
    });

    it('adds a task with its trimmed name and clears the field', () => {
        const h = renderColumn();
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: '  Water the plants  ' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(h.onAdd).toHaveBeenCalledWith(DAY, 'Water the plants');
        expect(input).toHaveValue('');
    });

    it('ignores a blank name', () => {
        const h = renderColumn();
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );
        const input = screen.getByRole('textbox', { name: 'Add a task' });

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);

        expect(h.onAdd).not.toHaveBeenCalled();
    });

    it('hides the add field on Escape', () => {
        renderColumn();
        fireEvent.click(
            screen.getByRole('button', { name: /^Add a task to / })
        );

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

    it('lists a subtask only on its own card when that card is in the column', () => {
        const parent = task('p', 'Parent task', {
            subtasks: [task('c', 'Child step')],
        });
        renderColumn({
            day: dayWith([
                planItem('p', 1, { task: parent }),
                planItem('c', 2, { task: task('c', 'Child step') }),
            ]),
        });

        const [parentCard] = screen.getAllByTestId('upcoming-card');
        expect(
            within(parentCard).queryByText('Child step')
        ).not.toBeInTheDocument();
        expect(cardTitles()).toEqual(['Parent task', 'Child step']);
    });

    it('names the parent on a subtask card and files it under the parent project', () => {
        renderColumn({
            groupBy: 'project',
            day: dayWith([
                planItem('p', 1, {
                    task: task('p', 'Parent task', {
                        Project: { name: 'Work' } as Task['Project'],
                        subtasks: [task('c', 'Child step')],
                    }),
                }),
                planItem('c', 2, {
                    task: task('c', 'Child step', {
                        parent_task: { id: 1, uid: 'p', name: 'Parent task' },
                    }),
                }),
            ]),
        });

        expect(screen.getByText('↳ Parent task')).toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'No project' })
        ).not.toBeInTheDocument();
        expect(
            within(screen.getByRole('group', { name: 'Work' })).getAllByTestId(
                'upcoming-card'
            )
        ).toHaveLength(2);
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
