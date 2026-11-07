import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SparklesIcon } from '@heroicons/react/24/outline';
import {
    ClassifyEntity,
    ClassifyMark,
    ClassifyRequestError,
    fetchClassifyMarks,
    undoClassifyChange,
} from '../../utils/autoClassifyService';

interface AutoClassifiedMarkProps {
    entity: ClassifyEntity;
    uid?: string | null;
    // What to do once undone; the page is read again by default.
    onUndone?: () => void;
}

// "Classé automatiquement · Annuler", shown while the item is still exactly
// as the classifier left it (the server decides; docs/41-auto-classify.md).
const AutoClassifiedMark: React.FC<AutoClassifiedMarkProps> = ({
    entity,
    uid,
    onUndone,
}) => {
    const { t } = useTranslation();
    const [mark, setMark] = useState<ClassifyMark | null>(null);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setMark(null);
        setRefusal(null);
        if (!uid) return undefined;
        fetchClassifyMarks(entity, uid)
            .then(({ marks }) => alive && setMark(marks[0] ?? null))
            .catch(() => alive && setMark(null));
        return () => {
            alive = false;
        };
    }, [entity, uid]);

    if (!mark) return null;

    const undo = async () => {
        setBusy(true);
        try {
            await undoClassifyChange(mark.change_id);
            setMark(null);
            if (onUndone) onUndone();
            else window.location.reload();
        } catch (error) {
            setRefusal(
                error instanceof ClassifyRequestError && error.status === 409
                    ? t(
                          'autoClassify.mark.changed',
                          'L’élément a changé depuis : annulation impossible'
                      )
                    : t('autoClassify.mark.error', 'Annulation impossible')
            );
            setBusy(false);
        }
    };

    return (
        <p
            className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-600 dark:text-gray-300"
            data-testid="auto-classified-mark"
        >
            <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
                {t('autoClassify.mark.label', 'Classé automatiquement')}
            </span>
            <span aria-hidden="true">·</span>
            {refusal ? (
                <span role="status">{refusal}</span>
            ) : (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void undo()}
                    className="min-h-[32px] font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                >
                    {t('autoClassify.mark.undo', 'Annuler')}
                </button>
            )}
        </p>
    );
};

export default AutoClassifiedMark;
