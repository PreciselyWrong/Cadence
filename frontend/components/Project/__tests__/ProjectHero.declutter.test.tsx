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

const renderHero = (
    project: Partial<Project> = {},
    onTogglePin = jest.fn(),
    counts = { done: 1, total: 4 },
    onShareClick = jest.fn()
) =>
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
            doneCount={counts.done}
            totalCount={counts.total}
            onUpdate={jest.fn().mockResolvedValue(undefined)}
            onDeleteClick={jest.fn()}
            onShareClick={onShareClick}
            onTogglePin={onTogglePin}
        />
    );

describe('ProjectHero declutter', () => {
    it('shows the image as a wide banner and keeps the colored icon', () => {
        const { container } = renderHero({
            image_url: '/api/uploads/projects/banner.jpg',
            icon: 'code',
            color: '#1d4ed8',
        });

        const banner = screen.getByTestId('project-banner');
        expect(banner.querySelector('img')?.getAttribute('src')).toContain(
            '/api/uploads/projects/banner.jpg'
        );
        const iconButton = screen.getByRole('button', {
            name: 'Project image',
        });
        expect(iconButton.querySelector('img')).toBeNull();
        expect(iconButton.querySelector('svg')).not.toBeNull();
        expect(container.querySelectorAll('img')).toHaveLength(1);
    });

    it('has no banner without an image', () => {
        renderHero({ icon: 'code' });

        expect(screen.queryByTestId('project-banner')).toBeNull();
    });

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

    it('keeps Share in the "…" menu, not in the action row', () => {
        const onShareClick = jest.fn();
        renderHero({}, jest.fn(), { done: 1, total: 4 }, onShareClick);

        expect(screen.queryAllByRole('button', { name: /Share/ })).toHaveLength(
            0
        );
        fireEvent.click(screen.getByRole('button', { name: 'More options' }));
        fireEvent.click(screen.getByRole('button', { name: /Share/ }));

        expect(onShareClick).toHaveBeenCalled();
    });

    it('shows no progress bar before a first task is done', () => {
        renderHero({}, jest.fn(), { done: 0, total: 2 });
        expect(screen.queryByText(/Project progress/)).toBeNull();
    });

    it('shows the progress once a task is done', () => {
        renderHero({}, jest.fn(), { done: 1, total: 2 });
        expect(screen.getByText(/Project progress/)).toBeInTheDocument();
    });

    it('says nothing about a start date already behind, only a coming one', () => {
        const { unmount } = renderHero({ start_date: '2020-01-10' });
        expect(screen.queryByText(/Started/)).toBeNull();
        unmount();

        renderHero({ start_date: '2999-01-10' });
        expect(screen.getByText(/Starts/)).toBeInTheDocument();
    });
});
