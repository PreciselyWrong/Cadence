import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    DuplicateAction,
    DuplicatePayload,
} from '../../utils/autoClassifyService';

const buttonBase =
    'min-h-[40px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const secondary = `${buttonBase} text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800`;
const primary = `${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`;

const REASONS: Record<DuplicatePayload['reason'], [string, string]> = {
    address: ['autoClassify.duplicate.address', 'Même page'],
    repository: ['autoClassify.duplicate.repository', 'Même dépôt'],
    video: ['autoClassify.duplicate.video', 'Même vidéo'],
    title: ['autoClassify.duplicate.title', 'Même titre sur le même site'],
};

interface DuplicateCardProps {
    payload: DuplicatePayload;
    onChoose: (action: DuplicateAction) => void;
}

const LinkLine: React.FC<{
    label: string;
    title: string | null;
    url: string;
}> = ({ label, title, url }) => (
    <p className="mt-2 text-[15px] text-gray-900 dark:text-gray-100">
        <span className="text-[13px] text-gray-600 dark:text-gray-300">
            {label}{' '}
        </span>
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline decoration-gray-300 underline-offset-2"
        >
            {title || url}
        </a>
    </p>
);

// A link saved twice: the user decides, nothing is dropped automatically.
const DuplicateCard: React.FC<DuplicateCardProps> = ({ payload, onChoose }) => {
    const { t } = useTranslation();
    const [reasonKey, reasonFallback] = REASONS[payload.reason];
    const choices: [DuplicateAction, string, string][] = [
        ['drop_new', 'autoClassify.duplicate.dropNew', 'Archiver le nouveau'],
        ['merge', 'autoClassify.duplicate.merge', 'Fusionner dans l’ancien'],
        ['keep_new', 'autoClassify.duplicate.keepNew', 'Garder le nouveau'],
        ['keep_both', 'autoClassify.duplicate.keepBoth', 'Garder les deux'],
    ];
    return (
        <div data-testid="duplicate-card">
            <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300">
                {t(reasonKey, reasonFallback)}
            </p>
            <LinkLine
                label={t('autoClassify.duplicate.new', 'Nouveau :')}
                title={payload.title}
                url={payload.url}
            />
            <LinkLine
                label={t('autoClassify.duplicate.original', 'Déjà gardé :')}
                title={payload.original.title}
                url={payload.original.url}
            />
            <div className="mt-3 flex flex-wrap gap-2">
                {choices.map(([action, key, fallback], index) => (
                    <button
                        key={action}
                        type="button"
                        className={index === 0 ? primary : secondary}
                        onClick={() => onChoose(action)}
                    >
                        {t(key, fallback)}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default DuplicateCard;
