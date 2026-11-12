import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import PluginsTab from '../PluginsTab';
import {
    checkPluginUpdate,
    fetchPlugins,
    installPlugin,
    pullPlugin,
    removePlugin,
    reloadPlugins,
    updatePlugin,
    type PluginInfo,
} from '../../../../utils/pluginsService';
import { usePluginMenuStore } from '../../../../store/pluginMenuStore';

jest.mock('react-i18next', () => {
    const t = (
        key: string,
        fallback?: unknown,
        options?: Record<string, unknown>
    ) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
            String(options?.[name] ?? '')
        );
    };
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
});
jest.mock('../../../../utils/pluginsService', () => ({
    fetchPlugins: jest.fn(),
    updatePlugin: jest.fn(),
    reloadPlugins: jest.fn(),
    reloadPlugin: jest.fn(),
    checkPluginUpdate: jest.fn(),
    installPlugin: jest.fn(),
    pullPlugin: jest.fn(),
    removePlugin: jest.fn(),
    fetchPluginMenu: jest.fn().mockResolvedValue({ items: [] }),
}));

const plugin = (overrides: Partial<PluginInfo> = {}): PluginInfo => ({
    id: 'hermes',
    folder: 'hermes',
    name: 'Hermes',
    description: 'Forwards events.',
    version: '1.0.0',
    loaded_version: '1.0.0',
    previous_version: null,
    state: 'disabled',
    last_error: null,
    permissions: ['events'],
    events: ['task.completed'],
    settings: [
        {
            key: 'url',
            type: 'string',
            label: 'Webhook address',
            required: true,
            value: 'https://a.test',
        },
        {
            key: 'secret',
            type: 'secret',
            label: 'Signing secret',
            has_value: true,
        },
    ],
    update: null,
    entry_missing: false,
    menu: null,
    installed_from_git: false,
    ...overrides,
});

const response = (plugins: PluginInfo[]) => ({ configured: true, plugins });

describe('PluginsTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        usePluginMenuStore.setState({ items: [], loaded: false });
    });

    it('explains how to turn plugins on when the folder is not configured', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue({
            configured: false,
            plugins: [],
        });
        render(<PluginsTab isActive />);
        expect(
            await screen.findByText(/TUDUDI_PLUGINS_DIR/)
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reload all' })).toBeNull();
        expect(screen.queryByRole('switch')).toBeNull();
    });

    it('lists each plugin with its state badge and version', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(
            response([
                plugin({ state: 'active' }),
                plugin({
                    id: 'bridge',
                    folder: 'bridge',
                    name: 'Bridge',
                    state: 'needs_approval',
                    version: '2.0.0',
                    loaded_version: '1.0.0',
                    previous_version: '0.9.0',
                }),
            ])
        );
        render(<PluginsTab isActive />);

        const hermes = await screen.findByTestId('plugin-hermes');
        expect(within(hermes).getByTestId('plugin-state')).toHaveTextContent(
            'Running'
        );
        expect(within(hermes).getByRole('switch')).toHaveAttribute(
            'aria-checked',
            'true'
        );

        const bridge = screen.getByTestId('plugin-bridge');
        expect(within(bridge).getByTestId('plugin-state')).toHaveTextContent(
            'Needs approval'
        );
        expect(
            within(bridge).getByText(/Reload to load 2\.0\.0/)
        ).toBeInTheDocument();
        expect(
            within(bridge).getByText(/updated from 0.9.0/)
        ).toBeInTheDocument();
        expect(
            within(bridge).getByText(/approve its permissions/)
        ).toBeInTheDocument();
        expect(within(bridge).getByRole('switch')).toHaveAttribute(
            'aria-checked',
            'false'
        );
    });

    it('turns a disabled plugin on with updatePlugin(id, { enabled: true })', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([plugin()]));
        (updatePlugin as jest.Mock).mockResolvedValue(
            plugin({ state: 'active' })
        );
        render(<PluginsTab isActive />);

        fireEvent.click(await screen.findByRole('switch', { name: 'Enabled' }));

        await waitFor(() =>
            expect(updatePlugin).toHaveBeenCalledWith('hermes', {
                enabled: true,
            })
        );
        expect(await screen.findByText('Running')).toBeInTheDocument();
    });

    it('sends a secret only when one is typed, and null when cleared', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([plugin()]));
        (updatePlugin as jest.Mock).mockResolvedValue(plugin());
        render(<PluginsTab isActive />);

        const card = await screen.findByTestId('plugin-hermes');
        fireEvent.click(
            within(card).getByRole('button', { name: 'Save settings' })
        );
        await waitFor(() =>
            expect(updatePlugin).toHaveBeenLastCalledWith('hermes', {
                settings: { url: 'https://a.test' },
            })
        );

        const secret = within(card).getByLabelText('Signing secret');
        expect(secret).toHaveAttribute('placeholder', 'Saved');
        fireEvent.change(secret, { target: { value: 'new-secret' } });
        fireEvent.click(
            within(card).getByRole('button', { name: 'Save settings' })
        );
        await waitFor(() =>
            expect(updatePlugin).toHaveBeenLastCalledWith('hermes', {
                settings: { url: 'https://a.test', secret: 'new-secret' },
            })
        );

        fireEvent.click(within(card).getByRole('button', { name: 'Clear' }));
        fireEvent.click(
            within(card).getByRole('button', { name: 'Save settings' })
        );
        await waitFor(() =>
            expect(updatePlugin).toHaveBeenLastCalledWith('hermes', {
                settings: { url: 'https://a.test', secret: null },
            })
        );
    });

    it('shows the server error message as it is', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([plugin()]));
        (updatePlugin as jest.Mock).mockRejectedValue(
            new Error('Fill in: Webhook address')
        );
        render(<PluginsTab isActive />);

        fireEvent.click(await screen.findByRole('switch', { name: 'Enabled' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Fill in: Webhook address'
        );
    });

    it('shows the update result only when the plugin has an update address', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(
            response([
                plugin({
                    update: {
                        url: 'https://u.test/p.json',
                        latest: null,
                        available: false,
                        checked_at: null,
                        error: null,
                    },
                }),
                plugin({
                    id: 'plain',
                    folder: 'plain',
                    name: 'Plain',
                    update: null,
                }),
            ])
        );
        (checkPluginUpdate as jest.Mock).mockResolvedValue(
            plugin({
                update: {
                    url: 'https://u.test/p.json',
                    latest: '1.2.0',
                    available: true,
                    checked_at: 'now',
                    error: null,
                },
            })
        );
        render(<PluginsTab isActive />);

        const card = await screen.findByTestId('plugin-hermes');
        expect(
            within(screen.getByTestId('plugin-plain')).queryByRole('button', {
                name: 'Check for updates',
            })
        ).toBeNull();

        fireEvent.click(
            within(card).getByRole('button', { name: 'Check for updates' })
        );

        expect(
            await within(card).findByText('Update available: 1.2.0')
        ).toBeInTheDocument();
        expect(checkPluginUpdate).toHaveBeenCalledWith('hermes');
    });

    it('reloads every plugin from the list', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([plugin()]));
        (reloadPlugins as jest.Mock).mockResolvedValue(
            response([plugin({ state: 'active' })])
        );
        render(<PluginsTab isActive />);

        fireEvent.click(
            await screen.findByRole('button', { name: 'Reload all' })
        );

        await waitFor(() => expect(reloadPlugins).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('Plugins reloaded')).toBeInTheDocument();
    });

    it('adds a plugin from its Git address and shows it, with the address cleared', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([plugin()]));
        (installPlugin as jest.Mock).mockResolvedValue(
            plugin({ id: 'bridge', folder: 'bridge', name: 'Bridge' })
        );
        render(<PluginsTab isActive />);

        const input = await screen.findByLabelText('Plugin Git address');
        fireEvent.change(input, {
            target: { value: '  https://git.test/bridge.git  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(installPlugin).toHaveBeenCalledWith(
                'https://git.test/bridge.git'
            )
        );
        expect(await screen.findByTestId('plugin-bridge')).toBeInTheDocument();
        expect(input).toHaveValue('');
        expect(
            screen.getByText(/Read what it asks for, then turn it on/)
        ).toBeInTheDocument();
    });

    it('disables the Add button while the install runs', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([]));
        (installPlugin as jest.Mock).mockReturnValue(new Promise(() => {}));
        render(<PluginsTab isActive />);

        fireEvent.change(await screen.findByLabelText('Plugin Git address'), {
            target: { value: 'https://git.test/x.git' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(
            await screen.findByRole('button', { name: 'Adding...' })
        ).toBeDisabled();
    });

    it('shows the server error when the install is refused', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(response([]));
        (installPlugin as jest.Mock).mockRejectedValue(
            new Error('Could not clone: repository not found')
        );
        render(<PluginsTab isActive />);

        fireEvent.change(await screen.findByLabelText('Plugin Git address'), {
            target: { value: 'https://git.test/missing.git' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not clone: repository not found'
        );
    });

    it('offers Update only for a plugin installed from Git', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(
            response([
                plugin({ installed_from_git: true }),
                plugin({ id: 'copied', folder: 'copied', name: 'Copied' }),
            ])
        );
        (pullPlugin as jest.Mock).mockResolvedValue(
            plugin({ installed_from_git: true, version: '1.1.0' })
        );
        render(<PluginsTab isActive />);

        const copied = await screen.findByTestId('plugin-copied');
        expect(
            within(copied).queryByRole('button', { name: 'Update' })
        ).toBeNull();

        const hermes = screen.getByTestId('plugin-hermes');
        fireEvent.click(within(hermes).getByRole('button', { name: 'Update' }));

        await waitFor(() => expect(pullPlugin).toHaveBeenCalledWith('hermes'));
        expect(
            await within(hermes).findByText('Plugin updated')
        ).toBeInTheDocument();
    });

    it('deletes a plugin only after confirmation', async () => {
        (fetchPlugins as jest.Mock).mockResolvedValue(
            response([plugin(), plugin({ id: 'bridge', folder: 'bridge' })])
        );
        (removePlugin as jest.Mock).mockResolvedValue({ removed: 'hermes' });
        render(<PluginsTab isActive />);

        const hermes = await screen.findByTestId('plugin-hermes');
        fireEvent.click(within(hermes).getByRole('button', { name: 'Delete' }));

        fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(removePlugin).not.toHaveBeenCalled();

        fireEvent.click(within(hermes).getByRole('button', { name: 'Delete' }));
        fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

        await waitFor(() =>
            expect(removePlugin).toHaveBeenCalledWith('hermes')
        );
        await waitFor(() =>
            expect(screen.queryByTestId('plugin-hermes')).toBeNull()
        );
        expect(screen.getByTestId('plugin-bridge')).toBeInTheDocument();
    });
});
