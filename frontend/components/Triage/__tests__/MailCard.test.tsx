import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MailCard from '../MailCard';
import { MailPayload } from '../../../utils/triageService';

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

const PAYLOAD: MailPayload = {
    mail_uid: 'm1',
    account: 'perso',
    from_name: 'Alice Martin',
    from_address: 'alice@example.com',
    subject: 'Devis cuisine',
    received_at: '2026-11-10T09:00:00Z',
    summary: 'Demande de valider le devis avant vendredi',
    suggestion: {
        kind: 'task',
        task_name: 'Valider le devis',
        due_date: '2026-11-14',
    },
    draft_excerpt: 'Bonjour Alice, **merci** [ici](https://x.example)',
    gmail_url: 'https://mail.google.com/mail/u/0/#inbox/abc',
};

const renderCard = (
    payload: Partial<MailPayload> = {},
    archiveAvailable = false
) => {
    const onDecide = jest.fn();
    render(
        <MailCard
            payload={{ ...PAYLOAD, ...payload }}
            archiveAvailable={archiveAvailable}
            onDecide={onDecide}
        />
    );
    return onDecide;
};

describe('MailCard', () => {
    it('shows the subject, the sender and the draft as plain text', () => {
        renderCard();
        expect(
            screen.getByRole('heading', { name: 'Devis cuisine' })
        ).toBeInTheDocument();
        expect(screen.getByText(/Alice Martin/)).toBeInTheDocument();
        expect(
            screen.getByText(
                'Bonjour Alice, **merci** [ici](https://x.example)',
                { exact: false }
            )
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'ici' })
        ).not.toBeInTheDocument();
    });

    it('creates the suggested task in two taps, and lets the name change', () => {
        const onDecide = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        const name = screen.getByLabelText('Nom de la tâche');
        expect(name).toHaveValue('Valider le devis');
        expect(screen.getByLabelText('Échéance')).toHaveValue('2026-11-14');
        fireEvent.change(name, {
            target: { value: 'Valider le devis cuisine' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Créer la tâche' }));
        expect(onDecide).toHaveBeenCalledWith(
            'task',
            { name: 'Valider le devis cuisine', due_date: '2026-11-14' },
            false
        );
    });

    it('falls back to the subject when nothing is suggested', () => {
        renderCard({ suggestion: null });
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        expect(screen.getByLabelText('Nom de la tâche')).toHaveValue(
            'Devis cuisine'
        );
    });

    it('opens the thread in Gmail to reply, and settles the card', () => {
        const onDecide = renderCard();
        const reply = screen.getByRole('link', { name: 'Répondre' });
        expect(reply).toHaveAttribute(
            'href',
            'https://mail.google.com/mail/u/0/#inbox/abc'
        );
        expect(reply).toHaveAttribute('target', '_blank');
        expect(reply).toHaveAttribute('rel', 'noopener noreferrer');
        fireEvent.click(reply);
        expect(onDecide).toHaveBeenCalledWith('reply', {}, false);
    });

    it('never links to an address outside Gmail', () => {
        renderCard({ gmail_url: 'javascript:alert(1)' });
        expect(
            screen.queryByRole('link', { name: 'Répondre' })
        ).not.toBeInTheDocument();
    });

    it('puts off and dismisses', () => {
        const onDecide = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        expect(onDecide).toHaveBeenNthCalledWith(1, 'later', {}, false);
        expect(onDecide).toHaveBeenNthCalledWith(2, 'dismiss', {}, false);
    });

    it('offers to archive in Gmail only when it is set up', () => {
        renderCard();
        expect(
            screen.queryByLabelText('Archiver dans Gmail')
        ).not.toBeInTheDocument();
    });

    it('archives with the decision when asked', () => {
        const onDecide = renderCard({}, true);
        fireEvent.click(screen.getByLabelText('Archiver dans Gmail'));
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
        expect(onDecide).toHaveBeenNthCalledWith(1, 'dismiss', {}, true);
        expect(onDecide).toHaveBeenNthCalledWith(2, 'later', {}, false);
    });
});
