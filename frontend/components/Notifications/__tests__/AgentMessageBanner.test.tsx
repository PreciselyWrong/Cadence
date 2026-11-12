import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AgentMessageBanner from '../AgentMessageBanner';
import * as service from '../../../utils/agentMessagesService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const { pickAgentMessages, safeOpenPath } = jest.requireActual(
    '../../../utils/agentMessagesService'
);

const note = (uid: string, at: string, data: any = { pluginId: 'hermes' }) => ({
    uid,
    title: `Titre ${uid}`,
    message: `Corps ${uid}`,
    created_at: at,
    data,
});

describe('agent messages', () => {
    it('keeps plugin notifications only, newest first', () => {
        const list = [
            note('a', '2026-11-12T08:00:00Z'),
            note('b', '2026-11-12T09:00:00Z'),
            note('c', '2026-11-12T10:00:00Z', { taskUid: 't' }),
            note('d', '2026-11-12T11:00:00Z', null),
            'junk',
        ];
        expect(pickAgentMessages(list).map((n: any) => n.uid)).toEqual([
            'b',
            'a',
        ]);
        expect(pickAgentMessages(undefined)).toEqual([]);
    });

    it('opens only paths inside Cadence', () => {
        expect(safeOpenPath('/plugins/hermes?msg=m1')).toBe(
            '/plugins/hermes?msg=m1'
        );
        expect(safeOpenPath('https://evil.example')).toBeNull();
        expect(safeOpenPath('//evil.example/x')).toBeNull();
        expect(safeOpenPath('/a b')).toBeNull();
        expect(safeOpenPath(undefined)).toBeNull();
    });
});

describe('AgentMessageBanner', () => {
    let read: jest.SpyInstance;

    beforeEach(() => {
        jest.spyOn(service, 'watchNotificationStream').mockReturnValue(
            () => {}
        );
        read = jest
            .spyOn(service, 'markAgentMessageRead')
            .mockResolvedValue(undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    const renderBanner = async () => {
        await act(async () => {
            render(
                <MemoryRouter initialEntries={['/today']}>
                    <AgentMessageBanner />
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
    };

    it('shows nothing without an unread agent message', async () => {
        jest.spyOn(service, 'fetchUnreadAgentMessages').mockResolvedValue([]);
        await renderBanner();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows the newest message with a count, opens it and marks it read', async () => {
        jest.spyOn(service, 'fetchUnreadAgentMessages').mockResolvedValue([
            note('b', '2026-11-12T09:00:00Z', {
                pluginId: 'hermes',
                openPath: '/plugins/hermes?msg=m2',
            }),
            note('a', '2026-11-12T08:00:00Z'),
        ]);
        await renderBanner();
        expect(screen.getByText('Titre b')).toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Open' }));
        });
        expect(read).toHaveBeenCalledWith('b');
        expect(screen.getByText('plugin page')).toBeInTheDocument();
        expect(screen.getByText('Titre a')).toBeInTheDocument();
    });

    it('marks read with × and offers no Open without a safe path', async () => {
        jest.spyOn(service, 'fetchUnreadAgentMessages').mockResolvedValue([
            note('x', '2026-11-12T09:00:00Z', {
                pluginId: 'hermes',
                openPath: 'https://evil.example',
            }),
        ]);
        await renderBanner();
        expect(
            screen.queryByRole('button', { name: 'Open' })
        ).not.toBeInTheDocument();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Mark as read' })
            );
        });
        expect(read).toHaveBeenCalledWith('x');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByText('today')).toBeInTheDocument();
    });
});
