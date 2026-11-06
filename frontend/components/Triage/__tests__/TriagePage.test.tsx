import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TriagePage from '../TriagePage';
import {
    applyTriage,
    fetchTriageQueue,
    keepTask,
} from '../../../utils/triageService';

jest.mock('../../../utils/triageService', () => ({
    fetchTriageQueue: jest.fn(),
    keepTask: jest.fn(),
    applyTriage: jest.fn(),
}));
jest.mock('../../../utils/dateUtils', () => ({
    getTodayDateString: () => '2026-11-06',
}));
jest.mock('../../../utils/dailyBriefService', () => ({
    answerBriefQuestion: jest.fn(),
}));
const mockToasts = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
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

describe('TriagePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchTriageQueue as jest.Mock).mockResolvedValue(QUEUE);
        (applyTriage as jest.Mock).mockResolvedValue(undefined);
        (keepTask as jest.Mock).mockResolvedValue(undefined);
    });

    it('shows one proposal with its reason and what tells tasks apart', async () => {
        render(<TriagePage />);
        expect(await screen.findByText('Payer')).toBeInTheDocument();
        expect(
            screen.getByText('Celle-ci : projet Maison')
        ).toBeInTheDocument();
        expect(screen.queryByText('Dossier')).not.toBeInTheDocument();
    });

    it('validates the proposal, then shows the next one', async () => {
        render(<TriagePage />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Annuler la tâche' })
        );
        await waitFor(() =>
            expect(applyTriage).toHaveBeenCalledWith('a', 'cancel', null)
        );
        expect(await screen.findByText('Dossier')).toBeInTheDocument();
    });

    it('corrects with a rename', async () => {
        render(<TriagePage />);
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
        render(<TriagePage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Passer' }));
        expect(await screen.findByText('Dossier')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
        expect(
            screen.queryByRole('button', { name: 'Convertir en note' })
        ).not.toBeInTheDocument();
    });

    it('keeps a task as it is', async () => {
        render(<TriagePage />);
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
        render(<TriagePage />);
        expect(await screen.findByTestId('triage-empty')).toBeInTheDocument();
    });
});
