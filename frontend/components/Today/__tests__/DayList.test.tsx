import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayList, { DayListProps } from '../DayList';
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

const DATE = '2026-11-12';

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

const baseProps = (overrides: Partial<DayListProps> = {}): DayListProps => ({
    title: "Aujourd'hui",
    subtitle: 'jeudi 12 novembre',
    summaryText: '2 tâches · 1 h',
    overloaded: false,
    isToday: true,
    onPrev: jest.fn(),
    onNext: jest.fn(),
    onToday: jest.fn(),
    headerMenu: [],
    addField: <input aria-label="Quick add" />,
    lines: { timed: [], anytime: [lineOf('a')], done: [] },
    dateOfDay: DATE,
    lineMenu: () => [],
    onToggle: jest.fn(),
    onOpen: jest.fn(),
    overdue: null,
    suggestions: null,
    emptyText: 'Nothing planned.',
    ...overrides,
});

describe('DayList sections', () => {
    beforeEach(() => window.localStorage.clear());

    it('starts the overdue section closed and opens it on click', () => {
        render(
            <DayList
                {...baseProps({
                    overdue: {
                        count: 2,
                        content: <div>Late task</div>,
                        action: { label: 'Resume today', onClick: jest.fn() },
                    },
                })}
            />
        );
        const head = screen.getByRole('button', { name: /Overdue · 2/ });
        expect(head).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Late task')).not.toBeInTheDocument();

        fireEvent.click(head);
        expect(head).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Late task')).toBeInTheDocument();
        expect(
            JSON.parse(window.localStorage.getItem('today.sections') as string)
        ).toMatchObject({ overdue: true });
    });

    it('keeps the remembered state of a section', () => {
        window.localStorage.setItem(
            'today.sections',
            JSON.stringify({ suggestions: true })
        );
        render(
            <DayList
                {...baseProps({
                    suggestions: { count: 5, content: <div>Idea</div> },
                })}
            />
        );
        expect(
            screen.getByRole('button', { name: /Suggestions · 5/ })
        ).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Idea')).toBeInTheDocument();
    });

    it('keeps done lines behind a closed section', () => {
        render(
            <DayList
                {...baseProps({
                    lines: {
                        timed: [],
                        anytime: [],
                        done: [lineOf('d', { done: true })],
                    },
                })}
            />
        );
        expect(
            screen.getByRole('button', { name: /Done · 1/ })
        ).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Task d')).not.toBeInTheDocument();
    });
});

describe('DayList body', () => {
    beforeEach(() => window.localStorage.clear());

    it('shows the empty text when no line is open', () => {
        render(
            <DayList
                {...baseProps({
                    lines: { timed: [], anytime: [], done: [] },
                })}
            />
        );
        expect(screen.getByText('Nothing planned.')).toBeInTheDocument();
    });

    it('renders timed and anytime lines', () => {
        render(
            <DayList
                {...baseProps({
                    lines: {
                        timed: [lineOf('t', { start: 540, duration: 30 })],
                        anytime: [lineOf('a')],
                        done: [],
                    },
                })}
            />
        );
        expect(screen.getByText('Task t')).toBeInTheDocument();
        expect(screen.getByText('Task a')).toBeInTheDocument();
        expect(screen.queryByText('Nothing planned.')).not.toBeInTheDocument();
    });

    it('runs the slip actions', () => {
        const keep = jest.fn();
        const later = jest.fn();
        render(
            <DayList
                {...baseProps({
                    slip: {
                        title: 'Quarterly review',
                        actions: [
                            { label: 'Shift the rest', onClick: keep },
                            { label: 'Later', onClick: later },
                        ],
                    },
                })}
            />
        );
        expect(screen.getByText('Quarterly review')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Later' }));
        expect(later).toHaveBeenCalledTimes(1);
        expect(keep).not.toHaveBeenCalled();
    });

    it('offers the return to today only away from today', () => {
        const onToday = jest.fn();
        render(<DayList {...baseProps({ isToday: false, onToday })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Today' }));
        expect(onToday).toHaveBeenCalledTimes(1);
    });
});
