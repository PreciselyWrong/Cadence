import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
                {...extra}
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
                today="2026-09-25"
            />
        </MemoryRouter>
    );

describe('CandidateList', () => {
    it('labels cards due on another day "Due that day", not "Due today"', () => {
        renderList(candidates, { isToday: false, dayLabel: 'Friday' });
        expect(screen.queryByText(/Due today/)).not.toBeInTheDocument();
        expect(screen.getAllByText(/Due that day/).length).toBeGreaterThan(0);
    });

    it('shows overdue, due today, in progress, then the rest', () => {
        renderList();
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

    it('follows the ranking order from the server', () => {
        renderList({
            ...candidates,
            ranked: ['t-idea', 't-late', 't-started', 't-today'],
        });
        const names = screen
            .getAllByTestId(/^candidate-open-/)
            .map((link) => link.textContent);
        expect(names).toEqual([
            'Sort photos',
            'Renew insurance',
            'Draft report',
            'Pay rent',
        ]);
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
});
