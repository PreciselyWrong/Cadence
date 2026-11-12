import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailDecision, MailPayload } from '../../utils/triageService';
import Button from '../Shared/ui/Button';

// The reply link is an anchor, which Button cannot render: it keeps Button's look.
const linkBase =
    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-body-m font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-[44px]';
const linkPrimary = `${linkBase} bg-primary text-primary-on hover:bg-primary/90`;
const linkSecondary = `${linkBase} text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high`;
const field =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900';

// The server only keeps Gmail addresses; checked again before it becomes a link.
const GMAIL = 'https://mail.google.com/';

interface MailCardProps {
    payload: MailPayload;
    archiveAvailable: boolean;
    onDecide: (
        decision: MailDecision,
        payload: Record<string, unknown>,
        archive: boolean
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
    const [name, setName] = useState('');
    const [dueDate, setDueDate] = useState('');

    const suggested = payload.suggestion;
    const replyUrl = payload.gmail_url.startsWith(GMAIL)
        ? payload.gmail_url
        : null;
    const sender = payload.from_name || payload.from_address;
    const meta = [sender, receivedOn(payload.received_at)]
        .filter(Boolean)
        .join(' · ');
    // Putting a mail off keeps it in the inbox.
    const decide = (decision: MailDecision, extra = {}) =>
        onDecide(decision, extra, archive && decision !== 'later');

    const openTaskForm = () => {
        setName(
            suggested?.task_name ?? payload.subject ?? payload.summary ?? ''
        );
        setDueDate(suggested?.due_date ?? '');
        setTaskForm(true);
    };

    const submitTask = (event: React.FormEvent) => {
        event.preventDefault();
        const text = name.trim();
        if (!text) return;
        decide(
            'task',
            dueDate ? { name: text, due_date: dueDate } : { name: text }
        );
    };

    const taskFirst = suggested?.kind !== 'reply';

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

            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    variant={taskFirst ? 'primary' : 'secondary'}
                    size="md"
                    aria-expanded={taskForm}
                    onClick={() =>
                        taskForm ? setTaskForm(false) : openTaskForm()
                    }
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
            </div>
            {archiveAvailable && (
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
                <form
                    onSubmit={submitTask}
                    className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700"
                >
                    <label className="block text-sm text-gray-700 dark:text-gray-200">
                        {t('triage.mail.taskName', 'Nom de la tâche')}
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className={field}
                            autoFocus
                        />
                    </label>
                    <label className="mt-2 block text-sm text-gray-700 dark:text-gray-200">
                        {t('triage.mail.taskDue', 'Échéance')}
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(event) => setDueDate(event.target.value)}
                            className={field}
                        />
                    </label>
                    <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        className="mt-2"
                    >
                        {t('triage.mail.createTask', 'Créer la tâche')}
                    </Button>
                </form>
            )}
        </div>
    );
};

export default MailCard;
