import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import BriefCard from '../BriefCard';
import {
    fetchBriefSettings,
    fetchDailyBrief,
    fetchDailyEvening,
} from '../../../utils/dailyBriefService';
import { getUserTimezone } from '../../../utils/dateUtils';
import { EVENING_RESPONSE, RESPONSE, SETTINGS } from './fixtures';

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
    getUserTimezone: jest.fn(() => 'Europe/Paris'),
}));
jest.mock('../../../utils/dailyBriefService', () => ({
    fetchDailyBrief: jest.fn(),
    fetchBriefSettings: jest.fn(),
    fetchDailyEvening: jest.fn(),
}));

// 10:00 UTC is 11:00 in Paris on 4 November 2026 (before the 18:00 switch).
const BEFORE_SWITCH = new Date('2026-11-04T10:00:00Z');
// 17:00 UTC is 18:00 in Paris: the switch time itself.
const AT_SWITCH = new Date('2026-11-04T17:00:00Z');

const renderCard = () =>
    render(
        <MemoryRouter>
            <BriefCard />
        </MemoryRouter>
    );

describe('BriefCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ now: BEFORE_SWITCH });
        (getUserTimezone as jest.Mock).mockReturnValue('Europe/Paris');
        (fetchDailyBrief as jest.Mock).mockResolvedValue(RESPONSE);
        (fetchBriefSettings as jest.Mock).mockResolvedValue(SETTINGS);
        (fetchDailyEvening as jest.Mock).mockResolvedValue(EVENING_RESPONSE);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows the verdict, the counters and a link to the full brief', async () => {
        renderCard();

        expect(
            await screen.findByText('Ce soir, une seule chose compte.')
        ).toBeInTheDocument();
        expect(screen.getByText(/en retard/)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Voir le résumé' })
        ).toHaveAttribute('href', '/insights/daily-brief');
        expect(fetchDailyBrief).toHaveBeenCalledWith('2026-11-04');
        expect(fetchDailyEvening).not.toHaveBeenCalled();
    });

    it('still links to the page when no brief exists yet', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            brief: null,
        });
        renderCard();

        expect(
            await screen.findByText("Pas encore de résumé pour aujourd'hui.")
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Voir le résumé' })
        ).toBeInTheDocument();
    });

    it('shows the evening review from the switch time on', async () => {
        jest.setSystemTime(AT_SWITCH);
        renderCard();

        expect(
            await screen.findByText(EVENING_RESPONSE.evening.verdict.text)
        ).toBeInTheDocument();
        expect(fetchDailyEvening).toHaveBeenCalledWith('2026-11-04');
        expect(
            screen.getByRole('link', { name: 'Voir le bilan du soir' })
        ).toHaveAttribute('href', '/insights/daily-brief');
    });

    it('keeps the morning brief when the evening review is disabled', async () => {
        jest.setSystemTime(AT_SWITCH);
        (fetchBriefSettings as jest.Mock).mockResolvedValue({
            ...SETTINGS,
            evening: { enabled: false, switchTime: '18:00' },
        });
        renderCard();

        expect(
            await screen.findByText('Ce soir, une seule chose compte.')
        ).toBeInTheDocument();
        expect(fetchDailyEvening).not.toHaveBeenCalled();
    });

    it('reads the switch in the profile timezone, not the browser one', async () => {
        // 10:00 UTC is 23:00 in Auckland on the same day: past the switch there,
        // although it is 11:00 in Paris.
        (getUserTimezone as jest.Mock).mockReturnValue('Pacific/Auckland');
        renderCard();

        expect(
            await screen.findByText(EVENING_RESPONSE.evening.verdict.text)
        ).toBeInTheDocument();
        expect(fetchDailyEvening).toHaveBeenCalledWith('2026-11-04');
    });
});
