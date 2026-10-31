import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Areas from '../Areas';
import { ToastProvider } from '../Shared/ToastContext';
import { createArea } from '../../utils/areasService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));
jest.mock('../Area/AreaModal', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../Shared/ConfirmDialog', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../utils/areasService', () => ({
    fetchAreas: jest.fn(),
    createArea: jest.fn(),
    updateArea: jest.fn(),
    deleteArea: jest.fn(),
    reorderAreas: jest.fn(),
}));
jest.mock('../../hooks/useCan', () => ({ useCan: () => true }));

let mockAreas: { uid: string; name: string }[] = [];
const loadAreas = jest.fn();
const setAreas = jest.fn((next) => {
    mockAreas = next;
});

jest.mock('../../store/useStore', () => {
    const state = () => ({
        areasStore: {
            areas: mockAreas,
            loadAreas,
            setAreas,
            setLoading: jest.fn(),
            setError: jest.fn(),
        },
    });
    const useStore: any = (selector: any) => selector(state());
    useStore.getState = state;
    return { useStore };
});

const DOMAINS = [
    'Business & Money',
    'Tech & Systems',
    'Personal',
    'Family & Social',
    'Logistics',
];

describe('Areas: suggest 5 domains', () => {
    beforeEach(() => {
        mockAreas = [];
        (createArea as jest.Mock).mockImplementation(async ({ name }) => ({
            uid: `uid-${name}`,
            name,
        }));
    });
    afterEach(() => jest.clearAllMocks());

    const renderAreas = () =>
        render(
            <ToastProvider>
                <MemoryRouter>
                    <Areas />
                </MemoryRouter>
            </ToastProvider>
        );

    it('creates nothing until the user asks', () => {
        renderAreas();
        expect(createArea).not.toHaveBeenCalled();
    });

    it('offers the five domains from the empty state', async () => {
        renderAreas();

        fireEvent.click(screen.getByTestId('suggest-domains-button'));

        await waitFor(() => expect(createArea).toHaveBeenCalledTimes(5));
        expect(
            (createArea as jest.Mock).mock.calls.map(([area]) => area.name)
        ).toEqual(DOMAINS);
    });

    it('skips the domains that already exist, ignoring case', async () => {
        mockAreas = [
            { uid: 'a1', name: 'personal' },
            { uid: 'a2', name: 'Logistics' },
        ];
        renderAreas();

        fireEvent.click(screen.getByTestId('suggest-domains-link'));

        await waitFor(() => expect(createArea).toHaveBeenCalledTimes(3));
        expect(
            (createArea as jest.Mock).mock.calls.map(([area]) => area.name)
        ).toEqual(['Business & Money', 'Tech & Systems', 'Family & Social']);
    });

    it('shows a discreet link in the header when areas exist', () => {
        mockAreas = [{ uid: 'a1', name: 'Garden' }];
        renderAreas();

        expect(screen.getByTestId('suggest-domains-link')).toBeInTheDocument();
        expect(screen.queryByTestId('suggest-domains-button')).toBeNull();
    });

    it('hides the link once every domain exists', () => {
        mockAreas = DOMAINS.map((name, i) => ({ uid: `a${i}`, name }));
        renderAreas();

        expect(screen.queryByTestId('suggest-domains-link')).toBeNull();
    });
});
