import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumbs from '../Breadcrumbs';
import { useStore } from '../../../store/useStore';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Breadcrumbs />
        </MemoryRouter>
    );

describe('Breadcrumbs', () => {
    it('links a group page back to Everyone', () => {
        renderAt('/groups/g1');
        expect(screen.getByRole('link', { name: 'Everyone' })).toHaveAttribute(
            'href',
            '/everyone'
        );
        expect(screen.getByText('Group')).toHaveAttribute(
            'aria-current',
            'page'
        );
    });

    it('lists every parent project before a sub-project', () => {
        act(() => {
            useStore.setState((state: any) => ({
                projectsStore: {
                    ...state.projectsStore,
                    projects: [
                        { uid: 'house1', name: 'Maison' },
                        {
                            uid: 'kit1',
                            name: 'Cuisine',
                            parent_project_uid: 'house1',
                        },
                        {
                            uid: 'oven1',
                            name: 'Four',
                            parent_project_uid: 'kit1',
                        },
                    ],
                },
            }));
        });
        renderAt('/project/oven1-four');
        expect(
            screen.getAllByRole('link').map((link) => link.textContent)
        ).toEqual(['Projects', 'Maison', 'Cuisine']);
        expect(screen.getByRole('link', { name: 'Maison' })).toHaveAttribute(
            'href',
            '/project/house1-maison'
        );
        expect(screen.getByText('Four')).toHaveAttribute(
            'aria-current',
            'page'
        );
    });

    it('renders nothing on the Everyone page itself', () => {
        const { container } = renderAt('/everyone');
        expect(container).toBeEmptyDOMElement();
    });
});
