import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarTags from '../SidebarTags';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../store/useStore', () => {
    const state = () => ({
        tagsStore: {
            tags: [{ uid: 'home1', name: 'home', parent_uid: null }],
            setTags: jest.fn(),
            isLoading: false,
            isError: false,
            hasLoaded: true,
            loadTags: jest.fn(),
        },
        userSettingsStore: {
            uiDensity: 'minimal',
            sidebarMinimal: { sectionBadges: { tags: false } },
        },
    });
    return {
        useStore: (selector?: (s: any) => unknown) =>
            selector ? selector(state()) : state(),
    };
});

describe('SidebarTags with its count badge hidden', () => {
    afterEach(() => localStorage.clear());

    it('hides the count but can still be expanded', () => {
        render(
            <SidebarTags
                handleNavClick={jest.fn()}
                location={{ pathname: '/today', search: '' } as any}
                isDarkMode={false}
                openTagModal={jest.fn()}
                tags={[]}
            />
        );

        expect(screen.queryByText('1')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(screen.getByTestId('sidebar-tag-home1')).toBeInTheDocument();
    });
});
