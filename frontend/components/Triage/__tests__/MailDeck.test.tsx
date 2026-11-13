import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MailDeck from '../MailDeck';
import {
    decideMail,
    MailPayload,
    TriageItem,
} from '../../../utils/triageService';
import { usePluginMenuStore } from '../../../store/pluginMenuStore';

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

jest.mock('../../../utils/triageService', () => ({
    decideMail: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

const decide = decideMail as jest.Mock;

const card = (uid: string, fields: Partial<MailPayload> = {}): TriageItem =>
    ({
        key: `mail:${uid}`,
        type: 'mail',
        source: 'mail',
        task_uid: null,
        action: 'decide_mail',
        reason: 'x',
        details: [],
        question: null,
        payload: {
            mail_uid: uid,
            account: 'perso',
            from_name: 'Alice',
            from_address: 'alice@example.com',
            subject: `Objet ${uid}`,
            received_at: '2026-11-10T09:00:00Z',
            summary: `Résumé ${uid}`,
            suggestion: { kind: 'task', task_name: `Tâche ${uid}` },
            draft_excerpt: null,
            gmail_url: `https://mail.google.com/mail/u/0/#inbox/${uid}`,
            ...fields,
        },
    }) as unknown as TriageItem;

const renderDeck = (items: TriageItem[], onClose = jest.fn()) => {
    render(
        <MemoryRouter>
            <MailDeck
                items={items}
                archiveAvailable={false}
                onClose={onClose}
            />
        </MemoryRouter>
    );
    return onClose;
};

const press = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
    act(() => {
        fireEvent.keyDown(window, { key, ...extra });
    });

beforeEach(() => {
    decide.mockClear();
    window.open = jest.fn();
    usePluginMenuStore.setState({ items: [], actions: [], loaded: true });
});

describe('MailDeck', () => {
    it('shows one mail at a time with the advice as the main button', () => {
        renderDeck([card('a'), card('b')]);
        expect(screen.getByText('Objet a')).toBeInTheDocument();
        expect(screen.queryByText('Objet b')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Créer la tâche : Tâche a' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Ouvrir le mail' })
        ).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#inbox/a');
    });

    it('moves to the next card after a decision, sent once the next one is made', async () => {
        renderDeck([card('a'), card('b'), card('c')]);
        fireEvent.click(
            screen.getByRole('button', { name: 'Créer la tâche : Tâche a' })
        );
        await screen.findByText('Objet b');
        expect(decide).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await screen.findByText('Objet c');
        expect(decide).toHaveBeenCalledWith(
            'a',
            'task',
            { name: 'Tâche a' },
            false
        );
    });

    it('takes the last decision back with « Annuler »', async () => {
        renderDeck([card('a'), card('b')]);
        fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
        await screen.findByText('Objet b');
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(await screen.findByText('Objet a')).toBeInTheDocument();
        expect(decide).not.toHaveBeenCalled();
    });

    it('answers the keyboard: Enter, arrows, Ctrl+Z and Escape', async () => {
        const onClose = renderDeck([card('a'), card('b'), card('c')]);
        press('ArrowDown');
        await screen.findByText('Objet b');
        press('ArrowLeft');
        await screen.findByText('Objet c');
        press('z', { ctrlKey: true });
        await screen.findByText('Objet b');
        press('Enter');
        await screen.findByText('Objet c');
        press('Escape');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        // Closing sends the decision still held.
        expect(decide).toHaveBeenCalledWith(
            'b',
            'task',
            { name: 'Tâche b' },
            false
        );
    });

    it('opens Gmail for a reply advice', async () => {
        renderDeck([card('a', { suggestion: { kind: 'reply' } }), card('b')]);
        fireEvent.click(
            screen.getByRole('button', { name: 'Répondre dans Gmail' })
        );
        expect(window.open).toHaveBeenCalledWith(
            'https://mail.google.com/mail/u/0/#inbox/a',
            '_blank',
            'noopener,noreferrer'
        );
        await screen.findByText('Objet b');
    });

    it('asks the agent for the appointment the mail sets', async () => {
        renderDeck([
            card('a', {
                suggestion: {
                    kind: 'event',
                    event: {
                        title: 'Visite',
                        start: '2026-11-20',
                        end: null,
                        all_day: true,
                    },
                },
            }),
        ]);
        const main = screen.getByRole('button', {
            name: /^Ajouter à l’agenda/,
        });
        fireEvent.click(main);
        await screen.findByText('Tout est trié');
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await waitFor(() =>
            expect(decide).toHaveBeenCalledWith('a', 'event', {}, false)
        );
    });

    it('ends on « Tout est trié »', async () => {
        renderDeck([card('a')]);
        fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
        expect(await screen.findByText('Tout est trié')).toBeInTheDocument();
    });

    it('offers « Discuter » only with the Hermes plugin', () => {
        renderDeck([card('a')]);
        expect(
            screen.queryByRole('link', { name: 'Discuter' })
        ).not.toBeInTheDocument();
    });

    it('opens the agents chat on this mail', () => {
        usePluginMenuStore.setState({
            items: [
                {
                    id: 'hermes',
                    label: 'Agents',
                    path: '/plugins/hermes',
                    file: 'ui/index.html',
                },
            ],
        });
        renderDeck([card('a')]);
        expect(screen.getByRole('link', { name: 'Discuter' })).toHaveAttribute(
            'href',
            '/plugins/hermes?view=chat&mail=a'
        );
    });
});
