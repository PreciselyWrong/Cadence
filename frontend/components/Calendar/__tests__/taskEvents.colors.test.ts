import { PALETTE } from '../../../constants/colorPalette';
import { blockFill } from '../../Shared/task/blockFill';
import {
    CalendarTask,
    HABIT_COLOR,
    taskColor,
    taskToEvents,
} from '../taskEvents';

const paletteValue = (key: string) => PALETTE.find((c) => c.key === key)?.value;
const paletteValues = PALETTE.map((c) => c.value);

const task: CalendarTask = {
    id: 1,
    name: 'Write report',
    due_date: '2026-11-12',
    due_time: '10:00',
    priority: 'high',
};

describe('calendar block colours', () => {
    it('leaves a block without colour-by to the token fill, not blue', () => {
        expect(taskColor(task)).toBeUndefined();
        expect(taskToEvents(task)[0].color).toBeUndefined();
    });

    it('takes priority colours from the palette', () => {
        expect(taskColor({ ...task, priority: 'high' }, 'priority')).toBe(
            paletteValue('red')
        );
        expect(taskColor({ ...task, priority: 'medium' }, 'priority')).toBe(
            paletteValue('orange')
        );
        expect(taskColor({ ...task, priority: 'low' }, 'priority')).toBe(
            paletteValue('blue')
        );
        expect(taskColor({ ...task, priority: 2 }, 'priority')).toBe(
            paletteValue('red')
        );
    });

    it('draws finished tasks green and faded', () => {
        const done = { ...task, completed_at: '2026-11-12T09:00:00Z' };
        expect(taskColor(done, 'priority')).toBe(paletteValue('green'));
        expect(taskToEvents(done)[0]).toMatchObject({ done: true });
        expect(taskToEvents(task)[0]).toMatchObject({ done: false });
    });

    it('uses only palette values for automatic colours', () => {
        const projectTask = {
            ...task,
            Project: { id: 9, name: 'Home' },
            tags: [{ name: 'errand' }],
        };
        const automatic = [
            taskColor(projectTask, 'project'),
            taskColor({ ...projectTask, Project: null }, 'project'),
            taskColor(projectTask, 'tag'),
            taskColor({ ...task, tags: [] }, 'tag'),
            taskColor({ ...task, priority: null }, 'priority'),
        ];
        automatic.forEach((color) => expect(paletteValues).toContain(color));
    });

    it('keeps a project or tag colour the user chose', () => {
        expect(
            taskColor(
                { ...task, Project: { id: 3, name: 'x', color: '#123456' } },
                'project'
            )
        ).toBe('#123456');
    });

    it('draws habit days in the palette purple', () => {
        expect(HABIT_COLOR).toBe(paletteValue('purple'));
    });
});

describe('blockFill', () => {
    it('flat fill for a 6-digit hex colour, as DayCalendar does', () => {
        expect(blockFill('#b91c1c')).toBe(
            'color-mix(in srgb, #b91c1c var(--block-mix), transparent)'
        );
    });

    it('no fill without a usable colour', () => {
        expect(blockFill(undefined)).toBeUndefined();
        expect(blockFill(null)).toBeUndefined();
        expect(blockFill('')).toBeUndefined();
        expect(blockFill('red')).toBeUndefined();
        expect(blockFill('#abc')).toBeUndefined();
    });
});
