import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SyncTab from '../SyncTab';
import {
    countPendingWebChanges,
    fetchSyncStatus,
    resolveSyncConflict,
} from '../../../../utils/syncService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) => {
            const template =
                typeof fallback === 'string'
                    ? fallback
                    : (fallback?.defaultValue ?? key);
            const vars = typeof fallback === 'object' ? fallback : {};
            return Object.keys(vars).reduce(
                (out, name) => out.replace(`{{${name}}}`, String(vars[name])),
                template
            );
        },
    }),
}));

jest.mock('../../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

jest.mock('../../../../utils/dateUtils', () => ({
    getCurrentLocale: () => undefined,
}));

jest.mock('../../../../utils/syncService', () => ({
    fetchSyncStatus: jest.fn(),
    resolveSyncConflict: jest.fn(),
    countPendingWebChanges: jest.fn(),
}));

const mockStatus = fetchSyncStatus as jest.Mock;
const mockResolve = resolveSyncConflict as jest.Mock;
const mockPending = countPendingWebChanges as jest.Mock;

const conflict = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    entity: 'task',
    uid: 'task-0000001',
    field: 'name',
    name: 'Call Paul',
    created_at: '2026-10-31T10:00:00Z',
    lost: { value: 'Call Paul tomorrow' },
    current: { value: 'Call Paul' },
    can_keep_lost: true,
    ...overrides,
});

const status = (overrides: Record<string, unknown> = {}) => ({
    devices: [],
    last_change_at: null,
    conflicts: [],
    ...overrides,
});

describe('SyncTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPending.mockResolvedValue(0);
        mockResolve.mockResolvedValue(undefined);
    });

    it('lists the devices that have synced', async () => {
        mockStatus.mockResolvedValue(
            status({
                devices: [
                    {
                        id: 1,
                        name: 'Pixel 9',
                        last_used_at: new Date().toISOString(),
                    },
                ],
            })
        );

        render(<SyncTab isActive />);

        expect(await screen.findByText('Pixel 9')).toBeInTheDocument();
        expect(screen.queryByText('Conflicts')).not.toBeInTheDocument();
    });

    it('says when no device has synced yet', async () => {
        mockStatus.mockResolvedValue(status());

        render(<SyncTab isActive />);

        expect(
            await screen.findByText(/No device has synced yet/)
        ).toBeInTheDocument();
    });

    it('shows both values of a conflict and keeps the lost one', async () => {
        mockStatus
            .mockResolvedValueOnce(status({ conflicts: [conflict()] }))
            .mockResolvedValueOnce(status());

        render(<SyncTab isActive />);

        expect(await screen.findByText('Conflicts')).toBeInTheDocument();
        expect(
            screen.getByText('Set aside: Call Paul tomorrow')
        ).toBeInTheDocument();
        expect(screen.getByText('Kept: Call Paul')).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Keep this value' })
        );

        await waitFor(() =>
            expect(mockResolve).toHaveBeenCalledWith(7, 'lost')
        );
        await waitFor(() =>
            expect(screen.queryByText('Conflicts')).not.toBeInTheDocument()
        );
    });

    it('keeps the current value', async () => {
        mockStatus.mockResolvedValue(status({ conflicts: [conflict()] }));

        render(<SyncTab isActive />);

        fireEvent.click(
            await screen.findByRole('button', { name: 'Keep the other' })
        );

        await waitFor(() =>
            expect(mockResolve).toHaveBeenCalledWith(7, 'current')
        );
    });

    it('only offers to dismiss a conflict the server cannot write back', async () => {
        mockStatus.mockResolvedValue(
            status({
                conflicts: [
                    conflict({ entity: 'habit_entry', can_keep_lost: false }),
                ],
            })
        );

        render(<SyncTab isActive />);

        expect(
            await screen.findByRole('button', { name: 'Got it' })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Keep this value' })
        ).not.toBeInTheDocument();
    });

    it('names references and empty values', async () => {
        mockStatus.mockResolvedValue(
            status({
                conflicts: [
                    conflict({
                        field: 'project_uid',
                        lost: { value: 'p-2', label: 'Work' },
                        current: { value: null },
                    }),
                ],
            })
        );

        render(<SyncTab isActive />);

        expect(await screen.findByText('Set aside: Work')).toBeInTheDocument();
        expect(screen.getByText('Kept: (empty)')).toBeInTheDocument();
        expect(
            screen.getByText(/Task · “Call Paul” · Project/)
        ).toBeInTheDocument();
    });

    it('shows changes waiting in this browser', async () => {
        mockStatus.mockResolvedValue(status());
        mockPending.mockResolvedValue(3);

        render(<SyncTab isActive />);

        expect(
            await screen.findByText(
                '3 changes made offline in this browser are waiting to be sent.'
            )
        ).toBeInTheDocument();
    });
});
