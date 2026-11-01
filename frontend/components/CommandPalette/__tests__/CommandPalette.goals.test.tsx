import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommandPalette from '../CommandPalette';
import { searchUniversal } from '../../../utils/searchService';

const navigate = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: unknown) =>
            typeof fallback === 'string' ? fallback : _key,
    }),
}));

jest.mock('react-router-dom', () => ({
    useNavigate: () => navigate,
}));

jest.mock('../../../utils/searchService', () => ({
    searchUniversal: jest.fn(),
}));

jest.mock('../../../utils/cadenceHabitsService', () => ({
    fetchCadenceHabits: jest.fn().mockResolvedValue({ habits: [] }),
}));

const props = {
    target: null,
    startStep: 'root' as const,
    projects: [],
    actions: {} as never,
    onClose: jest.fn(),
    onOpenHelp: jest.fn(),
    onToggleTheme: jest.fn(),
    onCreateProject: jest.fn(),
    onCreateNote: jest.fn(),
    onCreateHabit: jest.fn(),
    onOpenTask: jest.fn(),
};

describe('CommandPalette goals', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Element.prototype.scrollIntoView = jest.fn();
        (searchUniversal as jest.Mock).mockResolvedValue({
            results: [
                {
                    type: 'Goal',
                    id: 1,
                    uid: 'g1',
                    name: 'Run a marathon',
                    title: 'Run a marathon',
                },
            ],
        });
    });

    it('asks for goals, lists them and opens the goal page', async () => {
        render(<CommandPalette {...props} />);
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'marathon' },
        });

        const row = await screen.findByRole('option', {
            name: /Run a marathon/,
        });
        expect(searchUniversal).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.arrayContaining(['Goal']),
            })
        );
        expect(screen.getByText('Goals')).toBeInTheDocument();

        fireEvent.click(row);
        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/goal/g1-run-a-marathon')
        );
    });
});
