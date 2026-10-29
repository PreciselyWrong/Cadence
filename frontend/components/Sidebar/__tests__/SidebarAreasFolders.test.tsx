import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarAreas from '../SidebarAreas';
import { useStore } from '../../../store/useStore';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const area = { id: 1, uid: 'area-home', name: 'Home' } as any;

const projects = [
    {
        id: 10,
        uid: 'p-sink',
        name: 'Fix sink',
        area_id: 1,
        status: 'in_progress',
    },
    {
        id: 11,
        uid: 'p-taxes',
        name: 'Taxes',
        area_id: null,
        status: 'in_progress',
    },
] as any[];

const setup = (uiDensity: 'minimal' | 'dense') => {
    act(() => {
        useStore.setState((state: any) => ({
            userSettingsStore: { ...state.userSettingsStore, uiDensity },
            projectsStore: {
                ...state.projectsStore,
                projects,
                hasLoaded: true,
            },
        }));
    });
    return render(
        <SidebarAreas
            handleNavClick={jest.fn()}
            location={location}
            isDarkMode={false}
            openAreaModal={jest.fn()}
            areas={[area]}
        />
    );
};

describe('SidebarAreas folders in minimal mode', () => {
    it('opens an area folder onto the projects inside it', () => {
        setup('minimal');

        expect(screen.queryByText('Fix sink')).toBeNull();

        // Open the Areas section first; it starts collapsed.
        const sectionToggle = document.querySelector(
            'button[aria-expanded="false"]'
        ) as HTMLElement;
        fireEvent.click(sectionToggle);
        fireEvent.click(
            screen.getByRole('button', { name: 'Show or hide projects' })
        );

        expect(screen.getByText('Fix sink')).toBeInTheDocument();
        expect(screen.queryByText('Taxes')).toBeNull();
    });

    it('does not show project folders in dense mode', () => {
        setup('dense');

        expect(
            screen.queryByRole('button', { name: 'Show or hide projects' })
        ).toBeNull();
    });
});
