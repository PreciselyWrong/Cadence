import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DormantProjects, { daysSince } from '../DormantProjects';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, string | number>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const mockFetch = jest.fn();
const mockKeep = jest.fn();
jest.mock('../../../utils/projectsService', () => ({
    ...jest.requireActual('../../../utils/projectsService'),
    fetchDormantProjects: () => mockFetch(),
}));
jest.mock('../../../utils/reviewService', () => ({
    ...jest.requireActual('../../../utils/reviewService'),
    keepProject: (uid: string) => mockKeep(uid),
}));

// « Pas touché depuis 30 jours » (docs/37-links.md).
describe('DormantProjects', () => {
    it('counts the days since the last activity', () => {
        expect(
            daysSince('2026-10-01T10:00:00Z', new Date('2026-11-12T09:00:00Z'))
        ).toBe(41);
    });

    it('lists them folded, and Keep takes one out without archiving it', async () => {
        mockFetch.mockResolvedValue([
            {
                uid: 'p1',
                name: 'Quiet',
                status: 'in_progress',
                last_activity_at: new Date(
                    Date.now() - 40 * 24 * 60 * 60 * 1000
                ).toISOString(),
            },
        ]);
        mockKeep.mockResolvedValue(undefined);
        render(
            <MemoryRouter>
                <DormantProjects />
            </MemoryRouter>
        );
        const header = await screen.findByRole('button', {
            name: 'Not touched for 30 days (1)',
        });
        expect(screen.queryByText('Quiet')).toBeNull();
        fireEvent.click(header);
        expect(screen.getByText('Quiet')).toBeInTheDocument();
        expect(screen.getByText('40 days ago')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
        await waitFor(() => expect(mockKeep).toHaveBeenCalledWith('p1'));
        expect(screen.queryByText('Quiet')).toBeNull();
    });

    it('shows nothing when every project moves', async () => {
        mockFetch.mockResolvedValue([]);
        const { container } = render(
            <MemoryRouter>
                <DormantProjects />
            </MemoryRouter>
        );
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
