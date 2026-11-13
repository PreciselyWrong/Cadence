import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { addDays, format, parseISO } from 'date-fns';
import TaskChipRow from '../TaskChipRow';
import { Task } from '../../../entities/Task';
import { toYmd } from '../../../utils/datePresets';
import { monthStartOf, weekStartOf } from '../../Upcoming/horizons';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, d: string) => d,
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    getTodayDateString: () => '2030-03-15',
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: () => Promise.resolve(1),
    getLocaleFirstDayOfWeek: () => 1,
}));

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (s: any) => unknown) =>
        selector({
            projectsStore: {
                projects: [{ id: 7, name: 'Garden', color: '#15803d' }],
            },
            areasStore: { areas: [] },
            tagsStore: { tags: [] },
        }),
}));

const noop = () => undefined;
const today = toYmd(new Date());
const lastWeek = format(
    addDays(parseISO(weekStartOf(today, 1)), -7),
    'yyyy-MM-dd'
);

const renderRow = (
    task: Partial<Task>,
    onHorizon: jest.Mock | null = jest.fn(),
    onDue = jest.fn()
) =>
    render(
        <TaskChipRow
            task={{ id: 1, uid: 'u1', name: 'A', status: 0, ...task } as Task}
            people={[]}
            onDue={onDue}
            onHorizon={onHorizon ?? undefined}
            onStart={noop}
            onDefer={noop}
            onReminder={noop}
            onPriority={noop}
            onProject={noop}
            onArea={noop}
            onTags={noop}
            onStatus={noop}
            onRecurrence={noop}
            onEstimate={noop}
            onAssignee={noop}
        />
    );

describe('TaskChipRow due chip horizons', () => {
    it('offers the horizons instead of the next-week quick choice', () => {
        const onHorizon = jest.fn();
        renderRow({}, onHorizon);
        fireEvent.click(screen.getByTestId('chip-due'));
        const row = screen.getByTestId('date-popover-horizons');
        const quick = screen.getByRole('group', { name: 'Quick choices' });
        expect(within(quick).queryByText('Next week')).not.toBeInTheDocument();
        expect(within(row).getByText('Next week')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('date-horizon-next_month'));
        expect(onHorizon).toHaveBeenCalledWith('next_month', null);
    });

    it('passes the current commitment when another horizon is picked', () => {
        const onHorizon = jest.fn();
        renderRow({ tags: [{ name: 'someday' }] } as Partial<Task>, onHorizon);
        expect(screen.getByTestId('chip-due')).toHaveTextContent('Someday');
        fireEvent.click(screen.getByTestId('chip-due'));
        expect(screen.getByTestId('date-horizon-someday')).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        fireEvent.click(screen.getByTestId('date-horizon-week'));
        expect(onHorizon).toHaveBeenCalledWith('week', 'someday');
    });

    it('labels a dateless task by its horizon, in violet', () => {
        renderRow({ month_of: monthStartOf(today, 1) } as Partial<Task>);
        const chip = screen.getByTestId('chip-due');
        expect(chip).toHaveTextContent('Next month');
        expect(chip).toHaveAttribute('data-tone', 'horizon');
    });

    it('says To replan, in red, once the week has passed', () => {
        renderRow({ week_of: lastWeek } as Partial<Task>);
        const chip = screen.getByTestId('chip-due');
        expect(chip).toHaveTextContent('To replan');
        expect(chip).toHaveAttribute('data-tone', 'danger');
    });

    it('keeps the date pickers without horizons elsewhere', () => {
        renderRow({}, null);
        fireEvent.click(screen.getByTestId('chip-due'));
        expect(
            screen.queryByTestId('date-popover-horizons')
        ).not.toBeInTheDocument();
        expect(screen.getByText('Next week')).toBeInTheDocument();
    });
});

describe('TaskChipRow colours', () => {
    it('colours each filled chip by what it holds', () => {
        renderRow({
            due_date: today,
            priority: 'high',
            project_id: 7,
        } as Partial<Task>);
        expect(screen.getByTestId('chip-due')).toHaveAttribute(
            'data-tone',
            'success'
        );
        expect(screen.getByTestId('chip-priority')).toHaveAttribute(
            'data-tone',
            'danger'
        );
        const project = screen.getByTestId('chip-project');
        expect(project).toHaveAttribute('data-tone', 'color');
        expect(project.style.getPropertyValue('--accent-light')).toBe(
            '#15803d'
        );
    });

    it('keeps an empty chip grey', () => {
        renderRow({});
        expect(screen.getByTestId('chip-project')).toHaveAttribute(
            'data-tone',
            'empty'
        );
    });
});
