import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailDecision, MailPayload } from '../../utils/triageService';
import Button from '../Shared/ui/Button';
import MailTaskForm from './MailTaskForm';
import { DeckButton, deckButtons, DeckChoice, GMAIL } from './mailDeck';

const CHOICE_LABEL: Record<DeckChoice, [string, string]> = {
    draft: ['triage.deck.option.draft', 'Brouillon'],
    reply: ['triage.mail.reply', 'Répondre'],
    read: ['triage.deck.option.read', 'Lire'],
    task: ['triage.mail.task', 'Tâche'],
    event: ['triage.deck.option.event', 'Agenda'],
    later: ['triage.mail.later', 'Plus tard'],
    archive: ['triage.deck.option.archive', 'Archiver'],
    trash: ['triage.deck.option.trash', 'Supprimer'],
    dismiss: ['triage.mail.dismiss', 'Ignorer'],
};

// The reply link is an anchor, which Button cannot render: it keeps Button's look.
const linkBase =
    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-body-m font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]';
const linkPrimary = `${linkBase} bg-primary text-primary-on hover:bg-primary/90`;
const linkSecondary = `${linkBase} text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high`;

interface MailCardProps {
    payload: MailPayload;
    archiveAvailable: boolean;
    onDecide: (
        decision: MailDecision,
        payload: Record<string, unknown>,
        archive: boolean,
        options?: { always_archive?: boolean }
    ) => void;
}

const receivedOn = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? null
        : date.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
          });
};

// A mail that asks something of the user (docs/43-mail-triage.md). Every text
// comes from the mail: rendered as plain text, never as Markdown or links.
const MailCard: React.FC<MailCardProps> = ({
    payload,
    archiveAvailable,
    onDecide,
}) => {
    const { t } = useTranslation();
    const [archive, setArchive] = useState(false);
    const [taskForm, setTaskForm] = useState(false);

    const suggested = payload.suggestion;
    const replyUrl = payload.gmail_url.startsWith(GMAIL)
        ? payload.gmail_url
        : null;
    const sender = payload.from_name || payload.from_address;
    const meta = [sender, receivedOn(payload.received_at)]
        .filter(Boolean)
        .join(' · ');
    // Putting a mail off keeps it in the inbox; a deleted one needs no archive.
    const decide = (decision: MailDecision, extra = {}) =>
        onDecide(
            decision,
            extra,
            archive && decision !== 'later' && decision !== 'trash'
        );

    const hasOptions = (payload.options ?? []).length > 0;
    const buttons = hasOptions ? deckButtons(payload) : [];
    const showArchiveBox =
        archiveAvailable &&
        (!hasOptions || !buttons.some((button) => button.choice === 'archive'));
    const taskFirst = suggested?.kind !== 'reply';

    const chooseDeckButton = (button: DeckButton) => {
        if (button.opensMail && replyUrl) {
            window.open(replyUrl, '_blank', 'noopener,noreferrer');
        }
        decide(button.decision, button.payload);
    };

    return (
        <div data-testid="mail-card">
            <h2 className="text-body font-semibold text-gray-900 dark:text-gray-50">
                {payload.subject || t('triage.mail.noSubject', '(sans objet)')}
            </h2>
            {meta && (
                <p className="mt-0.5 text-body-m text-gray-600 dark:text-gray-300">
                    {meta}
                </p>
            )}
            <p className="mt-2 text-body-m text-gray-900 dark:text-gray-100">
                {payload.summary}
            </p>
            {payload.draft_excerpt && (
                <p className="mt-2 whitespace-pre-line border-l-2 border-gray-200 pl-3 text-body-m text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    <span className="font-semibold">
                        {t('triage.mail.draft', 'Brouillon prêt :')}
                    </span>{' '}
                    {payload.draft_excerpt}
                </p>
            )}

            {hasOptions ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {buttons.map((button) => {
                        const [key, fallback] = CHOICE_LABEL[button.choice];
                        return (
                            <Button
                                key={button.choice}
                                variant="secondary"
                                size="md"
                                data-choice={button.choice}
                                data-recommended={
                                    button.recommended || undefined
                                }
                                className={
                                    button.recommended
                                        ? 'bg-primary/10 text-surface-on ring-2 ring-inset ring-primary hover:bg-primary/15'
                                        : ''
                                }
                                onClick={() => chooseDeckButton(button)}
                            >
                                {t(key, fallback)}
                            </Button>
                        );
                    })}
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        variant={taskFirst ? 'primary' : 'secondary'}
                        size="md"
                        aria-expanded={taskForm}
                        onClick={() => setTaskForm((open) => !open)}
                    >
                        {t('triage.mail.task', 'Tâche')}
                    </Button>
                    {replyUrl && (
                        <a
                            href={replyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={taskFirst ? linkSecondary : linkPrimary}
                            onClick={() => decide('reply')}
                        >
                            {t('triage.mail.reply', 'Répondre')}
                        </a>
                    )}
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={() => decide('later')}
                    >
                        {t('triage.mail.later', 'Plus tard')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={() => decide('dismiss')}
                    >
                        {t('triage.mail.dismiss', 'Ignorer')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={() => decide('trash')}
                    >
                        {t('triage.deck.option.trash', 'Supprimer')}
                    </Button>
                </div>
            )}
            {payload.from_address && (
                <div className="mt-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            onDecide('archive', {}, false, {
                                always_archive: true,
                            })
                        }
                    >
                        {t(
                            'triage.mail.alwaysArchive',
                            'Toujours archiver cet expéditeur'
                        )}
                    </Button>
                </div>
            )}
            {showArchiveBox && (
                <label className="mt-2 flex min-h-[40px] items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                        type="checkbox"
                        checked={archive}
                        onChange={(event) => setArchive(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                    {t('triage.mail.archive', 'Archiver dans Gmail')}
                </label>
            )}

            {taskForm && (
                <MailTaskForm
                    initialName={
                        suggested?.task_name ??
                        payload.subject ??
                        payload.summary ??
                        ''
                    }
                    initialDue={suggested?.due_date ?? ''}
                    initialHorizon={suggested?.horizon ?? null}
                    onSubmit={(task) => decide('task', task)}
                />
            )}
        </div>
    );
};

export default MailCard;
