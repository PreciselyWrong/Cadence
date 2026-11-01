import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommandPalette from '../CommandPalette';
import { searchUniversal } from '../../../utils/searchService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: unknown) =>
            typeof fallback === 'string' ? fallback : _key,
    }),
}));

jest.mock('react-router-dom', () => ({
    useNavigate: () => jest.fn(),
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

describe('CommandPalette search', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Element.prototype.scrollIntoView = jest.fn();
        window.open = jest.fn();
    });

    it('includes links in the search and opens one at its address', async () => {
        (searchUniversal as jest.Mock).mockResolvedValue({
            results: [
                {
                    type: 'Link',
                    id: 2,
                    uid: 'l1',
                    name: 'Marathon plan',
                    title: 'Marathon plan',
                    url: 'https://example.com/marathon-plan',
                },
            ],
        });
        render(<CommandPalette {...props} />);
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'marathon' },
        });

        const row = await screen.findByRole('option', {
            name: /Marathon plan/,
        });
        expect(searchUniversal).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.arrayContaining(['Link']),
            })
        );
        expect(screen.getByText('Links')).toBeInTheDocument();

        fireEvent.click(row);
        expect(window.open).toHaveBeenCalledWith(
            'https://example.com/marathon-plan',
            '_blank',
            'noopener'
        );
    });

    it('marks the typed text inside each result', async () => {
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
        render(<CommandPalette {...props} />);
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'MARATHON' },
        });

        const mark = await screen.findByText('marathon', { selector: 'mark' });
        expect(mark.parentElement).toHaveTextContent('Run a marathon');
    });
});
