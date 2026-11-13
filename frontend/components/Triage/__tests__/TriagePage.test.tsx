import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TriagePage from '../TriagePage';
import {
    answerQuestion,
    applyTriage,
    fetchTriageQueue,
    keepTask,
    decideMail,
} from '../../../utils/triageService';

jest.mock('../../../utils/triageService', () => ({
    answerQuestion: jest.fn(),
    fetchTriageQueue: jest.fn(),
    keepTask: jest.fn(),
    applyTriage: jest.fn(),
    decideMail: jest.fn(),
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

const QUEUE = {
    count: 2,
    items: [
        {
            key: 'duplicate:a:b',
            type: 'duplicate',
            source: 'rules',
            task_uid: 'a',
            action: 'cancel',
            payload: null,
            reason: 'Une autre tâche ouverte porte le même nom.',
            details: ['Celle-ci : projet Maison'],
            question: null,
        },
        {
            key: 'deadline:b',
            type: 'deadline_in_note',
            source: 'rules',
            task_uid: 'b',
            action: 'set_due',
            payload: { due_date: '2026-11-12' },
            reason: 'La note cite le 12 novembre.',
            details: [],
            question: null,
        },
    ],
    tasks: {
        a: {
            uid: 'a',
            name: 'Payer',
            note: null,
            due_date: null,
            project_name: 'Maison',
            tags: [],
            recurring: false,
        },
        b: {
            uid: 'b',
            name: 'Dossier',
            note: null,
            due_date: null,
            project_name: null,
            tags: [],
            recurring: true,
        },
    },
};

const renderPage = (path = '/triage') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <TriagePage />
        </MemoryRouter>
    );

describe('TriagePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchTriageQueue as jest.Mock).mockResolvedValue(QUEUE);
        (applyTriage as jest.Mock).mockResolvedValue(undefined);
        (keepTask as jest.Mock).mockResolvedValue(undefined);
    });

    it('answers a calendar question with its target', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            count: 1,
            items: [
                {
                    key: 'conflict:e1:e2',
                    type: 'conflict',
                    source: 'rules',
                    task_uid: null,
                    action: 'question',
                    payload: null,
                    reason: '« Réunion » et « Point » se chevauchent.',
                    details: [],
                    question: {
                        key: 'q-1',
                        text: '« Réunion » doit-il être déplacé ?',
                        target: {
                            scope: 'event',
                            ref: 'event:f:e1:2026-11-12',
                        },
                    },
                },
            ],
            tasks: {},
        });
        (answerQuestion as jest.Mock).mockResolvedValue({});
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Non' }));
        await waitFor(() =>
            expect(answerQuestion).toHaveBeenCalledWith(
                { scope: 'event', ref: 'event:f:e1:2026-11-12' },
                'no'
            )
        );
    });

    it('shows one proposal with its reason and what tells tasks apart', async () => {
        renderPage();
        expect(await screen.findByText('Payer')).toBeInTheDocument();
        expect(
            screen.getByText('Celle-ci : projet Maison')
        ).toBeInTheDocument();
        expect(screen.queryByText('Dossier')).not.toBeInTheDocument();
    });

    it('validates the proposal, then shows the next one', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Annuler la tâche' })
        );
        await waitFor(() =>
            expect(applyTriage).toHaveBeenCalledWith('a', 'cancel', null)
        );
        expect(await screen.findByText('Dossier')).toBeInTheDocument();
    });

    it('corrects with a rename', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Corriger' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'Payer le loyer' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
        await waitFor(() =>
            expect(applyTriage).toHaveBeenCalledWith('a', 'rename', {
                name: 'Payer le loyer',
            })
        );
    });

    it('offers no conversion on a recurring task', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Passer' }));
        expect(await screen.findByText('Dossier')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
        expect(
            screen.queryByRole('button', { name: 'Convertir en note' })
        ).not.toBeInTheDocument();
    });

    it('keeps a task as it is', async () => {
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Garder telle quelle' })
        );
        await waitFor(() => expect(keepTask).toHaveBeenCalledWith('a'));
    });

    it('says when there is nothing to sort', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            items: [],
            tasks: {},
            count: 0,
        });
        renderPage();
        expect(await screen.findByTestId('triage-empty')).toBeInTheDocument();
    });

    const MAIL_QUEUE = {
        count: 1,
        tasks: {},
        mail_archive: false,
        items: [
            {
                key: 'mail:m1',
                type: 'mail',
                source: 'mail',
                task_uid: null,
                action: 'decide_mail',
                payload: {
                    mail_uid: 'm1',
                    account: 'perso',
                    from_name: 'Alice',
                    from_address: 'alice@example.com',
                    subject: 'Devis cuisine',
                    received_at: '2026-11-10T09:00:00Z',
                    summary: 'Demande de valider le devis',
                    suggestion: null,
                    draft_excerpt: null,
                    gmail_url: 'https://mail.google.com/mail/u/0/#inbox/abc',
                },
                reason: 'Demande de valider le devis',
                details: [],
                question: null,
            },
        ],
    };

    it('decides a mail card and moves on', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(MAIL_QUEUE);
        (decideMail as jest.Mock).mockResolvedValue(undefined);
        renderPage();
        expect(
            await screen.findByText('Demande de valider le devis')
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Corriger' })
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await waitFor(() =>
            expect(decideMail).toHaveBeenCalledWith('m1', 'dismiss', {}, false)
        );
        expect(await screen.findByTestId('triage-empty')).toBeInTheDocument();
    });

    it('opens the mail deck, and reads the queue again once it is closed', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(MAIL_QUEUE);
        (decideMail as jest.Mock).mockResolvedValue({});
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Trier mes mails (1)' })
        );
        expect(screen.getByTestId('mail-deck')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await screen.findByText('Tout est trié');
        (fetchTriageQueue as jest.Mock).mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await waitFor(() =>
            expect(decideMail).toHaveBeenCalledWith('m1', 'dismiss', {}, false)
        );
        await waitFor(() => expect(fetchTriageQueue).toHaveBeenCalled());
        expect(screen.queryByTestId('mail-deck')).not.toBeInTheDocument();
    });

    it('opens the mail deck at once from a « mails à trier » notification', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(MAIL_QUEUE);
        renderPage('/triage?deck=mail');
        expect(await screen.findByTestId('mail-deck')).toBeInTheDocument();
    });

    it('says so when the mail was not archived in Gmail', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            ...MAIL_QUEUE,
            mail_archive: true,
        });
        (decideMail as jest.Mock).mockResolvedValue({ archived: false });
        renderPage();
        fireEvent.click(await screen.findByLabelText('Archiver dans Gmail'));
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await waitFor(() =>
            expect(mockToasts.showErrorToast).toHaveBeenCalledWith(
                'Pas archivé dans Gmail'
            )
        );
    });

    it('drops a card already settled elsewhere, with a message of its own', async () => {
        (applyTriage as jest.Mock).mockRejectedValue(
            Object.assign(new Error('Conflict'), { status: 409 })
        );
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Annuler la tâche' })
        );
        expect(await screen.findByText('Dossier')).toBeInTheDocument();
        expect(mockToasts.showErrorToast).toHaveBeenCalledWith(
            'Déjà traité ailleurs.'
        );
    });

    it('waits before deleting, and can take the delete back', async () => {
        jest.useFakeTimers();
        (fetchTriageQueue as jest.Mock).mockResolvedValue({
            ...QUEUE,
            items: [{ ...QUEUE.items[0], action: 'delete' }],
        });
        renderPage();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Supprimer' })
        );
        expect(applyTriage).not.toHaveBeenCalled();
        expect(mockToasts.showUndoToast).toHaveBeenCalled();
        const undo = mockToasts.showUndoToast.mock.calls[0][1];
        undo();
        jest.advanceTimersByTime(6000);
        expect(applyTriage).not.toHaveBeenCalled();
        expect(await screen.findByText('Payer')).toBeInTheDocument();
        jest.useRealTimers();
    });
});
