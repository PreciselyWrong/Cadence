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

describe('ProjectItem next action', () => {
    const next = { uid: 't1', name: 'Call the printer' };

    it.each(['cards', 'list'] as const)(
        'shows the designated next action in %s view',
        (viewMode) => {
            renderItem({ next_task: next }, viewMode);

            expect(
                screen.getByTestId('project-next-action-1')
            ).toHaveTextContent('Next action: Call the printer');
        }
    );

    it.each(['cards', 'list'] as const)(
        'shows nothing without a designated next action in %s view',
        (viewMode) => {
            renderItem({ next_task: null }, viewMode);

            expect(screen.queryByTestId('project-next-action-1')).toBeNull();
        }
    );
});
