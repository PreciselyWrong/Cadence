import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProjectItem from '../ProjectItem';
import { Project, ProjectTaskStatus } from '../../../entities/Project';

jest.mock('../../../utils/sharesService', () => ({
    listShares: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));
jest.mock('../../../utils/userUtils', () => ({
    getCurrentUser: () => ({ uid: 'u1' }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            key: string,
            fallback?: string,
            values?: Record<string, string | number>
        ) =>
            (typeof fallback === 'string' ? fallback : key).replace(
                /{{(\w+)}}/g,
                (_m, name) => String(values?.[name] ?? '')
            ),
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

const taskCounts = (done: number, total: number): ProjectTaskStatus => ({
    done,
    total,
    in_progress: 0,
    not_started: total - done,
});

const renderCard = (project: Partial<Project>) =>
    render(
        <MemoryRouter>
            <ProjectItem
                project={{
                    id: 1,
                    uid: 'p1',
                    name: 'Launch',
                    status: 'in_progress',
                    ...project,
                }}
                viewMode="cards"
                activeDropdown={null}
                setActiveDropdown={jest.fn()}
                handleEditProject={jest.fn()}
                setProjectToDelete={jest.fn()}
                setIsConfirmDialogOpen={jest.fn()}
                onOpenShare={jest.fn()}
                onStatusChange={jest.fn()}
            />
        </MemoryRouter>
    );

// The default status is not news on a card: it stays reachable by icon, but
// its label is not shown. No progress line (subtraction pass, 2026-11-02).
describe('ProjectItem card status and progress', () => {
    it('hides the label of the default in-progress status but keeps the status control', () => {
        renderCard({ status: 'in_progress' });

        expect(screen.queryByText('In Progress')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Change status' })
        ).toBeInTheDocument();
    });

    it('shows the label of a non-default status', () => {
        renderCard({ status: 'planned' });

        expect(screen.getByText('Planned')).toBeInTheDocument();
    });

    it.each([
        ['an empty project', 0, 0],
        ['a project with one task', 0, 1],
        ['a project with several tasks', 1, 4],
    ])('shows no progress for %s', (_label, done, total) => {
        renderCard({ task_status: taskCounts(done, total) });

        expect(screen.queryByText(`${done}/${total}`)).toBeNull();
        expect(screen.queryByRole('progressbar')).toBeNull();
    });
});
