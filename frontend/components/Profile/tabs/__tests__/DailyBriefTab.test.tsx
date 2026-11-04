import React from 'react';
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DailyBriefTab from '../DailyBriefTab';
import {
    fetchBriefSettings,
    fetchBriefStatus,
    saveBriefSettings,
    saveShowDailyBrief,
} from '../../../../utils/dailyBriefService';
import { fetchCalendarFeeds } from '../../../../utils/calendarFeedsService';
import { fetchGoogleStatus } from '../../../../utils/googleSyncService';
import { SETTINGS } from '../../../DailyBrief/__tests__/fixtures';

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
jest.mock('../../../../utils/dailyBriefService', () => ({
    fetchBriefSettings: jest.fn(),
    fetchBriefStatus: jest.fn(),
    saveBriefSettings: jest.fn(),
    saveShowDailyBrief: jest.fn(),
}));
jest.mock('../../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest.fn(),
}));
jest.mock('../../../../utils/googleSyncService', () => ({
    fetchGoogleStatus: jest.fn(),
}));

const renderTab = () =>
    render(
        <MemoryRouter>
            <DailyBriefTab isActive />
        </MemoryRouter>
    );

describe('DailyBriefTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchBriefSettings as jest.Mock).mockResolvedValue(SETTINGS);
        (fetchBriefStatus as jest.Mock).mockResolvedValue({
            sources: [
                {
                    id: 'calendar',
                    configured: false,
                    working: null,
                    detail: null,
                },
                {
                    id: 'mail',
                    configured: false,
                    working: null,
                    detail: 'disabled',
                },
            ],
            timezone_set: false,
        });
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([
            {
                uid: 'feed-1',
                name: 'Travail',
                url_host: 'x',
                color: null,
                last_fetched_at: null,
                last_error: null,
                show_on_calendar: true,
            },
        ]);
        (fetchGoogleStatus as jest.Mock).mockResolvedValue({
            configured: false,
            connected: false,
            calendars: [],
        });
        (saveBriefSettings as jest.Mock).mockImplementation(async (patch) => ({
            ...SETTINGS,
            ...patch,
        }));
        (saveShowDailyBrief as jest.Mock).mockResolvedValue(undefined);
    });

    it('shows the timezone warning from the status', async () => {
        renderTab();
        expect(
            await screen.findByText(/Le fuseau horaire n’est pas défini/)
        ).toBeInTheDocument();
    });

    it('saves the generation switch through the service', async () => {
        renderTab();
        fireEvent.click(await screen.findByLabelText('Générer chaque matin'));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() =>
            expect(saveBriefSettings).toHaveBeenCalledWith(
                expect.objectContaining({ enabled: false })
            )
        );
    });

    it('sends a null for an evening window that was cleared', async () => {
        renderTab();
        await screen.findByText('Soir et charge');
        // Wednesday (weekday 3) is the only window in the fixture.
        const row = screen.getByTestId('brief-evening-3');
        fireEvent.click(within(row).getByRole('button', { name: 'Retirer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() =>
            expect(saveBriefSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    capacity: expect.objectContaining({
                        evening: { '3': null },
                    }),
                })
            )
        );
    });

    it('drops a section from the saved list when its checkbox is unchecked', async () => {
        renderTab();
        const row = await screen.findByTestId('brief-section-replies');
        fireEvent.click(within(row).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(saveBriefSettings).toHaveBeenCalled());
        const patch = (saveBriefSettings as jest.Mock).mock.calls[0][0];
        expect(patch.sections).not.toContain('replies');
        expect(patch.sections).toContain('tonight');
    });

    it('turns the Today card on through the profile setting', async () => {
        renderTab();
        fireEvent.click(
            await screen.findByLabelText("Afficher le résumé sur Aujourd'hui")
        );
        await waitFor(() =>
            expect(saveShowDailyBrief).toHaveBeenCalledWith(true)
        );
    });
});
