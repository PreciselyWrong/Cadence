import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TriageTab from '../TriageTab';
import {
    deleteMailRule,
    fetchMailRules,
    fetchTriageSettings,
    saveTriageSettings,
} from '../../../../utils/triageService';

jest.mock('../../../../utils/triageService', () => ({
    ...jest.requireActual('../../../../utils/triageService'),
    fetchTriageSettings: jest.fn(),
    saveTriageSettings: jest.fn(),
    fetchMailRules: jest.fn(),
    deleteMailRule: jest.fn(),
}));
jest.mock('../../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest
        .fn()
        .mockResolvedValue([{ uid: 'feed-a', name: 'Agenda fictif' }]),
}));
jest.mock('../../../../utils/googleSyncService', () => ({
    fetchGoogleStatus: jest.fn().mockResolvedValue(null),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const SETTINGS = {
    calendarFeedUids: [],
    calendarLookaheadDays: 7,
    thresholds: {
        postponements: 3,
        duplicateSimilarity: 0.8,
        closedLookbackDays: 7,
    },
    alerts: { disabled: [] },
    triage: { enabled: false, dailyLimit: 20 },
};

describe('TriageTab', () => {
    beforeEach(() => {
        (fetchTriageSettings as jest.Mock).mockResolvedValue(SETTINGS);
        (saveTriageSettings as jest.Mock).mockImplementation(
            async (next) => next
        );
        (fetchMailRules as jest.Mock).mockResolvedValue([]);
        (deleteMailRule as jest.Mock).mockResolvedValue(undefined);
    });

    it('saves the calendars read, the alerts and the assistant', async () => {
        render(
            <MemoryRouter>
                <TriageTab isActive />
            </MemoryRouter>
        );
        fireEvent.click(await screen.findByLabelText('Agenda fictif'));
        fireEvent.click(screen.getByLabelText('postponed'));
        fireEvent.click(
            screen.getByLabelText('Propositions de l’IA dans À trier')
        );
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() =>
            expect(saveTriageSettings).toHaveBeenCalledWith({
                ...SETTINGS,
                calendarFeedUids: ['feed-a'],
                alerts: { disabled: ['postponed'] },
                triage: { enabled: true, dailyLimit: 20 },
            })
        );
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Réglages enregistrés'
        );
    });

    it('lists sender rules and removes one on click', async () => {
        (fetchMailRules as jest.Mock).mockResolvedValue([
            { address: 'news@example.com', action: 'archive' },
        ]);
        render(
            <MemoryRouter>
                <TriageTab isActive />
            </MemoryRouter>
        );
        expect(await screen.findByText('news@example.com')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
        await waitFor(() =>
            expect(deleteMailRule).toHaveBeenCalledWith('news@example.com')
        );
        await waitFor(() =>
            expect(screen.queryByText('news@example.com')).toBeNull()
        );
    });
});
