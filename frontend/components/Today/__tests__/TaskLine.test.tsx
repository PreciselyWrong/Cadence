import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskLine from '../TaskLine';
import { DayLine } from '../dayModel';
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

// react-markdown is ESM and never runs under Jest: the stand-in renders
// bold the way the real renderer does, so the wiring is what is checked.
jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content, summaryMode }: any) => (
        <div data-testid="markdown" data-summary={String(!!summaryMode)}>
            {content
                .split(/(\*\*[^*]+\*\*)/)
                .map((part: string, i: number) =>
                    /^\*\*.*\*\*$/.test(part) ? (
                        <strong key={i}>{part.slice(2, -2)}</strong>
                    ) : (
                        part
                    )
                )}
        </div>
    ),
}));

const DATE = '2026-11-12';

const task = (fields: Partial<Task> = {}): Task =>
    ({
        uid: 't1',
        name: 'Relire la PR',
        status: 0,
        ...fields,
    }) as Task;

const line = (fields: Partial<DayLine> = {}): DayLine => ({
    uid: 't1',
    task: task(),
    planned: true,
    start: null,
    dueMinute: null,
    duration: 45,
    durationKnown: true,
    done: false,
    ...fields,
});

const menu = () => ({
    onToggle: jest.fn(),
    onOpen: jest.fn(),
    tomorrow: jest.fn(),
    plan: jest.fn(),
    unslot: jest.fn(),
});

const renderLine = (
    fields: Partial<DayLine> = {},
    taskFields: Partial<Task> = {},
    spies = menu()
) => {
    const current = line({ ...fields, task: task(taskFields) });
    render(
        <TaskLine
            line={current}
            dateOfDay={DATE}
            onToggle={spies.onToggle}
            onOpen={spies.onOpen}
            menu={[
                {
                    key: 'tomorrow',
                    label: 'Tomorrow',
                    onSelect: spies.tomorrow,
                },
                { key: 'plan', label: 'Schedule', onSelect: spies.plan },
                { key: 'unslot', label: 'Remove slot', onSelect: spies.unslot },
            ]}
        />
    );
    return { row: screen.getByRole('listitem'), spies, current };
};

describe('TaskLine keyboard', () => {
    it('Space toggles and Enter opens the line', () => {
        const { row, spies, current } = renderLine();
        fireEvent.keyDown(row, { key: ' ' });
        expect(spies.onToggle).toHaveBeenCalledWith(current);
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(spies.onOpen).toHaveBeenCalledWith(current);
    });

    it('D runs the tomorrow entry and T the plan entry', () => {
        const { row, spies } = renderLine();
        fireEvent.keyDown(row, { key: 'd' });
        expect(spies.tomorrow).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(row, { key: 'T' });
        expect(spies.plan).toHaveBeenCalledTimes(1);
    });

    it('Delete removes the slot when the line has one', () => {
        const { row, spies } = renderLine();
        fireEvent.keyDown(row, { key: 'Delete' });
        expect(spies.unslot).toHaveBeenCalledTimes(1);
    });
});

describe('TaskLine meta', () => {
    it('hides the duration when it is only a guess', () => {
        renderLine({ durationKnown: false, duration: 30 });
        expect(screen.queryByText('30m')).not.toBeInTheDocument();
    });

    it('shows a known duration', () => {
        renderLine({ durationKnown: true, duration: 45 });
        expect(screen.getByText('45m')).toBeInTheDocument();
    });

    it('shows the due date when it is not the day of the list', () => {
        renderLine({}, { due_date: '2026-11-20' });
        expect(screen.getByText(/Nov 20/)).toBeInTheDocument();
    });

    it('hides the due date that is the day itself', () => {
        renderLine({}, { due_date: DATE });
        expect(screen.queryByText(/Nov/)).not.toBeInTheDocument();
    });

    it('shows the time in the time column for a due-only line', () => {
        renderLine({ start: null, dueMinute: 15 * 60 + 30 });
        // Hour large, minutes raised: read as one label.
        expect(screen.getByLabelText('15:30')).toBeInTheDocument();
    });

    it('renders the note as Markdown in summary mode, never raw', async () => {
        const current = line({ task: task({ note: 'Une note **markdown**' }) });
        render(
            <TaskLine
                line={current}
                dateOfDay={DATE}
                onToggle={jest.fn()}
                onOpen={jest.fn()}
                menu={[]}
                expanded
            />
        );
        const md = await screen.findByTestId('markdown');
        expect(md).toHaveAttribute('data-summary', 'true');
        expect(md.querySelector('strong')).toHaveTextContent('markdown');
        expect(screen.getByTestId('task-line')).not.toHaveTextContent('**');
    });

    it('a click on a link in the note does not open the task', async () => {
        const onOpen = jest.fn();
        const current = line({ task: task({ note: 'see' }) });
        render(
            <TaskLine
                line={current}
                dateOfDay={DATE}
                onToggle={jest.fn()}
                onOpen={onOpen}
                menu={[]}
                expanded
            />
        );
        const md = await screen.findByTestId('markdown');
        const link = document.createElement('a');
        link.textContent = 'link';
        md.appendChild(link);
        fireEvent.click(link);
        expect(onOpen).not.toHaveBeenCalled();
    });
});
