import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileBottomBar, { activeTab, fabTarget } from '../MobileBottomBar';
import { groupTabs } from '../../Profile/tabs/TabsNav';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));

let mockPath = '/today';
jest.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: mockPath, search: '' }),
    useNavigate: () => jest.fn(),
}));

describe('mobile bottom bar', () => {
    it('maps routes to the Android tabs', () => {
        expect(activeTab('/inbox')).toBe('inbox');
        expect(activeTab('/today')).toBe('tasks');
        expect(activeTab('/project/abc-home')).toBe('tasks');
        expect(activeTab('/calendar')).toBe('agenda');
        expect(activeTab('/habit/xyz')).toBe('habits');
        expect(activeTab('/review')).toBe('review');
        expect(activeTab('/profile')).toBeNull();
    });

    it('offers the floating add button only on Tâches and Boîte', () => {
        expect(fabTarget('/today')).toBe('task');
        expect(fabTarget('/inbox')).toBe('inbox');
        expect(fabTarget('/habits')).toBeNull();
        expect(fabTarget('/calendar')).toBeNull();
    });

    it('marks the active tab and shows the add button on Tâches', () => {
        mockPath = '/today';
        render(<MobileBottomBar />);
        expect(screen.getByText('Tasks').closest('a')).toHaveAttribute(
            'aria-current',
            'page'
        );
        expect(screen.getByTestId('mobile-fab')).toBeInTheDocument();
    });

    it('hides the add button on Agenda', () => {
        mockPath = '/calendar';
        render(<MobileBottomBar />);
        expect(screen.queryByTestId('mobile-fab')).not.toBeInTheDocument();
    });
});

describe('settings menu groups', () => {
    it('keeps the given order inside each group and the group order', () => {
        const tab = (id: string, group: string) => ({
            id,
            group,
            name: id,
            icon: null,
        });
        const groups = groupTabs(
            [
                tab('general', 'account'),
                tab('billing', 'account'),
                tab('appearance', 'appearance'),
                tab('mcp', 'integrations'),
            ],
            (id) => id
        );
        expect(groups.map((g) => g.id)).toEqual([
            'account',
            'appearance',
            'integrations',
        ]);
        expect(groups[0].tabs.map((x) => x.id)).toEqual(['general', 'billing']);
    });
});
