import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SummaryPage from '../SummaryPage';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        i18n: { language: 'en' },
    }),
}));

const fetchSummary = jest.fn();
jest.mock('../../../utils/summaryService', () => ({
    fetchSummary: (...args: unknown[]) => fetchSummary(...args),
}));

const updateUiSettings = jest.fn();
jest.mock('../../../utils/profileService', () => ({
    fetchProfile: () =>
        Promise.resolve({
            ui_settings: {
                summary: { group_by: 'status', include_open: true },
            },
        }),
    getFirstDayOfWeek: () => Promise.resolve(1),
    updateUiSettings: (...args: unknown[]) => updateUiSettings(...args),
}));

const response = {
    start: '2026-02-09',
    end: '2026-02-15',
    timezone: 'UTC',
    include_open: true,
    completed_count: 1,
    open_count: 1,
    tasks: [
        {
            uid: 'a',
            name: 'Shipped release',
            status: 'done',
            completed_at: '2026-02-10T10:00:00.000Z',
            completed_date: '2026-02-10',
            due_date: null,
            project: { uid: 'p', name: 'Launch' },
            tags: ['work'],
        },
        {
            uid: 'b',
            name: 'Write notes',
            status: 'not_started',
            completed_at: null,
            completed_date: null,
            due_date: '2026-02-12',
            project: null,
            tags: [],
        },
    ],
};

describe('SummaryPage', () => {
    beforeEach(() => {
        fetchSummary.mockReset();
        fetchSummary.mockResolvedValue(response);
        updateUiSettings.mockReset();
        updateUiSettings.mockResolvedValue({ success: true });
    });

    it('applies the saved template and lists grouped tasks', async () => {
        render(<SummaryPage />);

        expect(await screen.findByText('Shipped release')).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchSummary).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.any(String),
                true
            )
        );
        expect(screen.getByLabelText('Group by')).toHaveValue('status');
        expect(
            screen.getByRole('heading', { name: /^done/ })
        ).toBeInTheDocument();
    });

    it('copies markdown to the clipboard', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        render(<SummaryPage />);
        await screen.findByText('Shipped release');

        fireEvent.change(screen.getByLabelText('Group by'), {
            target: { value: 'project' },
        });
        fireEvent.click(screen.getByText('Copy as Markdown'));

        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const md = writeText.mock.calls[0][0] as string;
        expect(md).toContain('## Launch (1)');
        expect(md).toContain('- [x] Shipped release #work');
        expect(md).toContain('- [ ] Write notes');
    });

    it('saves the grouping as a template', async () => {
        render(<SummaryPage />);
        await screen.findByText('Shipped release');
        fireEvent.change(screen.getByLabelText('Group by'), {
            target: { value: 'day' },
        });
        fireEvent.click(screen.getByText('Save as template'));
        await waitFor(() =>
            expect(updateUiSettings).toHaveBeenCalledWith({
                summary: { group_by: 'day', include_open: true },
            })
        );
    });

    it('prints with window.print', async () => {
        const print = jest
            .spyOn(window, 'print')
            .mockImplementation(() => undefined);
        render(<SummaryPage />);
        await screen.findByText('Shipped release');
        fireEvent.click(screen.getByText('Print'));
        expect(print).toHaveBeenCalled();
        print.mockRestore();
    });
});
