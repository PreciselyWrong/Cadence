import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NotificationsDropdown from '../NotificationsDropdown';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../utils/csrfService', () => ({
    fetchWithCsrf: jest.fn(() => Promise.resolve({ ok: true })),
}));

const { fetchWithCsrf } = jest.requireMock('../../../utils/csrfService');

const agentNote = {
    id: 1,
    uid: 'n-agent',
    type: 'system',
    title: '3 mails attendent une décision',
    message: 'Orange attend un paiement',
    level: 'warning',
    source: 'system',
    read_at: null,
    created_at: new Date().toISOString(),
    data: {
        pluginId: 'hermes',
        agentLabel: 'Trieur',
        openPath: '/plugins/hermes?msg=m1',
    },
};

describe('NotificationsDropdown', () => {
    beforeEach(() => {
        (global as any).fetch = jest.fn((url: string) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        String(url).includes('unread-count')
                            ? { count: 1 }
                            : { notifications: [agentNote] }
                    ),
            })
        );
    });

    const open = async () => {
        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/today']}>
                    <NotificationsDropdown isDarkMode={false} />
                    <Routes>
                        <Route path="/today" element={<p>today</p>} />
                        <Route
                            path="/plugins/:id"
                            element={<p>plugin page</p>}
                        />
                    </Routes>
                </MemoryRouter>
            );
        });
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'profile.notifications' })
            );
        });
    };

    it('opens the mail deck for a « mails à trier » notification', async () => {
        const mailReady = {
            id: 2,
            uid: 'n-mail',
            type: 'mail_ready',
            title: '2 mails à trier',
            message: '',
            level: 'info',
            source: 'system',
            read_at: null,
            created_at: new Date().toISOString(),
            data: { kind: 'mail_ready', count: 2 },
        };
        (global as any).fetch = jest.fn((url: string) =>
            Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve(
                        String(url).includes('unread-count')
                            ? { count: 1 }
                            : { notifications: [mailReady] }
                    ),
            })
        );
        const Location = () => {
            const location = useLocation();
            return <p>{location.pathname + location.search}</p>;
        };
        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/today']}>
                    <NotificationsDropdown isDarkMode={false} />
                    <Routes>
                        <Route path="/today" element={<p>today</p>} />
                        <Route path="/triage" element={<Location />} />
                    </Routes>
                </MemoryRouter>
            );
        });
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'profile.notifications' })
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('2 mails à trier'));
        });
        expect(screen.getByText('/triage?deck=mail')).toBeInTheDocument();
    });

    it('names the agent and opens its message, marking it read', async () => {
        await open();
        expect(screen.getByText('Trieur')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('3 mails attendent une décision'));
        });
        expect(screen.getByText('plugin page')).toBeInTheDocument();
        expect(fetchWithCsrf).toHaveBeenCalledWith(
            expect.stringContaining('notifications/n-agent/read'),
            expect.anything()
        );
    });

    it('does not follow an openPath outside Cadence', async () => {
        agentNote.data.openPath = 'https://evil.example';
        await open();
        await act(async () => {
            fireEvent.click(screen.getByText('3 mails attendent une décision'));
        });
        expect(screen.getByText('today')).toBeInTheDocument();
        agentNote.data.openPath = '/plugins/hermes?msg=m1';
    });
});
