import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PluginActions, { pluginActionHref } from '../PluginActions';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';

const planWeek = {
    plugin: 'hermes',
    id: 'plan-week',
    label: 'Planifier ma semaine',
    places: ['plan' as const, 'today' as const],
};

const Where = () => {
    const { pathname, search } = useLocation();
    return <p data-testid="where">{pathname + search}</p>;
};

const renderAt = (place: 'plan' | 'inbox') =>
    render(
        <MemoryRouter initialEntries={['/upcoming']}>
            <Routes>
                <Route
                    path="/upcoming"
                    element={
                        <PluginActions
                            place={place}
                            context={{ start: '2026-11-16', empty: undefined }}
                        />
                    }
                />
                <Route path="/plugins/:id" element={<Where />} />
            </Routes>
        </MemoryRouter>
    );

describe('PluginActions', () => {
    beforeEach(() => {
        usePluginMenuStore.setState({
            loaded: true,
            items: [
                {
                    id: 'hermes',
                    label: 'Agents',
                    path: '/plugins/hermes',
                    file: 'index.html',
                },
            ],
            actions: [planWeek],
        });
    });

    it('opens the plugin page with the action and what the page shows', () => {
        renderAt('plan');
        fireEvent.click(
            screen.getByRole('button', { name: 'Planifier ma semaine' })
        );
        expect(screen.getByTestId('where').textContent).toBe(
            '/plugins/hermes?action=plan-week&place=plan&start=2026-11-16'
        );
    });

    it('draws nothing on a page the action is not for', () => {
        renderAt('inbox');
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('draws nothing when the plugin has no page to open', () => {
        usePluginMenuStore.setState({ items: [] });
        renderAt('plan');
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('encodes the plugin id and skips empty context values', () => {
        expect(
            pluginActionHref({ ...planWeek, plugin: 'a b' }, 'today', {
                date: '',
            })
        ).toBe('/plugins/a%20b?action=plan-week&place=today');
    });
});
