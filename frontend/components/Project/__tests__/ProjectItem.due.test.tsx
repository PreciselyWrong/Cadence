import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProjectItem from '../ProjectItem';
import { Project } from '../../../entities/Project';

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

const renderItem = (project: Partial<Project>, viewMode: 'cards' | 'list') =>
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
                viewMode={viewMode}
                getCompletionPercentage={() => 25}
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

// A project card says nothing about a missing date, and a passed date is
// shown as a date, never as a count of days late.
describe('ProjectItem due line', () => {
    it.each(['cards', 'list'] as const)(
        'shows no due text without a due date in %s view',
        (viewMode) => {
            renderItem({ due_date_at: null }, viewMode);

            expect(screen.queryByText('No due date')).toBeNull();
        }
    );

    it.each(['cards', 'list'] as const)(
        'shows the date of a passed due date in %s view',
        (viewMode) => {
            renderItem({ due_date_at: '2026-09-20T12:00:00Z' }, viewMode);

            expect(screen.queryByText(/ago/)).toBeNull();
            expect(screen.getAllByText(/^Due /).length).toBeGreaterThan(0);
        }
    );
});
