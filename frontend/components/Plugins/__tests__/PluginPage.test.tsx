import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PluginPage from '../PluginPage';
import { resolvePluginOpen } from '../pluginOpen';
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
                <Route path="/task/:uid" element={<p>task page</p>} />
                <Route path="/note/:uid" element={<p>note page</p>} />
            </Routes>
        </MemoryRouter>
    );

const menu = () =>
    act(() => {
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

describe('resolvePluginOpen', () => {
    it.each([
        ['task', 'abc123', { route: '/task/abc123' }],
        ['note', 'n-1', { route: '/note/n-1' }],
        ['project', 'p1', { route: '/project/p1' }],
        [
            'url',
            'https://example.org/a?b=1',
            { external: 'https://example.org/a?b=1' },
        ],
    ])('opens %s %s', (target, ref, expected) => {
        expect(resolvePluginOpen(target, ref)).toEqual(expected);
    });

    it.each([
        ['url', 'javascript:alert(1)'],
        ['url', 'data:text/html,x'],
        ['task', '../admin'],
        ['task', 'a b'],
        ['task', ''],
        ['secret', 'x'],
        [undefined, undefined],
    ])('refuses %s %s', (target, ref) => {
        expect(resolvePluginOpen(target as any, ref as any)).toBeNull();
    });
});

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

    describe('cadence.open from the page', () => {
        const send = (frame: HTMLElement, data: unknown, source?: unknown) =>
            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data,
                        origin: window.location.origin,
                        source: (source ??
                            (frame as HTMLIFrameElement).contentWindow) as any,
                    })
                );
            });

        it('opens a task inside the app', () => {
            menu();
            renderAt('/plugins/hermes');
            send(screen.getByTitle('Hermes'), {
                cadence: 'open',
                target: 'task',
                ref: 'abc',
            });
            expect(screen.getByText('task page')).toBeInTheDocument();
        });

        it('opens an external address in a new tab, without opener', () => {
            const open = jest.spyOn(window, 'open').mockReturnValue(null);
            menu();
            renderAt('/plugins/hermes');
            send(screen.getByTitle('Hermes'), {
                cadence: 'open',
                target: 'url',
                ref: 'https://example.org/',
            });
            expect(open).toHaveBeenCalledWith(
                'https://example.org/',
                '_blank',
                'noopener,noreferrer'
            );
            open.mockRestore();
        });

        it('ignores other windows, bad targets and other origins', () => {
            const open = jest.spyOn(window, 'open').mockReturnValue(null);
            menu();
            renderAt('/plugins/hermes');
            const frame = screen.getByTitle('Hermes');
            send(
                frame,
                { cadence: 'open', target: 'task', ref: 'abc' },
                window
            );
            send(frame, {
                cadence: 'open',
                target: 'url',
                ref: 'javascript:alert(1)',
            });
            act(() => {
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data: { cadence: 'open', target: 'task', ref: 'abc' },
                        origin: 'https://evil.test',
                        source: (frame as HTMLIFrameElement)
                            .contentWindow as any,
                    })
                );
            });
            expect(screen.queryByText('task page')).toBeNull();
            expect(open).not.toHaveBeenCalled();
            open.mockRestore();
        });
    });
});
