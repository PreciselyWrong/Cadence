import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProjectItem from '../ProjectItem';
import { Project } from '../../../entities/Project';
import { listShares } from '../../../utils/sharesService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string'
                ? fallback
                : (fallback?.defaultValue ?? key),
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast: jest.fn() }),
}));

jest.mock('../../../utils/sharesService', () => ({
    listShares: jest.fn(),
}));

const renderCard = (project: Project) =>
    render(
        <MemoryRouter>
            <ProjectItem
                project={project}
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

describe('ProjectItem list row', () => {
    beforeEach(() => {
        (listShares as jest.Mock).mockResolvedValue([]);
    });

    it('keeps the colored icon when the project has a banner image', async () => {
        const { container } = render(
            <MemoryRouter>
                <ProjectItem
                    project={{
                        uid: 'with-banner',
                        name: 'With banner',
                        image_url: '/api/uploads/projects/banner.jpg',
                        icon: 'code',
                        color: '#1d4ed8',
                    }}
                    viewMode="list"
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

        expect(await screen.findByText('With banner')).toBeInTheDocument();
        expect(container.querySelector('img')).toBeNull();
        const icon = container.querySelector('a span[style] svg');
        expect(icon).not.toBeNull();
        expect((icon?.parentElement as HTMLElement).style.color).toBe(
            'rgb(29, 78, 216)'
        );
    });
});

describe('ProjectItem shares', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (listShares as jest.Mock).mockResolvedValue([]);
    });

    it('does not ask for the shares of a project the viewer cannot manage', async () => {
        renderCard({
            uid: 'member-only',
            name: 'Not mine',
            is_shared: true,
            can_share: false,
        });

        expect(await screen.findByText('Not mine')).toBeInTheDocument();
        expect(listShares).not.toHaveBeenCalled();
    });

    it('asks for the shares when the viewer may manage them', async () => {
        renderCard({
            uid: 'mine',
            name: 'Mine',
            is_shared: true,
            can_share: true,
        });

        await waitFor(() =>
            expect(listShares).toHaveBeenCalledWith('project', 'mine')
        );
    });
});
