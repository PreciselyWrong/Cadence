import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarViews from '../SidebarViews';

let mockMinimal = true;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockMinimal,
}));

jest.mock('../../../utils/csrfService', () => ({
    getCsrfToken: jest.fn().mockResolvedValue('token'),
}));

jest.mock('../NewViewDialog', () => ({
    __esModule: true,
    default: ({
        onCreated,
        onClose,
    }: {
        onCreated: (view: { uid: string; name: string }) => void;
        onClose: () => void;
    }) => (
        <div role="dialog" aria-label="New view">
            <button
                type="button"
                onClick={() => onCreated({ uid: 'v-new', name: 'Mine' })}
            >
                create-stub
            </button>
            <button type="button" onClick={onClose}>
                close-stub
            </button>
        </div>
    ),
}));

const location = {
    pathname: '/today',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const renderViews = (handleNavClick = jest.fn()) =>
    render(
        <SidebarViews
            handleNavClick={handleNavClick}
            location={location}
            isDarkMode={false}
        />
    );

describe('SidebarViews new view entry', () => {
    beforeEach(() => {
        mockMinimal = true;
        localStorage.setItem('sidebarSectionExpanded:views', 'true');
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        sidebar_settings: {},
                    }),
            })
        ) as unknown as typeof fetch;
    });

    it('shows a New view button in Minimal, even with no views yet', () => {
        renderViews();

        expect(
            screen.getByTestId('new-view-sidebar-button')
        ).toBeInTheDocument();
    });

    it('hides the button in Dense', () => {
        mockMinimal = false;
        renderViews();

        expect(
            screen.queryByTestId('new-view-sidebar-button')
        ).not.toBeInTheDocument();
    });

    it('opens the dialog from the button', () => {
        renderViews();

        fireEvent.click(screen.getByTestId('new-view-sidebar-button'));

        expect(
            screen.getByRole('dialog', { name: 'New view' })
        ).toBeInTheDocument();
    });

    it('closes the dialog without navigating', () => {
        const handleNavClick = jest.fn();
        renderViews(handleNavClick);

        fireEvent.click(screen.getByTestId('new-view-sidebar-button'));
        fireEvent.click(screen.getByText('close-stub'));

        expect(
            screen.queryByRole('dialog', { name: 'New view' })
        ).not.toBeInTheDocument();
        expect(handleNavClick).not.toHaveBeenCalled();
    });

    it('opens the new view after it is created', () => {
        const handleNavClick = jest.fn();
        renderViews(handleNavClick);

        fireEvent.click(screen.getByTestId('new-view-sidebar-button'));
        fireEvent.click(screen.getByText('create-stub'));

        expect(handleNavClick).toHaveBeenCalledWith(
            '/views/v-new',
            'Mine',
            expect.anything()
        );
    });
});
