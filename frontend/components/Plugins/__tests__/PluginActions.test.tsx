import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PluginActions, { pluginActionHref } from '../PluginActions';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';
import { ToastProvider } from '../../Shared/ToastContext';
import { runPluginAction } from '../../../utils/pluginsService';

jest.mock('../../../utils/pluginsService', () => ({
    ...jest.requireActual('../../../utils/pluginsService'),
    runPluginAction: jest.fn(),
}));
const runMock = runPluginAction as jest.MockedFunction<typeof runPluginAction>;

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

    describe('run buttons', () => {
        const mailRun = {
            plugin: 'hermes',
            id: 'mail-run',
            label: 'Relever les mails',
            places: ['mail' as const],
            run: true,
        };
        const renderRun = () =>
            render(
                <ToastProvider>
                    <PluginActions place="mail" context={{ count: '2' }} />
                </ToastProvider>
            );

        beforeEach(() => {
            runMock.mockReset();
            usePluginMenuStore.setState({ items: [], actions: [mailRun] });
        });

        it('shows without a plugin page and asks the plugin to run, then says what it answered', async () => {
            let finish: (value: {
                ok: boolean;
                message: string;
            }) => void = () => undefined;
            runMock.mockReturnValue(
                new Promise((resolve) => {
                    finish = resolve;
                })
            );
            renderRun();
            const button = screen.getByRole('button', {
                name: 'Relever les mails',
            });
            fireEvent.click(button);
            expect(runMock).toHaveBeenCalledWith(mailRun, 'mail', {
                count: '2',
            });
            expect(button).toBeDisabled();
            fireEvent.click(button);
            expect(runMock).toHaveBeenCalledTimes(1);
            finish({ ok: true, message: 'Tri lancé.' });
            expect(await screen.findByText('Tri lancé.')).toBeInTheDocument();
            await waitFor(() => expect(button).not.toBeDisabled());
        });

        it('shows the reason when the plugin declines', async () => {
            runMock.mockResolvedValue({
                ok: false,
                message: 'Déjà en cours.',
            });
            renderRun();
            fireEvent.click(
                screen.getByRole('button', { name: 'Relever les mails' })
            );
            expect(
                await screen.findByText('Déjà en cours.')
            ).toBeInTheDocument();
        });

        it('says it failed when the call fails', async () => {
            runMock.mockRejectedValue(new Error('action_failed'));
            renderRun();
            fireEvent.click(
                screen.getByRole('button', { name: 'Relever les mails' })
            );
            expect(
                await screen.findByText('Le plugin n’a pas pu agir.')
            ).toBeInTheDocument();
        });
    });
});
