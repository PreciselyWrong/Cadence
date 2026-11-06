import React from 'react';
import {
    act,
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
    fetchDailyEvening,
    recordBriefDecision,
    regenerateDailyBrief,
} from '../../../utils/dailyBriefService';
import { toggleTaskCompletion, updateTask } from '../../../utils/tasksService';
import { openTaskPanel } from '../../../store/taskPanelStore';
import {
    EVENING,
    BRIEF,
    EVENING_RESPONSE,
    RESPONSE,
    SETTINGS,
    TASKS,
    TODAY,
} from './fixtures';
import {
    carryOverTasks,
    fetchDailyPlan,
    saveDailyPlanItems,
} from '../../../utils/dailyPlanService';
import { decideTask } from '../../../utils/reviewService';

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
    getUserTimezone: () => 'Europe/Paris',
}));
jest.mock('../../../utils/dailyBriefService', () => ({
    fetchDailyBrief: jest.fn(),
    fetchBriefSettings: jest.fn(),
    fetchDailyEvening: jest.fn(),
    regenerateDailyBrief: jest.fn(),
    recordBriefDecision: jest.fn(),
    answerBriefQuestion: jest.fn(),
}));
jest.mock('../../../utils/dailyPlanService', () => ({
    carryOverTasks: jest.fn(),
    fetchDailyPlan: jest.fn(),
    saveDailyPlanItems: jest.fn(),
    toPlanItemInputs: (items: { task_uid: string }[]) =>
        items.map((item) => ({ task_uid: item.task_uid })),
}));
jest.mock('../../../utils/tasksService', () => ({
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn(),
}));
jest.mock('../../../utils/reviewService', () => ({
    decideTask: jest.fn(),
}));
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));
const showUndoToast = jest.fn();
const showErrorToast = jest.fn();
const showSuccessToast = jest.fn();
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({ showUndoToast, showErrorToast, showSuccessToast }),
}));

// 10:00 UTC is 11:00 in Paris (morning view); 17:00 UTC is 18:00 (switch).
const BEFORE_SWITCH = new Date('2026-11-04T10:00:00Z');
const AT_SWITCH = new Date('2026-11-04T17:00:00Z');

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
        jest.useFakeTimers({ now: BEFORE_SWITCH });
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

    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders the verdict, then the sections in the settings order', async () => {
        renderPage();
        expect(
            await screen.findByText('Ce soir, une seule chose compte.')
        ).toBeInTheDocument();
        expect(sectionNames()).toEqual([
            'Les prochains jours',
            'Priorités du jour',
            'À déplacer',
            'À anticiper',
        ]);
    });

    it('hides the sections that are missing from the settings', async () => {
        (fetchBriefSettings as jest.Mock).mockResolvedValue({
            ...SETTINGS,
            sections: ['tonight', 'moves'],
        });
        renderPage();
        await screen.findByText('Priorités du jour');
        expect(sectionNames()).toEqual(['Priorités du jour', 'À déplacer']);
        expect(screen.queryByText('À anticiper')).not.toBeInTheDocument();
    });

    it('marks a conflicting event in red', async () => {
        renderPage();
        const conflict = await screen.findByTestId('brief-event-conflict');
        expect(conflict).toBeInTheDocument();
        expect(screen.getAllByText(/Dentiste/).length).toBeGreaterThan(0);
    });

    it('marks every two hours on each day of the timeline', async () => {
        renderPage();
        await screen.findByTestId('brief-event-conflict');
        expect(screen.getAllByTestId('brief-grid-line')).toHaveLength(8);
    });

    it('has one feedback on the screen and fewer alerts behind a menu', async () => {
        renderPage();
        await screen.findByText('À anticiper');
        expect(screen.getAllByRole('button', { name: 'Utile' })).toHaveLength(
            1
        );
        fireEvent.click(
            screen.getAllByRole('button', {
                name: 'Options de cette alerte',
            })[0]
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Moins de ce type' })
        );
        await waitFor(() =>
            expect(recordBriefDecision).toHaveBeenCalledWith(
                TODAY,
                expect.objectContaining({
                    kind: 'feedback',
                    proposal: expect.objectContaining({ vote: 'noise' }),
                })
            )
        );
    });

    it('moves a task to another date and records that date', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Autre date' })
        );
        fireEvent.change(screen.getByLabelText('Autre date'), {
            target: { value: '2026-11-20' },
        });
        await waitFor(() =>
            expect(recordBriefDecision).toHaveBeenCalledWith(
                TODAY,
                expect.objectContaining({
                    kind: 'move',
                    decision: 'accepted',
                    proposal: expect.objectContaining({ to: '2026-11-20' }),
                })
            )
        );
    });

    it('folds what is settled and hides replies when there are none', async () => {
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            brief: { ...BRIEF, replies: [] },
        });
        renderPage();
        await screen.findByText('À anticiper');
        expect(
            screen.queryByText('Réponses attendues')
        ).not.toBeInTheDocument();
    });

    it('states an overload as tasks against free time, in hours', async () => {
        const day = BRIEF.timeline[0];
        (fetchDailyBrief as jest.Mock).mockResolvedValue({
            ...RESPONSE,
            brief: {
                ...BRIEF,
                timeline: [
                    {
                        ...day,
                        load: {
                            ...day.load,
                            planned_minutes: 615,
                            task_minutes: 555,
                            capacity_minutes: 90,
                        },
                    },
                ],
            },
        });
        renderPage();
        expect(
            await screen.findByText(
                'Surcharge : 9 h 15 de tâches pour 1 h 30 de libre'
            )
        ).toBeInTheDocument();
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

    it('records the feedback on the whole screen', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Pas utile' })
        );
        await waitFor(() =>
            expect(recordBriefDecision).toHaveBeenCalledWith(
                TODAY,
                expect.objectContaining({
                    kind: 'feedback',
                    proposal: { card_type: 'brief', vote: 'noise' },
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

describe('BriefPage evening review', () => {
    const MORNING_VERDICT = 'Ce soir, une seule chose compte.';
    const TOMORROW = '2026-11-05';

    const renderAt = async (
        now: Date,
        settings = SETTINGS,
        evening = EVENING_RESPONSE
    ) => {
        jest.useFakeTimers({ now });
        (fetchDailyBrief as jest.Mock).mockResolvedValue(RESPONSE);
        (fetchBriefSettings as jest.Mock).mockResolvedValue(settings);
        (fetchDailyEvening as jest.Mock).mockResolvedValue(evening);
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TOMORROW,
            plan: {
                uid: 'p',
                date: TOMORROW,
                started_at: null,
                items: [{ task_uid: 'other' }],
            },
        });
        (carryOverTasks as jest.Mock).mockResolvedValue({});
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({});
        (updateTask as jest.Mock).mockResolvedValue({});
        (decideTask as jest.Mock).mockResolvedValue({});
        (toggleTaskCompletion as jest.Mock).mockResolvedValue({
            ...TASKS.t1,
            status: 'done',
            completed_at: '2026-11-04T10:00:00Z',
        });
        renderPage();
    };

    const rowOf = async (name: string) =>
        (await screen.findByText(name)).closest(
            '[data-testid="brief-task-row"]'
        ) as HTMLElement;

    const openActions = (row: HTMLElement) =>
        fireEvent.click(within(row).getByRole('button', { name: /^Actions/ }));

    const undoOf = (): (() => Promise<void>) => {
        const calls = (showUndoToast as jest.Mock).mock.calls;
        return calls[calls.length - 1][1];
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows the evening review by default after the switch time', async () => {
        await renderAt(AT_SWITCH);

        expect(
            await screen.findByText(EVENING.verdict.text)
        ).toBeInTheDocument();
        expect(screen.queryByText(MORNING_VERDICT)).not.toBeInTheDocument();
        expect(sectionNames()).toEqual([
            'Ce soir',
            'Fait aujourd’hui',
            'Glisse',
            'Demain',
        ]);
        expect(
            screen.getByRole('button', { name: 'Voir le résumé du matin' })
        ).toBeInTheDocument();
    });

    it('switches to the morning brief and back from the quiet links', async () => {
        await renderAt(AT_SWITCH);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Voir le résumé du matin',
            })
        );

        expect(await screen.findByText(MORNING_VERDICT)).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Voir le bilan du soir' })
        );
        expect(
            await screen.findByText(EVENING.verdict.text)
        ).toBeInTheDocument();
    });

    it('keeps the morning brief before the switch time', async () => {
        await renderAt(BEFORE_SWITCH);

        expect(await screen.findByText(MORNING_VERDICT)).toBeInTheDocument();
        expect(fetchDailyEvening).not.toHaveBeenCalled();
    });

    it('keeps the morning brief all day when the evening review is disabled', async () => {
        await renderAt(AT_SWITCH, {
            ...SETTINGS,
            evening: { enabled: false, switchTime: '18:00' },
        });

        expect(await screen.findByText(MORNING_VERDICT)).toBeInTheDocument();
        expect(fetchDailyEvening).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Voir le bilan du soir' })
        ).not.toBeInTheDocument();
    });

    it('ticks a task row at once through the task service', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Envoyer la déclaration');
        const check = within(row).getByRole('checkbox');
        expect(check).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(check);

        await waitFor(() =>
            expect(toggleTaskCompletion).toHaveBeenCalledWith('t1')
        );
        await waitFor(() =>
            expect(within(row).getByRole('checkbox')).toHaveAttribute(
                'aria-checked',
                'true'
            )
        );
        expect(showUndoToast).toHaveBeenCalled();
    });

    it('moves a slipped task to tomorrow and undo takes it off again', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        (fetchDailyPlan as jest.Mock)
            .mockResolvedValueOnce({
                date: TOMORROW,
                plan: {
                    uid: 'p',
                    date: TOMORROW,
                    started_at: null,
                    items: [{ task_uid: 'other' }],
                },
            })
            .mockResolvedValueOnce({
                date: TOMORROW,
                plan: {
                    uid: 'p',
                    date: TOMORROW,
                    started_at: null,
                    items: [{ task_uid: 'other' }, { task_uid: 't2' }],
                },
            });

        openActions(row);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }));

        await waitFor(() =>
            expect(carryOverTasks).toHaveBeenCalledWith(TOMORROW, ['t2'])
        );
        expect(within(row).getByText('Demain')).toBeInTheDocument();
        expect(showUndoToast).toHaveBeenCalledWith(
            '« Trier les photos » reportée à demain',
            expect.any(Function)
        );

        await act(async () => {
            await undoOf()();
        });

        expect(saveDailyPlanItems).toHaveBeenCalledWith(TOMORROW, [
            { task_uid: 'other' },
        ]);
        expect(within(row).queryByText('Demain')).not.toBeInTheDocument();
    });

    it('does not add a task that tomorrow already holds, and offers no undo', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        (fetchDailyPlan as jest.Mock).mockResolvedValueOnce({
            date: TOMORROW,
            plan: {
                uid: 'p',
                date: TOMORROW,
                started_at: null,
                items: [{ task_uid: 't2' }],
            },
        });

        openActions(row);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }));

        await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
        expect(carryOverTasks).not.toHaveBeenCalled();
        expect(showUndoToast).not.toHaveBeenCalled();
    });

    it('offers no single-date choice for a recurring task', async () => {
        const recurring = {
            ...EVENING_RESPONSE,
            tasks: {
                ...EVENING_RESPONSE.tasks,
                t2: { ...EVENING_RESPONSE.tasks.t2, recurring: true },
            },
        };
        await renderAt(AT_SWITCH, SETTINGS, recurring);
        openActions(await rowOf('Trier les photos'));

        expect(
            screen.queryByRole('menuitem', { name: 'Choisir une date' })
        ).toBeNull();
        expect(screen.getByRole('menuitem', { name: 'Demain' })).toBeTruthy();
    });

    it('sets a new due date from the picker and undo restores the old one', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        openActions(row);
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Choisir une date' })
        );
        fireEvent.change(within(row).getByLabelText('Échéance'), {
            target: { value: '2026-11-06' },
        });

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t2', {
                due_date: '2026-11-06',
            })
        );
        expect(
            await within(row).findByText(/^Échéance : /)
        ).toBeInTheDocument();
        expect(
            within(row).queryByLabelText('Échéance')
        ).not.toBeInTheDocument();

        await act(async () => {
            await undoOf()();
        });

        expect(updateTask).toHaveBeenLastCalledWith('t2', { due_date: TODAY });
        await waitFor(() =>
            expect(
                within(row).queryByText(/^Échéance : /)
            ).not.toBeInTheDocument()
        );
    });

    it('parks a task for later and undo takes the later tag off', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        openActions(row);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Plus tard' }));

        await waitFor(() =>
            expect(decideTask).toHaveBeenCalledWith('t2', { later: true })
        );
        expect(await within(row).findByText('Plus tard')).toBeInTheDocument();

        await act(async () => {
            await undoOf()();
        });

        expect(decideTask).toHaveBeenLastCalledWith('t2', { later: false });
        expect(within(row).queryByText('Plus tard')).not.toBeInTheDocument();
    });

    it('abandons a task at once, struck, and undo restores its status', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        openActions(row);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Abandonner' }));

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('t2', { status: 5 })
        );
        expect(await within(row).findByText('Abandonnée')).toBeInTheDocument();
        expect(within(row).getByText('Trier les photos')).toHaveClass(
            'line-through'
        );
        expect(showUndoToast).toHaveBeenCalledWith(
            expect.stringContaining('Trier les photos'),
            expect.any(Function)
        );

        await act(async () => {
            await undoOf()();
        });

        expect(updateTask).toHaveBeenLastCalledWith('t2', {
            status: 'not_started',
        });
        expect(within(row).queryByText('Abandonnée')).not.toBeInTheDocument();
        expect(within(row).getByText('Trier les photos')).not.toHaveClass(
            'line-through'
        );
    });

    it('keeps the task and says so when a service call fails', async () => {
        await renderAt(AT_SWITCH);
        const row = await rowOf('Trier les photos');
        (decideTask as jest.Mock).mockRejectedValueOnce(new Error('down'));
        openActions(row);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Plus tard' }));

        await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
        expect(within(row).queryByText('Plus tard')).not.toBeInTheDocument();
        expect(showUndoToast).not.toHaveBeenCalled();
    });
});
