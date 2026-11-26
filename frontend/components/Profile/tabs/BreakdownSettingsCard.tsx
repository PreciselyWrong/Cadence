import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORM } from '../../../constants/formClasses';
import { useToast } from '../../Shared/ToastContext';
import Button from '../../Shared/ui/Button';
import {
    BreakdownRequestError,
    BreakdownSettings,
    getBreakdownSettings,
    updateBreakdownSettings,
} from '../../../utils/breakdownService';

type NumberKey =
    | 'max_steps'
    | 'min_step_minutes'
    | 'max_step_minutes'
    | 'note_chars'
    | 'max_tokens';

// Key, label, bounds: the same as backend/modules/breakdown/settings.js.
const NUMBERS: [NumberKey, string, string, number, number][] = [
    ['max_steps', 'maxSteps', 'Étapes au plus', 2, 15],
    [
        'min_step_minutes',
        'minMinutes',
        'Durée minimale d’une étape (minutes)',
        5,
        60,
    ],
    [
        'max_step_minutes',
        'maxMinutes',
        'Durée maximale d’une étape (minutes)',
        5,
        240,
    ],
    [
        'note_chars',
        'noteChars',
        'Caractères de la note envoyés à l’IA',
        0,
        10000,
    ],
    ['max_tokens', 'maxTokens', 'Jetons de réponse au plus', 200, 8000],
];

const hint =
    'mt-0.5 block text-body-m font-normal text-gray-600 dark:text-gray-300';

// Profile › Assistant IA: the tunables of « Découper en étapes », saved apart
// from the provider form (docs/fork/WEB-UX-NOTES.md).
const BreakdownSettingsCard: React.FC<{ isActive: boolean }> = ({
    isActive,
}) => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [draft, setDraft] = useState<BreakdownSettings | null>(null);
    const [defaults, setDefaults] = useState<BreakdownSettings | null>(null);
    const [aiConfigured, setAiConfigured] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isActive || draft) return;
        getBreakdownSettings()
            .then((response) => {
                setDraft(response.settings);
                setDefaults(response.defaults);
                setAiConfigured(response.ai_configured);
            })
            .catch(() =>
                showErrorToast(
                    t('breakdown.settings.loadError', 'Réglages illisibles')
                )
            );
    }, [isActive, draft, showErrorToast, t]);

    if (!draft) return null;

    const set = <K extends keyof BreakdownSettings>(
        key: K,
        value: BreakdownSettings[K]
    ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

    const save = async () => {
        setBusy(true);
        try {
            const response = await updateBreakdownSettings(draft);
            setDraft(response.settings);
            showSuccessToast(
                t('breakdown.settings.saved', 'Réglages enregistrés')
            );
        } catch (error) {
            showErrorToast(
                error instanceof BreakdownRequestError
                    ? error.message
                    : t(
                          'breakdown.settings.saveError',
                          'Enregistrement impossible'
                      )
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <section
            data-testid="breakdown-settings"
            className="mt-8 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('breakdown.title', 'Découper en étapes')}
            </h4>
            <p className="mb-3 mt-1 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'breakdown.settings.description',
                    'L’IA propose des étapes courtes et minutées pour une tâche ; vous les corrigez avant de les ajouter en sous-tâches.'
                )}
            </p>
            {!aiConfigured && (
                <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                    {t(
                        'breakdown.settings.noAi',
                        'Aucun fournisseur d’IA : renseignez la clé ci-dessus pour obtenir des propositions.'
                    )}
                </p>
            )}

            <label className="flex min-h-[40px] items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => set('enabled', event.target.checked)}
                />
                {t('breakdown.settings.enabled', 'Activé')}
            </label>

            <label className={`${FORM.label} mt-3`}>
                {t(
                    'breakdown.settings.model',
                    'Modèle (vide : celui de l’Assistant IA)'
                )}
                <input
                    type="text"
                    maxLength={200}
                    className={`${FORM.input} mt-1 block w-full max-w-xs`}
                    value={draft.model}
                    onChange={(event) => set('model', event.target.value)}
                />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {NUMBERS.map(([key, labelKey, fallback, min, max]) => (
                    <label key={key} className={FORM.label}>
                        {t(`breakdown.settings.${labelKey}`, fallback)}
                        <input
                            type="number"
                            min={min}
                            max={max}
                            step={1}
                            className={`${FORM.input} mt-1 block w-28`}
                            value={draft[key]}
                            onChange={(event) =>
                                set(key, Number(event.target.value))
                            }
                        />
                        <span className={hint}>
                            {t(
                                'breakdown.settings.default',
                                'Par défaut : {{value}}',
                                { value: defaults?.[key] }
                            )}
                        </span>
                    </label>
                ))}
            </div>

            <div className="mt-4">
                <Button
                    variant="primary"
                    size="md"
                    disabled={busy}
                    onClick={() => void save()}
                >
                    {t('common.save', 'Enregistrer')}
                </Button>
            </div>
        </section>
    );
};

export default BreakdownSettingsCard;
