import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectHero from '../ProjectHero';
import { Project } from '../../../entities/Project';

const t = ((
    key: string,
    fallback?: string,
    values?: Record<string, string | number>
) =>
    (fallback ?? key).replace(/{{(\w+)}}/g, (_m, name) =>
        String(values?.[name] ?? '')
    )) as never;

const renderHero = (project: Partial<Project> = {}, onTogglePin = jest.fn()) =>
    render(
        <ProjectHero
            project={{
                uid: 'p1',
                name: 'Launch',
                status: 'in_progress',
                ...project,
            }}
            areas={[]}
            t={t}
            doneCount={1}
            totalCount={4}
            onUpdate={jest.fn().mockResolvedValue(undefined)}
            onDeleteClick={jest.fn()}
            onShareClick={jest.fn()}
            onTogglePin={onTogglePin}
        />
    );

describe('ProjectHero declutter', () => {
    it('shows a past due date like any other date, without red', () => {
        renderHero({ due_date_at: '2020-03-01T12:00:00.000Z' });

        const due = screen.getByText(/^Due /);
        expect(due.className).not.toMatch(/red/);
    });

    it('keeps Pin in the "…" menu, not in the action row', () => {
        const onTogglePin = jest.fn();
        renderHero({}, onTogglePin);

        expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'More options' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pin' }));

        expect(onTogglePin).toHaveBeenCalled();
    });
});
