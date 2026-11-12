import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarNav from '../SidebarNav';
import { useStore } from '../../../store/useStore';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../utils/inboxService', () => ({
    loadInboxItemsToStore: jest.fn().mockResolvedValue(undefined),
}));

const location = {
    pathname: '/plugins/hermes',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

describe('SidebarNav plugin entries', () => {
    beforeEach(() => {
        act(() => {
            useStore.setState((state: any) => ({
                userSettingsStore: {
                    ...state.userSettingsStore,
                    calendarEnabled: true,
                    hasCollaborators: true,
                    sidebarVisibleSections: {},
                },
            }));
            usePluginMenuStore.setState({
                items: [
                    {
                        id: 'hermes',
                        label: 'Hermes',
                        path: '/plugins/hermes',
                        file: 'index.html',
                    },
                ],
                loaded: true,
            });
        });
    });

    afterEach(() => {
        act(() => {
            usePluginMenuStore.setState({ items: [], loaded: false });
        });
    });

    it('links each running plugin to its page and marks it active there', () => {
        const handleNavClick = jest.fn();
        render(
            <SidebarNav
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={false}
                openTaskModal={jest.fn()}
            />
        );

        const entry = screen.getByRole('button', { name: /Hermes/ });
        expect(entry).toHaveClass('font-semibold');
        fireEvent.click(entry);
        expect(handleNavClick).toHaveBeenCalledWith(
            '/plugins/hermes',
            'Hermes',
            expect.anything()
        );
    });

    it('hides a plugin entry turned off in the sidebar settings', () => {
        act(() => {
            useStore.setState((state: any) => ({
                userSettingsStore: {
                    ...state.userSettingsStore,
                    sidebarVisibleSections: { 'plugin:hermes': false },
                },
            }));
        });

        render(
            <SidebarNav
                handleNavClick={jest.fn()}
                location={location}
                isDarkMode={false}
                openTaskModal={jest.fn()}
            />
        );

        expect(screen.queryByText('Hermes')).toBeNull();
    });
});
