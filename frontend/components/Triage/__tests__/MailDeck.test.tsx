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

// A button of the choice row, found by what it decides.
const choice = (name: string) => {
    const found = screen
        .getAllByRole('button')
        .find((element) => element.dataset.choice === name);
    if (!found) throw new Error(`No ${name} button`);
    return found;
};

const choices = () =>
    screen
        .getAllByRole('button')
        .filter((element) => element.dataset.choice)
        .map((element) => element.dataset.choice);

const v2 = (uid: string, fields: Partial<MailPayload> = {}) =>
    card(uid, {
        options: ['draft', 'task', 'later', 'archive', 'dismiss'],
        recommended: 'draft',
        draft: { body: 'Bonjour, merci pour le devis.' },
        excerpt: 'Bonjour, voici le devis de la cuisine.',
        ...fields,
    });

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
    it('shows one mail at a time with its choices, the advice highlighted', () => {
        renderDeck([card('a'), card('b')]);
        expect(screen.getByText('Objet a')).toBeInTheDocument();
        expect(screen.queryByText('Objet b')).not.toBeInTheDocument();
        expect(screen.getByTestId('mail-deck-progress')).toHaveTextContent(
            '1 / 2'
        );
        expect(choice('task')).toHaveAttribute('data-recommended', 'true');
        expect(choice('task')).toHaveTextContent('Tâche a');
        expect(
            screen.getByRole('link', { name: 'Ouvrir dans Gmail' })
        ).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#inbox/a');
    });

    it('moves to the next card after a decision, sent once the next one is made', async () => {
        renderDeck([card('a'), card('b'), card('c')]);
        fireEvent.click(choice('task'));
        await screen.findByText('Objet b');
        expect(screen.getByTestId('mail-deck-progress')).toHaveTextContent(
            '2 / 3'
        );
        expect(decide).not.toHaveBeenCalled();
        fireEvent.click(choice('dismiss'));
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
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
        fireEvent.click(choice('dismiss'));
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
        expect(choice('reply')).toHaveAttribute('data-recommended', 'true');
        fireEvent.click(choice('reply'));
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
        expect(choice('event')).toHaveAttribute('data-recommended', 'true');
        fireEvent.click(choice('event'));
        await screen.findByText('Tout est trié');
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await waitFor(() =>
            expect(decide).toHaveBeenCalledWith('a', 'event', {}, false)
        );
    });

    it('ends on « Tout est trié »', async () => {
        renderDeck([card('a')]);
        fireEvent.click(choice('later'));
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

    it('shows the options of a v2 card in their order, the advised one highlighted', () => {
        renderDeck([
            v2('a', {
                options: ['task', 'draft', 'archive'],
                recommended: 'draft',
            }),
        ]);
        expect(choices()).toEqual(['task', 'draft', 'archive']);
        expect(choice('draft')).toHaveAttribute('data-recommended', 'true');
        expect(choice('task')).not.toHaveAttribute('data-recommended');
        expect(screen.getByTestId('mail-deck-excerpt')).toHaveTextContent(
            'voici le devis'
        );
        expect(screen.getByTestId('mail-deck-draft')).toHaveTextContent(
            'merci pour le devis'
        );
        // No advice sentence: the highlight says it.
        expect(screen.queryByText(/Conseil :/)).not.toBeInTheDocument();
    });

    it('sends the advised option with Enter, and a numbered one with its key', async () => {
        renderDeck([v2('a'), v2('b'), v2('c')]);
        press('Enter');
        await screen.findByText('Objet b');
        expect(
            await screen.findByText('Brouillon en préparation dans Gmail')
        ).toBeInTheDocument();
        press('4');
        await screen.findByText('Objet c');
        expect(screen.getByText('Archivage demandé')).toBeInTheDocument();
        expect(decide).toHaveBeenCalledWith('a', 'draft', {}, false);
        press('Escape');
        await waitFor(() =>
            expect(decide).toHaveBeenCalledWith('b', 'archive', {}, false)
        );
    });

    it('does nothing on Enter when the agent advised nothing', async () => {
        renderDeck([v2('a', { recommended: null }), v2('b')]);
        expect(
            screen
                .getAllByRole('button')
                .some((element) => element.dataset.recommended)
        ).toBe(false);
        press('Enter');
        press('ArrowRight');
        // Longer than a card takes to leave.
        await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
        expect(screen.getByText('Objet a')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('sends a word back to the agent and takes the card away', async () => {
        const onClose = renderDeck([v2('a'), v2('b')]);
        fireEvent.click(
            screen.getByRole('button', { name: 'Répondre par un mot' })
        );
        const field = screen.getByRole('textbox', {
            name: 'Répondre par un mot',
        });
        // Keys typed in the note never drive the deck.
        fireEvent.keyDown(field, { key: 'ArrowLeft' });
        expect(screen.getByText('Objet a')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
        fireEvent.change(field, { target: { value: '  déjà réglé  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
        await screen.findByText('Objet b');
        expect(screen.getByText('Renvoyé au Trieur')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(decide).toHaveBeenCalledWith(
            'a',
            'note',
            { text: 'déjà réglé' },
            false
        );
    });

    it('folds a long mail under « Lire le mail »', () => {
        renderDeck([v2('a', { excerpt: 'Une ligne.\n'.repeat(12) })]);
        const toggle = screen.getByRole('button', { name: 'Lire le mail' });
        expect(screen.getByTestId('mail-deck-excerpt')).toHaveClass(
            'line-clamp-5'
        );
        fireEvent.click(toggle);
        expect(screen.getByTestId('mail-deck-excerpt')).not.toHaveClass(
            'line-clamp-5'
        );
        expect(screen.getByRole('button', { name: 'Réduire' })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });

    it('shows why the last action failed at the top of the card', () => {
        renderDeck([
            v2('a', {
                action: { type: 'draft', state: 'failed' },
                action_error: 'gmail_unreachable',
            }),
        ]);
        expect(screen.getByTestId('mail-deck-error')).toHaveTextContent(
            'Le brouillon n’a pas pu être préparé (gmail_unreachable)'
        );
    });

    it('keeps the old buttons on a card proposed before the options', () => {
        renderDeck([card('a', { suggestion: { kind: 'reply' } })]);
        expect(choices()).toEqual(['reply', 'task', 'later', 'dismiss']);
        expect(screen.queryByTestId('mail-deck-excerpt')).toBeNull();
    });
});
