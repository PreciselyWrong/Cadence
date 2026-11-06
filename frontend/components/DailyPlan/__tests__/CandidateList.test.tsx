import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import CandidateList from '../CandidateList';
import { PlanCandidates } from '../../../utils/dailyPlanService';
import { useTaskPanel } from '../../../store/taskPanelStore';

jest.mock('react-i18next', () => {
    const t = (
        _key: string,
        fallback: string | Record<string, unknown>,
        values?: Record<string, unknown>
    ) => {
        const options = typeof fallback === 'object' ? fallback : values;
        const text =
            typeof fallback === 'string'
                ? fallback
                : String(fallback?.defaultValue ?? _key);
        return text.replace(/{{(\w+)}}/g, (_m, name) =>
            String(options?.[name] ?? '')
        );
    };
    const value = { t, i18n: { language: 'en' } };
    return { useTranslation: () => value };
});

const task = (uid: string, name: string, extra = {}) =>
    ({ uid, name, status: 'not_started', ...extra }) as any;

const candidates: PlanCandidates = {
    tagged_today: [],
    overdue: [task('t-late', 'Renew insurance', { due_date: '2026-09-20' })],
    due_today: [task('t-today', 'Pay rent')],
    in_progress: [task('t-started', 'Draft report')],
    suggested: [task('t-idea', 'Sort photos')],
    inbox: [],
    inbox_count: 0,
};

const renderList = (
    list: PlanCandidates = candidates,
    extra: Partial<React.ComponentProps<typeof CandidateList>> = {}
) =>
    render(
        <MemoryRouter initialEntries={['/today']}>
            <CandidateList
                candidates={list}
                planned={new Map()}
                filter="all"
                onFilterChange={jest.fn()}
                durations={{}}
                onDurationChange={jest.fn()}
                onAdd={jest.fn()}
                onComplete={jest.fn()}
                onRemove={jest.fn()}
                onReschedule={jest.fn()}
                onDrop={jest.fn()}
                onAddInbox={jest.fn()}
                {...extra}
            />
        </MemoryRouter>
    );

const openSuggestions = () =>
    fireEvent.click(screen.getByRole('button', { name: /^Suggested \d+$/ }));

describe('CandidateList', () => {
    it('labels cards due on another day "Due that day", not "Due today"', () => {
        renderList(candidates, { isToday: false, dayLabel: 'Friday' });
        expect(screen.queryByText(/Due today/)).not.toBeInTheDocument();
        expect(screen.getAllByText(/Due that day/).length).toBeGreaterThan(0);
    });

    it('marks a past due date without red and keeps long tags from crowding the name', () => {
        renderList({
            ...candidates,
            overdue: [
                task('t-late', 'Renew insurance', {
                    due_date: '2026-09-20',
                    tags: [
                        { name: 'perso/sport/course/trail/ultra/utmb' },
                        { name: 'travail/client-12' },
                    ],
                }),
            ],
        });
        const card = screen.getByTestId('candidate-t-late');
        expect(card.innerHTML).not.toMatch(/bg-red-/);
        expect(within(card).getByTestId('task-tag-chips').className).toMatch(
            /max-w-/
        );
    });

    it('shows overdue, due today, in progress, then the rest', () => {
        renderList();
        openSuggestions();
        const names = screen
            .getAllByTestId(/^candidate-open-/)
            .map((link) => link.textContent);
        expect(names).toEqual([
            'Renew insurance',
            'Pay rent',
            'Draft report',
            'Sort photos',
        ]);
    });

    it('keeps a task due today quiet on Today: no "Due today", no default length', () => {
        renderList();
        expect(screen.queryByTestId('candidate-meta-t-today')).toBeNull();
        expect(
            screen.getByTestId('candidate-meta-t-started')
        ).toHaveTextContent('In progress');
        expect(
            screen.getByTestId('candidate-meta-t-started')
        ).not.toHaveTextContent('30');
    });

    it('shows a length the task carries itself', () => {
        renderList({
            ...candidates,
            due_today: [task('t-today', 'Pay rent', { estimated_minutes: 45 })],
        });
        expect(screen.getByTestId('candidate-meta-t-today')).toHaveTextContent(
            '45m'
        );
    });

    it('keeps the add button for hover or focus when a mouse is there', () => {
        renderList();
        expect(screen.getByTestId('add-t-today').className).toMatch(
            /\[@media\(hover:hover\)\]:opacity-0/
        );
    });

    it('says since when an overdue task is due, without counting days late', () => {
        renderList();
        expect(screen.getByText(/Due Sep 20/)).toBeInTheDocument();
        expect(screen.queryByText(/overdue|late|\d+d\b/i)).toBeNull();
    });

    it('follows the ranking order from the server', () => {
        renderList({
            ...candidates,
            ranked: ['t-idea', 't-late', 't-started', 't-today'],
        });
        const names = screen
            .getAllByTestId(/^candidate-open-/)
            .map((link) => link.textContent);
        expect(names).toEqual(['Renew insurance', 'Draft report', 'Pay rent']);
    });

    it('puts tasks tagged #today first, labelled as such', () => {
        renderList({
            ...candidates,
            tagged_today: [task('t-tagged', 'Call the bank')],
        });
        const names = screen
            .getAllByTestId(/^candidate-open-/)
            .map((link) => link.textContent);
        expect(names[0]).toBe('Call the bank');
        expect(screen.getByTestId('candidate-t-tagged')).toHaveTextContent(
            'Tagged #today'
        );
    });

    it('lists every candidate at once, with no Show more step', () => {
        const suggested = Array.from({ length: 8 }, (_, i) =>
            task(`t-s${i}`, `Idea ${i}`)
        );
        const all = { ...candidates, suggested, suggested_total: 30 };
        renderList(all);
        openSuggestions();
        const loaded =
            all.tagged_today.length +
            all.overdue.length +
            all.due_today.length +
            (all.in_progress?.length ?? 0) +
            suggested.length;
        expect(screen.getAllByTestId(/^candidate-open-/)).toHaveLength(loaded);
        expect(
            screen.queryByTestId('candidates-show-more')
        ).not.toBeInTheDocument();
    });

    it('opens the task in the side panel when its name is clicked', () => {
        renderList();
        fireEvent.click(
            screen.getByRole('button', { name: 'Renew insurance' })
        );
        expect(useTaskPanel.getState().uid).toBe('t-late');
    });

    // Touch screens have no hover: lengths and reschedule actions open on
    // demand, one card at a time, instead of on every card.
    it('keeps a card folded until its options are opened', () => {
        renderList();
        const card = screen.getByTestId('candidate-t-late');
        const toggle = within(card).getByRole('button', {
            name: 'More options',
        });
        const options = within(card).getByTestId('candidate-options-t-late');

        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(options).toHaveAttribute('data-open', 'false');

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(options).toHaveAttribute('data-open', 'true');
        expect(screen.getByTestId('candidate-options-t-today')).toHaveAttribute(
            'data-open',
            'false'
        );
    });

    it('shows no filter with a zero count', () => {
        renderList();
        fireEvent.click(screen.getByRole('button', { name: /Browse/ }));

        const pills = screen.getAllByRole('tab').map((tab) => tab.textContent);
        expect(pills).not.toContain('Inbox 0');
        expect(pills.some((label) => /\b0$/.test(label ?? ''))).toBe(false);
    });

    it('drops the count of an empty list from its pill', () => {
        renderList({
            ...candidates,
            overdue: [],
            due_today: [],
            in_progress: [],
            suggested: [],
        });
        fireEvent.click(screen.getByRole('button', { name: /Browse/ }));

        expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    });

    describe('the rest of the week, folded under the day', () => {
        const thisWeek = () => {
            const monday = new Date();
            monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
            return [
                monday.getFullYear(),
                String(monday.getMonth() + 1).padStart(2, '0'),
                String(monday.getDate()).padStart(2, '0'),
            ].join('-');
        };
        const list = (): PlanCandidates => ({
            ...candidates,
            suggested: [
                task('t-idea', 'Sort photos'),
                { ...task('t-view', 'Chosen one'), in_view: true } as never,
                {
                    ...task('t-week', 'For this week'),
                    week_of: thisWeek(),
                } as never,
            ],
            tomorrow: [task('t-next', 'Due next')],
        });

        it('shows only the day until a section is opened', () => {
            renderList(list());
            for (const name of [
                'Sort photos',
                'Chosen one',
                'For this week',
                'Due next',
            ]) {
                expect(screen.queryByText(name)).toBeNull();
            }
            expect(screen.getByText('Pay rent')).toBeInTheDocument();
        });

        it('opens one section at a time, each with its count', () => {
            renderList(list());
            for (const [section, name] of [
                ['Tomorrow 1', 'Due next'],
                ['This week 1', 'For this week'],
                ['In view 1', 'Chosen one'],
                ['Suggested 1', 'Sort photos'],
            ]) {
                fireEvent.click(screen.getByRole('button', { name: section }));
                expect(screen.getByText(name)).toBeInTheDocument();
            }
        });

        it('leaves out a section with nothing in it', () => {
            renderList({ ...candidates, suggested: [], tomorrow: [] });
            expect(
                screen.queryByRole('button', { name: /^Tomorrow \d+$/ })
            ).toBeNull();
            expect(
                screen.queryByRole('button', { name: /^In view \d+$/ })
            ).toBeNull();
        });

        it('takes a planned task out of its section', () => {
            renderList(list(), {
                planned: new Map([['t-next', {} as never]]),
            });
            expect(
                screen.queryByRole('button', { name: /^Tomorrow \d+$/ })
            ).toBeNull();
        });

        it('says the day is clear while the sections stay there', () => {
            renderList({
                ...list(),
                overdue: [],
                due_today: [],
                in_progress: [],
                tagged_today: [],
            });
            expect(screen.getByText('Nothing here. Nice.')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Tomorrow 1' })
            ).toBeInTheDocument();
        });

        it('shows everything at once under the Suggested filter', () => {
            renderList(list(), { filter: 'suggested' });
            expect(screen.getByText('Sort photos')).toBeInTheDocument();
            expect(screen.getByText('Chosen one')).toBeInTheDocument();
        });
    });
});
