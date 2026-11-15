import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailPayload, TriageItem } from '../../utils/triageService';
import Button from '../Shared/ui/Button';

interface MailBatchProps {
    cards: TriageItem[];
    onArchive: (keys: string[]) => void;
    onOneByOne: () => void;
}

// Before the deck: the mails the agent advises to archive, all checked.
// One gesture clears the noise; a mail unchecked stays in the deck.
const MailBatch: React.FC<MailBatchProps> = ({
    cards,
    onArchive,
    onOneByOne,
}) => {
    const { t } = useTranslation();
    const [kept, setKept] = useState<string[]>([]);
    const chosen = cards
        .map((item) => item.key)
        .filter((key) => !kept.includes(key));
    const toggle = (key: string) =>
        setKept((list) =>
            list.includes(key)
                ? list.filter((entry) => entry !== key)
                : [...list, key]
        );

    return (
        <section
            data-testid="mail-batch"
            aria-labelledby="mail-batch-title"
            className="w-full max-w-xl rounded-2xl bg-surface-low p-6 shadow-sm ring-1 ring-inset ring-outline-variant/60 max-sm:p-4"
        >
            <h2 id="mail-batch-title" className="text-title-m font-semibold">
                {t('triage.batch.title', '{{count}} mails à archiver', {
                    count: cards.length,
                })}
            </h2>
            <p className="mt-1 text-body-m text-surface-on-variant">
                {t(
                    'triage.batch.hint',
                    'Le Trieur n’y voit rien à faire. Décoche ceux à garder.'
                )}
            </p>
            <ul className="mt-4 max-h-[50vh] divide-y divide-outline-variant/50 overflow-y-auto">
                {cards.map((item) => {
                    const mail = item.payload as unknown as MailPayload;
                    const id = `mail-batch-${mail.mail_uid}`;
                    return (
                        <li key={item.key} className="flex gap-3 py-2">
                            <input
                                id={id}
                                type="checkbox"
                                className="mt-1 h-4 w-4 flex-none accent-primary"
                                checked={!kept.includes(item.key)}
                                onChange={() => toggle(item.key)}
                            />
                            <label htmlFor={id} className="min-w-0 flex-1">
                                <span className="block truncate text-body-m font-medium">
                                    {mail.from_name || mail.from_address}
                                    {' · '}
                                    {mail.subject}
                                </span>
                                {mail.summary && (
                                    <span className="block truncate text-label-m text-surface-on-variant">
                                        {mail.summary}
                                    </span>
                                )}
                            </label>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button
                    variant="primary"
                    size="md"
                    disabled={chosen.length === 0}
                    data-testid="mail-batch-archive"
                    onClick={() => onArchive(chosen)}
                >
                    {t('triage.batch.archive', 'Archiver les {{count}}', {
                        count: chosen.length,
                    })}
                </Button>
                <Button variant="secondary" size="md" onClick={onOneByOne}>
                    {t('triage.batch.oneByOne', 'Les voir un par un')}
                </Button>
            </div>
        </section>
    );
};

export default MailBatch;
