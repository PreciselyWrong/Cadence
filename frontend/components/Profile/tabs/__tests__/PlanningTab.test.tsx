import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import PlanningTab from '../PlanningTab';
import {
    fetchDayHours,
    fetchPlanRanking,
    fetchSuggestionSettings,
    savePlanRanking,
    saveSuggestionSettings,
    RankingBucket,
    SuggestionSettings,
} from '../../../../utils/dailyPlanService';
import { fetchProjects } from '../../../../utils/projectsService';
import {
    fetchProfile,
    updateUiSettings,
} from '../../../../utils/profileService';
import { listProposals } from '../../../../utils/proposalsService';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any, options?: any) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, name: string) => options?.[name] ?? ''
        );
    };
    const value = { t };
    return { useTranslation: () => value };
});

const showErrorToast = jest.fn();
jest.mock('../../../Shared/ToastContext', () => ({
    useToast: () => ({ showErrorToast }),
}));

jest.mock('../../../../utils/dailyPlanService', () => ({
    fetchPlanRanking: jest.fn(),
    savePlanRanking: jest.fn(),
    fetchDayHours: jest.fn(),
    saveDayHours: jest.fn(),
    fetchSuggestionSettings: jest.fn(),
    saveSuggestionSettings: jest.fn(),
}));

jest.mock('../../../../utils/projectsService', () => ({
    fetchProjects: jest.fn(),
}));

jest.mock('../../../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn(),
}));

jest.mock('../../../../utils/proposalsService', () => ({
    listProposals: jest.fn(),
}));

// dateUtils loads the real i18n setup, which the react-i18next mock above
// cannot provide.
jest.mock('../../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'Europe/Athens',
}));

const SETTINGS: SuggestionSettings = {
    projectStatuses: ['in_progress'],
    includeNoProject: true,
    excludedProjectIds: [],
    tieBreak: 'recently_touched',
    staleAfterDays: null,
    horizonDays: 3,
    maxSuggestions: 20,
    alignDueToPlan: false,
};

const OPTIONS = {
    projectStatuses: [
        'not_started',
        'in_progress',
        'done',
        'waiting',
        'cancelled',
        'planned',
    ],
    tieBreak: ['recently_touched', 'newest', 'oldest'],
    staleAfterDays: [null, 90, 180],
    horizonDays: [1, 3, 7],
    maxSuggestions: [10, 20, 50],
};

const DEFAULT: RankingBucket[] = [
    'overdue:project',
    'overdue:none',
    'due_today:project',
    'due_today:none',
    'in_progress:project',
    'in_progress:none',
    'suggested:project',
    'suggested:none',
];

const rows = () =>
    screen
        .getAllByTestId(/^planning-bucket-/)
        .map((row) => row.getAttribute('data-testid'));

const renderTab = () =>
    render(
        <MemoryRouter>
            <PlanningTab isActive />
        </MemoryRouter>
    );

describe('PlanningTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (listProposals as jest.Mock).mockResolvedValue({
            proposals: [],
            agent: false,
        });
        (fetchProfile as jest.Mock).mockResolvedValue({
            ui_settings: {},
        });
        (fetchPlanRanking as jest.Mock).mockResolvedValue({
            order: DEFAULT,
            default_order: DEFAULT,
        });
        (savePlanRanking as jest.Mock).mockImplementation(async (order) => ({
            order,
            default_order: DEFAULT,
        }));
        (fetchDayHours as jest.Mock).mockResolvedValue({
            start: 480,
            end: 1080,
        });
        (fetchSuggestionSettings as jest.Mock).mockResolvedValue({
            settings: SETTINGS,
            defaults: SETTINGS,
            options: OPTIONS,
        });
        (saveSuggestionSettings as jest.Mock).mockImplementation(
            async (patch) => ({
                settings: { ...SETTINGS, ...patch },
                defaults: SETTINGS,
                options: OPTIONS,
            })
        );
        (fetchProjects as jest.Mock).mockResolvedValue([
            { id: 2, name: 'Garden' },
            { id: 1, name: 'Work' },
        ]);
    });

    it('lists every group split by project and no project', async () => {
        renderTab();
        await waitFor(() => expect(rows()).toHaveLength(8));
        expect(screen.getByText('Overdue · in a project')).toBeInTheDocument();
        expect(
            screen.getByText('Everything else · no project')
        ).toBeInTheDocument();
        expect(screen.queryByText('Reset to default')).not.toBeInTheDocument();
    });

    it('moves a row and saves the new order', async () => {
        renderTab();
        await waitFor(() => expect(rows()).toHaveLength(8));

        fireEvent.click(
            screen.getByRole('button', { name: 'Move Overdue · no project up' })
        );

        const expected = [
            'overdue:none',
            'overdue:project',
            ...DEFAULT.slice(2),
        ];
        expect(savePlanRanking).toHaveBeenCalledWith(expected);
        expect(rows()[0]).toBe('planning-bucket-overdue:none');

        fireEvent.click(screen.getByText('Reset to default'));
        expect(savePlanRanking).toHaveBeenLastCalledWith(DEFAULT);
    });

    it('puts the old order back when saving fails', async () => {
        (savePlanRanking as jest.Mock).mockRejectedValue(new Error('nope'));
        renderTab();
        await waitFor(() => expect(rows()).toHaveLength(8));

        fireEvent.click(
            screen.getByRole('button', { name: 'Move Overdue · no project up' })
        );

        await waitFor(() =>
            expect(rows()[0]).toBe('planning-bucket-overdue:project')
        );
        expect(showErrorToast).toHaveBeenCalled();
    });

    describe('suggestion settings', () => {
        const loaded = async () => {
            renderTab();
            await screen.findByTestId('planning-suggestions');
        };
        const select = (testId: string) =>
            screen.getByTestId(testId) as HTMLSelectElement;
        const checkbox = (testId: string) =>
            screen.getByTestId(testId) as HTMLInputElement;

        it('describes Everything else from the saved settings', async () => {
            await loaded();

            expect(
                screen.getAllByText(
                    /Open tasks from projects marked “in_progress”, and tasks with no project\..*due more than 3 days out are left out\. 20 load at first; Show more brings the rest\./
                )
            ).toHaveLength(2);
            expect(
                screen.getByText(
                    'The earlier due date first, then the task changed most recently.'
                )
            ).toBeInTheDocument();
        });

        it('saves each control and updates the texts', async () => {
            await loaded();

            fireEvent.change(select('planning-tie-break'), {
                target: { value: 'oldest' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                tieBreak: 'oldest',
            });
            expect(
                screen.getByText(
                    'The earlier due date first, then the oldest task.'
                )
            ).toBeInTheDocument();

            fireEvent.change(select('planning-stale'), {
                target: { value: '180' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                staleAfterDays: 180,
            });

            fireEvent.change(select('planning-stale'), {
                target: { value: '' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                staleAfterDays: null,
            });

            fireEvent.change(select('planning-horizon'), {
                target: { value: '7' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                horizonDays: 7,
            });
            expect(
                screen.getAllByText(/due more than 7 days out are left out/)
            ).toHaveLength(2);

            fireEvent.change(select('planning-max'), {
                target: { value: '50' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                maxSuggestions: 50,
            });

            fireEvent.click(checkbox('planning-status-planned'));
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                projectStatuses: ['in_progress', 'planned'],
            });

            fireEvent.click(checkbox('planning-include-no-project'));
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                includeNoProject: false,
            });
        });

        it('saves the option that makes planning move the due date', async () => {
            await loaded();

            fireEvent.click(checkbox('planning-align-due'));

            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                alignDueToPlan: true,
            });
            expect(checkbox('planning-align-due')).toBeChecked();
        });

        it('adds and removes a project to never suggest', async () => {
            await loaded();
            await waitFor(() =>
                expect(select('planning-exclude-project').options).toHaveLength(
                    3
                )
            );

            fireEvent.change(select('planning-exclude-project'), {
                target: { value: '2' },
            });
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                excludedProjectIds: [2],
            });
            expect(
                screen.getByTestId('planning-excluded-projects')
            ).toHaveTextContent('Garden');

            fireEvent.click(
                screen.getByRole('button', { name: 'Suggest Garden again' })
            );
            expect(saveSuggestionSettings).toHaveBeenLastCalledWith({
                excludedProjectIds: [],
            });
            expect(
                screen.queryByTestId('planning-excluded-projects')
            ).not.toBeInTheDocument();
        });

        it('puts the old value back when saving fails', async () => {
            (saveSuggestionSettings as jest.Mock).mockRejectedValue(
                new Error('nope')
            );
            await loaded();

            fireEvent.change(select('planning-horizon'), {
                target: { value: '7' },
            });
            expect(select('planning-horizon').value).toBe('7');
            await waitFor(() =>
                expect(select('planning-horizon').value).toBe('3')
            );

            fireEvent.click(checkbox('planning-include-no-project'));
            await waitFor(() =>
                expect(checkbox('planning-include-no-project').checked).toBe(
                    true
                )
            );
            expect(showErrorToast).toHaveBeenCalledWith(
                'Could not save your suggestion settings'
            );
        });
    });

    describe('Morning overdue replan', () => {
        beforeEach(() => {
            (fetchPlanRanking as jest.Mock).mockResolvedValue({
                order: ['tagged_today', 'overdue'],
                default_order: ['tagged_today', 'overdue'],
            });
            (fetchDayHours as jest.Mock).mockResolvedValue({
                start: 480,
                end: 1080,
            });
            (fetchSuggestionSettings as jest.Mock).mockResolvedValue({
                settings: {
                    projectStatuses: ['in_progress'],
                    includeNoProject: true,
                    excludedProjectIds: [],
                    tieBreak: 'recently_touched',
                    staleAfterDays: null,
                    horizonDays: 3,
                    maxSuggestions: 20,
                    alignDueToPlan: false,
                },
                defaults: {},
                options: {
                    projectStatuses: ['in_progress'],
                    tieBreak: ['recently_touched'],
                    staleAfterDays: [null],
                    horizonDays: [3],
                    maxSuggestions: [20],
                },
            });
            (fetchProjects as jest.Mock).mockResolvedValue([]);
            (updateUiSettings as jest.Mock).mockResolvedValue({
                success: true,
            });
        });

        it('is hidden when no agent listens', async () => {
            (listProposals as jest.Mock).mockResolvedValue({
                proposals: [],
                agent: false,
            });
            (fetchProfile as jest.Mock).mockResolvedValue({
                ui_settings: {},
            });

            render(
                <MemoryRouter>
                    <PlanningTab isActive={true} />
                </MemoryRouter>
            );
            await waitFor(() => expect(listProposals).toHaveBeenCalled());
            expect(
                screen.queryByTestId('planning-morning-replan')
            ).not.toBeInTheDocument();
        });

        it('shows when an agent listens and saves toggle and time', async () => {
            (listProposals as jest.Mock).mockResolvedValue({
                proposals: [],
                agent: true,
            });
            (fetchProfile as jest.Mock).mockResolvedValue({
                ui_settings: {
                    planning: {
                        morningReplan: { enabled: true, time: '06:30' },
                    },
                },
            });

            render(
                <MemoryRouter>
                    <PlanningTab isActive={true} />
                </MemoryRouter>
            );

            await screen.findByTestId('planning-morning-replan');
            const toggle = screen.getByTestId(
                'planning-morning-replan-enabled'
            ) as HTMLInputElement;
            const timeInput = screen.getByTestId(
                'planning-morning-replan-time'
            ) as HTMLInputElement;
            expect(toggle.checked).toBe(true);
            expect(timeInput.value).toBe('06:30');

            fireEvent.change(timeInput, { target: { value: '07:15' } });
            await waitFor(() =>
                expect(updateUiSettings).toHaveBeenCalledWith({
                    planning: {
                        morningReplan: { enabled: true, time: '07:15' },
                    },
                })
            );

            fireEvent.click(toggle);
            await waitFor(() =>
                expect(updateUiSettings).toHaveBeenCalledWith({
                    planning: {
                        morningReplan: { enabled: false, time: '07:15' },
                    },
                })
            );
        });
    });
});
