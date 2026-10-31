import React from 'react';
import { render, screen } from '@testing-library/react';
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
    nextAction: { uid?: string; name: string } | null | undefined,
    project: Partial<Project> = {}
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
            doneCount={1}
            totalCount={4}
            onUpdate={jest.fn().mockResolvedValue(undefined)}
            onDeleteClick={jest.fn()}
            onShareClick={jest.fn()}
            nextAction={nextAction}
        />
    );

describe('ProjectHero next action', () => {
    it('shows the next action title', () => {
        renderHero({ uid: 't1', name: 'Call the printer' });

        expect(screen.getByTestId('project-next-action')).toHaveTextContent(
            'Next action: Call the printer'
        );
    });

    it('shows nothing when there is no next action', () => {
        renderHero(null);

        expect(screen.queryByTestId('project-next-action')).toBeNull();
    });

    it('shows nothing on a finished project', () => {
        renderHero({ uid: 't1', name: 'Call the printer' }, { status: 'done' });

        expect(screen.queryByTestId('project-next-action')).toBeNull();
    });
});
