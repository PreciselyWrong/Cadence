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
import BriefPage from '../BriefPage';
import {
    answerBriefQuestion,
    fetchBriefSettings,
    fetchDailyBrief,
    recordBriefDecision,
    regenerateDailyBrief,
} from '../../../utils/dailyBriefService';
import { toggleTaskCompletion, updateTask } from '../../../utils/tasksService';
import { openTaskPanel } from '../../../store/taskPanelStore';
import { RESPONSE, SETTINGS, TASKS, TODAY } from './fixtures';

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
    fetchBriefSettings: jest.fn(),
    regenerateDailyBrief: jest.fn(),
    recordBriefDecision: jest.fn(),
    answerBriefQuestion: jest.fn(),
}));
jest.mock('../../../utils/tasksService', () => ({
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn(),
}));
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));
const showUndoToast = jest.fn();
const showErrorToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showUndoToast, showErrorToast }),
}));

const renderPage = () =>
    render(
        <MemoryRouter>
            <BriefPage />
        </MemoryRouter>
    );

const sectionNames = () =>
    screen
        .getAllByRole('region')
        .map((section) => section.getAttribute('aria-label'));

describe('BriefPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchDailyBrief as jest.Mock).mockResolvedValue(RESPONSE);
        (fetchBriefSettings as jest.Mock).mockResolvedValue(SETTINGS);
        (recordBriefDecision as jest.Mock).mockResolvedValue({});
        (answerBriefQuestion as jest.Mock).mockResolvedValue({});
        (toggleTaskCompletion as jest.Mock).mockResolvedValue({
            ...TASKS.t1,
            status: 'done',
            completed_at: '2026-11-04T10:00:00Z',
        });
        (updateTask as jest.Mock).mockResolvedValue({});
    });

    it('renders the verdict, then the sections in the settings order', async () => {
        renderPage();
        expect(
            await screen.findByText('Ce soir, une seule chose compte.')
        ).toBeInTheDocument();
        expect(sectionNames()).toEqual([
            'Les prochains jours',
            'Ce soir',
            'À déplacer',
            'À anticiper',
            'Réponses attendues',
        ]);
    });

    it('hides the sections that are missing from the settings', async () => {
        (fetchBriefSettings as jest.Mock).mockResolvedValue({
            ...SETTINGS,
            sections: ['tonight', 'moves'],
        });
        renderPage();
        await screen.findByText('Ce soir');
        expect(sectionNames()).toEqual(['Ce soir', 'À déplacer']);
        expect(screen.queryByText('À anticiper')).not.toBeInTheDocument();
    });

    it('marks a conflicting event in red', async () => {
        renderPage();
        const conflict = await screen.findByTestId('brief-event-conflict');
        expect(conflict).toBeInTheDocument();
        expect(screen.getByText(/Dentiste/)).toBeInTheDocument();
    });

    it('completes a task through the task service and offers undo', async () => {
        renderPage();
        const row = (await screen.findByText('Envoyer la déclaration')).closest(
            '[data-testid="brief-task-row"]'
        ) as HTMLElement;
        fireEvent.click(within(row).getByRole('checkbox'));
        await waitFor(() =>
            expect(toggleTaskCompletion).toHaveBeenCalledWith('t1')
        );
        expect(showUndoToast).toHaveBeenCalled();
    });

    it('opens the task panel when a task title is clicked', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('Envoyer la déclaration'));
        expect(openTaskPanel).toHaveBeenCalledWith('t1');
    });

    it('moves the task when its date pill is tapped and records the accepted move', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Déplacer au sam. 7' })
        );
        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t2', {
                due_date: '2026-11-07',
            })
        );
        expect(recordBriefDecision).toHaveBeenCalledWith(
            TODAY,
            expect.objectContaining({
                kind: 'move',
                decision: 'accepted',
                target_ref: 't2',
                fingerprint: 'move:t2:2026-11-07',
            })
        );
    });

    it('posts the answer to a question', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Oui' }));
        await waitFor(() =>
            expect(answerBriefQuestion).toHaveBeenCalledWith(
                TODAY,
                expect.objectContaining({
                    question_key: 'garage-same-car',
                    answer: 'yes',
                    target: {
                        scope: 'event',
                        ref: 'event:f:e2:2026-11-05T08:30',
                    },
                })
            )
        );
    });

    it('records a feedback vote on a card', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Bruit' }));
        await waitFor(() =>
            expect(recordBriefDecision).toHaveBeenCalledWith(
                TODAY,
                expect.objectContaining({
                    kind: 'feedback',
                    proposal: {
                        card_type: 'event_in_work_hours',
                        vote: 'noise',
                    },
                })
            )
        );
    });

    it('shows an empty state with a button that generates the brief', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            brief: null,
            status: null,
            tasks: {},
        });
        (regenerateDailyBrief as jest.Mock).mockResolvedValue(RESPONSE);
        renderPage();
        expect(
            await screen.findByText("Pas encore de résumé pour aujourd'hui.")
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Générer maintenant' })
        );
        await waitFor(() =>
            expect(regenerateDailyBrief).toHaveBeenCalledWith(TODAY)
        );
    });

    it('shows the error of a failed generation and offers to regenerate', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            status: 'failed',
        });
        renderPage();
        expect(
            await screen.findByText(
                'La dernière génération a échoué. Le résumé précédent est gardé.'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Régénérer' })
        ).toBeInTheDocument();
    });
});
