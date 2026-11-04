import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BriefCard from '../BriefCard';
import { fetchDailyBrief } from '../../../utils/dailyBriefService';
import { RESPONSE } from './fixtures';

jest.mock('react-i18next', () => {
    const t = (
        key: string,
        fallback?: unknown,
        options?: Record<string, unknown>
    ) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
            String(options?.[name] ?? '')
        );
    };
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
});
jest.mock('../../../utils/dateUtils', () => ({
    getTodayDateString: () => '2026-11-04',
}));
jest.mock('../../../utils/dailyBriefService', () => ({
    fetchDailyBrief: jest.fn(),
}));

describe('BriefCard', () => {
    it('shows the verdict, the counters and a link to the full brief', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue(RESPONSE);
        render(
            <MemoryRouter>
                <BriefCard />
            </MemoryRouter>
        );
        expect(
            await screen.findByText('Ce soir, une seule chose compte.')
        ).toBeInTheDocument();
        expect(screen.getByText(/en retard/)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Voir le résumé' })
        ).toHaveAttribute('href', '/insights/daily-brief');
        expect(fetchDailyBrief).toHaveBeenCalledWith('2026-11-04');
    });

    it('still links to the page when no brief exists yet', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            brief: null,
        });
        render(
            <MemoryRouter>
                <BriefCard />
            </MemoryRouter>
        );
        expect(
            await screen.findByText("Pas encore de résumé pour aujourd'hui.")
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Voir le résumé' })
        ).toBeInTheDocument();
    });
});
