import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PluginPage from '../PluginPage';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/plugins/:id" element={<PluginPage />} />
            </Routes>
        </MemoryRouter>
    );

describe('PluginPage', () => {
    beforeEach(() => {
        usePluginMenuStore.setState({ items: [], loaded: false });
    });

    it('waits for the plugin menu before deciding', () => {
        renderAt('/plugins/hermes');

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('frames the page the plugin serves, with its label as title', () => {
        act(() => {
            usePluginMenuStore.setState({
                items: [
                    {
                        id: 'hermes',
                        label: 'Hermes',
                        path: '/plugins/hermes',
                        file: 'panel.html',
                    },
                ],
                loaded: true,
            });
        });

        renderAt('/plugins/hermes');

        const frame = screen.getByTitle('Hermes');
        expect(frame.tagName).toBe('IFRAME');
        expect(frame.getAttribute('src')).toMatch(
            /\/api\/plugins\/hermes\/ui\/panel\.html$/
        );
        expect(frame.getAttribute('sandbox')).toBe(
            'allow-scripts allow-same-origin allow-forms'
        );
        expect(
            screen.getByRole('heading', { name: 'Hermes' })
        ).toBeInTheDocument();
    });

    it('says so when the plugin is unknown or turned off', () => {
        act(() => {
            usePluginMenuStore.setState({ items: [], loaded: true });
        });

        renderAt('/plugins/gone');

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Plugin not found or turned off'
        );
        expect(screen.queryByTitle('Hermes')).toBeNull();
    });
});
