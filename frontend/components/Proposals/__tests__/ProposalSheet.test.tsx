import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ProposalSheet from '../ProposalSheet';
import {
    Decision,
    decisionsToApply,
    groupByDecision,
    notesToSend,
    plannableDays,
} from '../weekDecisions';
import {
    applyProposal,
    dismissProposal,
    getProposal,
    replyProposal,
    sendProposal,
    ProposalDetail,
    WeekAnswer,
    WeekChange,
} from '../../../utils/proposalsService';

jest.mock('../../../utils/proposalsService', () => ({
    applyProposal: jest.fn(),
    dismissProposal: jest.fn(),
    getProposal: jest.fn(),
    replyProposal: jest.fn(),
    sendProposal: jest.fn(),
}));

const mockToasts = {
    showErrorToast: jest.fn(),
    showSuccessToast: jest.fn(),
    showUndoToast: jest.fn(),
};
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToasts,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const UID = 'prop-1';

const detail = (overrides: Partial<ProposalDetail> = {}): ProposalDetail => ({
    uid: UID,
    kind: 'week',
    status: 'ready',
    period_start: '2026-11-16',
    period_end: '2026-11-22',
    answer: {
        headline: 'Mardi est libre',
        subtitle: 'Un retard replacé, une vieille idée abandonnée.',
        questions: [
            {
                id: 'q1',
                text: 'Tu travailles mardi ?',
                choices: ['Oui', 'Non'],
            },
        ],
        changes: [
            {
                task_uid: 't1',
                op: 'plan_day',
                date: '2026-11-17',
                reason: 'Mardi est libre',
            },
            {
                task_uid: 't2',
                op: 'plan_day',
                date: '2026-11-17',
                reason: 'Court',
            },
            { task_uid: 't3', op: 'drop', reason: 'Plus d’actualité' },
        ],
    },
    error: null,
    reply_text: null,
    created_at: '2026-11-13T08:00:00Z',
    updated_at: '2026-11-13T08:00:00Z',
    facts: {
        period: { start: '2026-11-16', end: '2026-11-22' },
        today: '2026-11-16',
        days: [],
        tasks: [
            { uid: 't1', name: 'Valider le devis', goal: 'Cuisine finie' },
            {
                uid: 't2',
                name: 'Appeler le plombier',
                area: { name: 'Maison' },
            },
            { uid: 't3', name: 'Ancienne idée' },
        ],
    },
    ...overrides,
});

const renderSheet = (onClose = jest.fn()) => {
    render(<ProposalSheet uid={UID} onClose={onClose} />);
    return onClose;
};

const trigger = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`, ${name}$`) });

const pick = (name: string, option: string) => {
    fireEvent.click(trigger(name));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: option }));
};

const groupOf = (taskName: string) =>
    screen
        .getAllByRole('region')
        .find((region) => within(region).queryByText(taskName))
        ?.getAttribute('aria-label');

const appliedOutcome = {
    uid: UID,
    status: 'applied',
    results: [{ task_uid: 't1', state: 'applied' }],
};

describe('week decisions', () => {
    const changes: WeekChange[] = [
        { task_uid: 'a', op: 'drop', reason: '' },
        { task_uid: 'b', op: 'plan_day', date: '2026-11-18', reason: '' },
        { task_uid: 'c', op: 'due', date: '2026-11-17', reason: '' },
        { task_uid: 'd', op: 'this_week', reason: '' },
        { task_uid: 'e', op: 'later', reason: '' },
        { task_uid: 'f', op: 'plan_day', date: '2026-11-18', reason: '' },
    ];

    it('groups by the current decision: days, week, later, dropped, kept', () => {
        const none = new Map<string, Decision>();
        expect(groupByDecision(changes, none).map((g) => g.key.id)).toEqual([
            'day:2026-11-17',
            'day:2026-11-18',
            'this_week',
            'later',
            'drop',
        ]);
        const changed = new Map<string, Decision>([
            ['a', { op: 'plan_day', date: '2026-11-17' }],
            ['e', { op: 'keep' }],
        ]);
        const groups = groupByDecision(changes, changed);
        expect(groups.map((g) => g.key.id)).toEqual([
            'day:2026-11-17',
            'day:2026-11-18',
            'this_week',
            'keep',
        ]);
        expect(
            groupByDecision(changes, new Map([['d', { op: 'keep' }]])).map(
                (g) => g.key.id
            )
        ).toEqual([
            'day:2026-11-17',
            'day:2026-11-18',
            'later',
            'drop',
            'keep',
        ]);
        expect(groups[0].rows.map((row) => row.task_uid)).toEqual(['a', 'c']);
    });

    it('applies every decision but the kept ones, dates only when dated', () => {
        const changed = new Map<string, Decision>([
            ['a', { op: 'keep' }],
            ['d', { op: 'due', date: '2026-11-30' }],
        ]);
        expect(decisionsToApply(changes, changed)).toEqual([
            { task_uid: 'b', op: 'plan_day', date: '2026-11-18' },
            { task_uid: 'c', op: 'due', date: '2026-11-17' },
            { task_uid: 'd', op: 'due', date: '2026-11-30' },
            { task_uid: 'e', op: 'later' },
            { task_uid: 'f', op: 'plan_day', date: '2026-11-18' },
        ]);
    });

    it('takes the remarks that are not blank, in the agent order', () => {
        const notes = new Map([
            ['f', '  Pas ce jour  '],
            ['a', '   '],
            ['b', 'Plutôt le lundi'],
        ]);
        expect(notesToSend(changes, notes)).toEqual([
            { task_uid: 'b', text: 'Plutôt le lundi' },
            { task_uid: 'f', text: 'Pas ce jour' },
        ]);
    });

    it('offers the days of the period from today on', () => {
        expect(
            plannableDays(
                { start: '2026-11-14', end: '2026-11-18' },
                '2026-11-16'
            )
        ).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    });
});

describe('ProposalSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getProposal as jest.Mock).mockResolvedValue(detail());
    });

    it('shows the headline as the title and the subtitle under it', async () => {
        renderSheet();
        expect(
            await screen.findByRole('heading', { name: 'Mardi est libre' })
        ).toBeInTheDocument();
        expect(
            screen.getByText('Un retard replacé, une vieille idée abandonnée.')
        ).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
            'Un retard replacé, une vieille idée abandonnée.'
        );
        // The goal, else the area, tags the row.
        expect(screen.getByText('Cuisine finie')).toBeInTheDocument();
        expect(screen.getByText('Maison')).toBeInTheDocument();
    });

    it('puts a legacy summary under the generic title', async () => {
        const base = detail();
        const summary =
            'Mardi est libre, donc j’y ai mis le devis et le plombier ; l’ancienne idée ne sert plus, je propose de l’abandonner.';
        (getProposal as jest.Mock).mockResolvedValue(
            detail({
                answer: {
                    ...(base.answer as WeekAnswer),
                    headline: undefined,
                    subtitle: undefined,
                    summary,
                },
            })
        );
        renderSheet();
        expect(
            await screen.findByRole('heading', { name: 'Ta semaine' })
        ).toBeInTheDocument();
        expect(screen.getByText(summary)).toBeInTheDocument();
    });

    it('applies the changed decision of a row with the others', async () => {
        (applyProposal as jest.Mock).mockResolvedValue(appliedOutcome);
        renderSheet();
        await screen.findByText('Valider le devis');

        pick('Valider le devis', 'Plus tard');
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer (3)' }));

        await waitFor(() =>
            expect(applyProposal).toHaveBeenCalledWith(UID, {
                decisions: [
                    { task_uid: 't1', op: 'later' },
                    { task_uid: 't2', op: 'plan_day', date: '2026-11-17' },
                    { task_uid: 't3', op: 'drop' },
                ],
            })
        );
    });

    it('leaves a row kept as it is out of the apply', async () => {
        (applyProposal as jest.Mock).mockResolvedValue(appliedOutcome);
        renderSheet();
        await screen.findByText('Ancienne idée');

        pick('Ancienne idée', 'Garder tel quel');
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer (2)' }));

        await waitFor(() =>
            expect(applyProposal).toHaveBeenCalledWith(UID, {
                decisions: [
                    { task_uid: 't1', op: 'plan_day', date: '2026-11-17' },
                    { task_uid: 't2', op: 'plan_day', date: '2026-11-17' },
                ],
            })
        );
    });

    it('plans a row on another date from the menu', async () => {
        (applyProposal as jest.Mock).mockResolvedValue(appliedOutcome);
        renderSheet();
        await screen.findByText('Ancienne idée');

        fireEvent.click(trigger('Ancienne idée'));
        const menu = screen.getByRole('menu');
        fireEvent.click(
            within(menu).getByRole('menuitem', { name: 'Autre date…' })
        );
        fireEvent.change(within(menu).getByLabelText('Autre date…'), {
            target: { value: '2026-12-01' },
        });
        fireEvent.click(within(menu).getByRole('button', { name: 'OK' }));
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer (3)' }));

        await waitFor(() =>
            expect(applyProposal).toHaveBeenCalledWith(
                UID,
                expect.objectContaining({
                    decisions: expect.arrayContaining([
                        { task_uid: 't3', op: 'plan_day', date: '2026-12-01' },
                    ]),
                })
            )
        );
    });

    it('moves a changed row to its new group and back on undo', async () => {
        renderSheet();
        await screen.findByText('Valider le devis');
        const dropGroup = groupOf('Ancienne idée');
        const dayGroup = groupOf('Valider le devis');
        expect(dayGroup).not.toEqual(dropGroup);
        expect(screen.queryByText('Modifié')).not.toBeInTheDocument();

        pick('Valider le devis', 'Abandonner');

        expect(groupOf('Valider le devis')).toEqual(dropGroup);
        expect(screen.getByText('Modifié')).toBeInTheDocument();
        // The row keeps the focus after it moved.
        expect(trigger('Valider le devis')).toHaveFocus();

        fireEvent.click(
            screen.getByRole('button', { name: /Revenir à la suggestion/ })
        );
        expect(groupOf('Valider le devis')).toEqual(dayGroup);
        expect(screen.queryByText('Modifié')).not.toBeInTheDocument();
    });

    it('moves between rows with the arrows and plans one with a digit', async () => {
        (applyProposal as jest.Mock).mockResolvedValue(appliedOutcome);
        renderSheet();
        await screen.findByText('Ancienne idée');

        act(() => {
            fireEvent.keyDown(window, { key: 'ArrowDown' });
        });
        expect(trigger('Valider le devis')).toHaveFocus();
        act(() => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        });
        expect(trigger('Ancienne idée')).toHaveFocus();

        // Day 2 of the period from today (16) is the 17th.
        act(() => {
            fireEvent.keyDown(document.activeElement!, { key: '2' });
        });
        expect(groupOf('Ancienne idée')).toEqual(groupOf('Valider le devis'));
    });

    it('selects a question answer without sending anything', async () => {
        renderSheet();
        await screen.findByText('Tu travailles mardi ?');

        fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
        expect(screen.getByRole('button', { name: 'Oui' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(screen.getByText('1 réponse donnée')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Non' }));
        expect(screen.getByRole('button', { name: 'Oui' })).toHaveAttribute(
            'aria-pressed',
            'false'
        );
        expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );

        expect(replyProposal).not.toHaveBeenCalled();
        expect(sendProposal).not.toHaveBeenCalled();
        expect(applyProposal).not.toHaveBeenCalled();
    });

    it('sends the answers with Envoyer, together with the decisions', async () => {
        (sendProposal as jest.Mock).mockResolvedValue(appliedOutcome);
        renderSheet();
        await screen.findByText('Tu travailles mardi ?');

        fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

        await waitFor(() =>
            expect(sendProposal).toHaveBeenCalledWith(UID, {
                decisions: [
                    { task_uid: 't1', op: 'plan_day', date: '2026-11-17' },
                    { task_uid: 't2', op: 'plan_day', date: '2026-11-17' },
                    { task_uid: 't3', op: 'drop' },
                ],
                notes: [],
                answers: [{ question_id: 'q1', choice: 'Oui' }],
            })
        );
        expect(replyProposal).not.toHaveBeenCalled();
        expect(applyProposal).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: /Appliquer/ })
        ).not.toBeInTheDocument();
    });

    it('cannot apply when every row is kept', async () => {
        renderSheet();
        await screen.findByText('Valider le devis');
        pick('Valider le devis', 'Garder tel quel');
        pick('Appeler le plombier', 'Garder tel quel');
        pick('Ancienne idée', 'Garder tel quel');
        expect(
            screen.getByRole('button', { name: 'Appliquer (0)' })
        ).toBeDisabled();
        expect(applyProposal).not.toHaveBeenCalled();
    });

    it('dismisses only from the quiet link', async () => {
        (dismissProposal as jest.Mock).mockResolvedValue({
            uid: UID,
            status: 'dismissed',
        });
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');

        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await waitFor(() => expect(dismissProposal).toHaveBeenCalledWith(UID));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('shows the preparing state while the proposal is pending', async () => {
        (getProposal as jest.Mock).mockResolvedValue(
            detail({ status: 'pending', answer: null })
        );
        renderSheet();
        expect(
            await screen.findByText('Ta semaine se prépare…')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Appliquer/ })
        ).not.toBeInTheDocument();
    });

    it('closes an open menu with Escape before the sheet', async () => {
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');
        fireEvent.click(trigger('Valider le devis'));
        const menu = screen.getByRole('menu');
        act(() => {
            fireEvent.keyDown(within(menu).getAllByRole('menuitemradio')[0], {
                key: 'Escape',
            });
        });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        act(() => {
            fireEvent.keyDown(window, { key: 'Escape' });
        });
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    const rowOf = (taskName: string) =>
        screen.getByText(taskName).closest('li') as HTMLElement;

    it('keeps a noted row out of the decisions and sends its remark', async () => {
        (sendProposal as jest.Mock).mockResolvedValue(undefined);
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');

        fireEvent.click(
            within(rowOf('Valider le devis')).getByRole('button', {
                name: 'Remarque',
            })
        );
        fireEvent.change(
            screen.getByRole('textbox', {
                name: 'Remarque pour Valider le devis',
            }),
            { target: { value: 'Le devis est faux' } }
        );

        expect(
            screen.getByText('À revoir avec ta remarque')
        ).toBeInTheDocument();
        expect(screen.getByText('À revoir')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /, Valider le devis$/ })
        ).not.toBeInTheDocument();
        // Two decisions left to apply; one remark to send.
        expect(
            screen.getByText('2 appliquées · 1 renvoyées')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Appliquer/ })
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

        await waitFor(() =>
            expect(sendProposal).toHaveBeenCalledWith(UID, {
                decisions: [
                    { task_uid: 't2', op: 'plan_day', date: '2026-11-17' },
                    { task_uid: 't3', op: 'drop' },
                ],
                notes: [{ task_uid: 't1', text: 'Le devis est faux' }],
                answers: [],
            })
        );
        expect(applyProposal).not.toHaveBeenCalled();
        expect(mockToasts.showSuccessToast).toHaveBeenCalledWith(
            expect.stringContaining('je te préviens')
        );
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('collapses the remark with Escape and keeps it', async () => {
        const onClose = renderSheet();
        await screen.findByText('Valider le devis');
        fireEvent.click(
            within(rowOf('Valider le devis')).getByRole('button', {
                name: 'Remarque',
            })
        );
        const field = screen.getByRole('textbox', {
            name: 'Remarque pour Valider le devis',
        });
        expect(field).toHaveFocus();
        expect(field).toHaveAttribute('maxLength', '500');
        fireEvent.change(field, { target: { value: 'Trop tôt' } });

        fireEvent.keyDown(field, { key: 'Escape' });

        expect(
            screen.queryByRole('textbox', {
                name: 'Remarque pour Valider le devis',
            })
        ).not.toBeInTheDocument();
        expect(
            within(rowOf('Valider le devis')).getByRole('button', {
                name: 'Remarque',
            })
        ).toHaveFocus();
        expect(
            screen.getByText('À revoir avec ta remarque')
        ).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('drops an emptied remark: the row is decided again', async () => {
        renderSheet();
        await screen.findByText('Valider le devis');
        fireEvent.click(
            within(rowOf('Valider le devis')).getByRole('button', {
                name: 'Remarque',
            })
        );
        const field = screen.getByRole('textbox', {
            name: 'Remarque pour Valider le devis',
        });
        fireEvent.change(field, { target: { value: 'Une idée' } });
        fireEvent.change(field, { target: { value: '' } });
        fireEvent.keyDown(field, { key: 'Escape' });

        expect(
            screen.queryByRole('button', { name: 'Envoyer' })
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Appliquer (3)' })
        ).toBeInTheDocument();
    });
});
