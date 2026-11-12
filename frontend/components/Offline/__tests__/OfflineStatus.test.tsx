import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import OfflineStatus from '../OfflineStatus';
import {
    dismissRejectedWrites,
    retryOfflineNow,
} from '../../../utils/offlineService';
import { fetchSyncStatus } from '../../../utils/syncService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

// Returns the key with its count, so the tests read which message shows.
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: any) =>
            opts && typeof opts === 'object' && 'count' in opts
                ? `${key}:${opts.count}`
                : key,
    }),
}));

let pushState: (state: any) => void = () => undefined;
let pushSync: (result: any) => void = () => undefined;
jest.mock('../../../utils/offlineService', () => ({
    startOfflineSync: jest.fn(),
    retryOfflineNow: jest.fn(),
    dismissRejectedWrites: jest.fn(),
    subscribeOfflineState: (listener: any) => {
        pushState = listener;
        return () => undefined;
    },
    subscribeSyncComplete: (listener: any) => {
        pushSync = listener;
        return () => undefined;
    },
}));
jest.mock('../../../utils/syncService', () => ({ fetchSyncStatus: jest.fn() }));

const state = (overrides = {}) => ({
    offline: false,
    pending: 0,
    rejected: [],
    ...overrides,
});

describe('OfflineStatus', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows nothing while online with nothing waiting', () => {
        const { container } = render(<OfflineStatus />);
        act(() => pushState(state()));
        expect(container).toBeEmptyDOMElement();
    });

    it('says offline with the count of waiting changes, and retries', () => {
        render(<OfflineStatus />);
        act(() => pushState(state({ offline: true, pending: 3 })));
        fireEvent.click(screen.getByText('offline.offlinePending:3'));
        expect(screen.getByText('offline.explain')).toBeInTheDocument();
        fireEvent.click(screen.getByText('offline.retry'));
        expect(retryOfflineNow).toHaveBeenCalled();
    });

    it('lists refused changes and lets them be dismissed', () => {
        render(<OfflineStatus />);
        act(() =>
            pushState(
                state({
                    rejected: [
                        {
                            id: 1,
                            method: 'PATCH',
                            url: 'https://x/api/task/t1',
                            status: 404,
                            error: 'Task not found.',
                            entity: 'task',
                            name: 'Call Paul',
                        },
                    ],
                })
            )
        );
        fireEvent.click(screen.getByText('offline.rejected:1'));
        expect(screen.getByText('Call Paul')).toBeInTheDocument();
        expect(screen.getByText(/Task not found\./)).toBeInTheDocument();
        fireEvent.click(screen.getByText('offline.dismiss'));
        expect(dismissRejectedWrites).toHaveBeenCalled();
    });

    it('points to the conflicts a replay left', async () => {
        (fetchSyncStatus as jest.Mock).mockResolvedValue({
            conflicts: [{ id: 1 }, { id: 2 }],
        });
        render(<OfflineStatus />);
        act(() => pushState(state()));
        await act(async () =>
            pushSync({ applied: 2, rejected: 0, stopped: null })
        );
        fireEvent.click(screen.getByText('offline.conflicts:2'));
        expect(mockNavigate).toHaveBeenCalledWith('/profile?section=sync');
    });

    it('asks for nothing after a replay that sent nothing', async () => {
        render(<OfflineStatus />);
        act(() => pushState(state()));
        await act(async () =>
            pushSync({ applied: 0, rejected: 0, stopped: 'offline' })
        );
        expect(fetchSyncStatus).not.toHaveBeenCalled();
    });
});
