import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TriageEntry from '../TriageEntry';
import { fetchTriageQueue } from '../../../utils/triageService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, options?: { count?: number }) =>
            fallback.replace('{{count}}', String(options?.count ?? '')),
    }),
}));
jest.mock('../../../utils/triageService', () => ({
    fetchTriageQueue: jest.fn(),
}));

const renderEntry = () =>
    render(
        <MemoryRouter>
            <TriageEntry />
        </MemoryRouter>
    );

describe('TriageEntry', () => {
    it('leads to « À trier » with the number of cards', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            items: [{ key: 'a' }, { key: 'b' }],
            tasks: {},
            count: 2,
        });
        renderEntry();
        const link = await screen.findByTestId('inbox-to-sort');
        expect(link).toHaveTextContent('À trier (2)');
        expect(link).toHaveAttribute('href', '/triage');
    });

    it('shows nothing when nothing waits', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            items: [],
            tasks: {},
            count: 0,
        });
        renderEntry();
        await waitFor(() => expect(fetchTriageQueue).toHaveBeenCalled());
        expect(screen.queryByTestId('inbox-to-sort')).not.toBeInTheDocument();
    });
});
