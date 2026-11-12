import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORM } from '../../../constants/formClasses';
import { useToast } from '../../Shared/ToastContext';
import Button from '../../Shared/ui/Button';
import {
    ClassifyHealth,
    ClassifyRequestError,
    ClassifyRun,
    ClassifySettings,
    ClassifyThresholds,
    DryRunReport,
    fetchClassifyRuns,
    fetchClassifySettings,
    retryClassifyFailed,
    runClassifyDryRun,
    saveClassifySettings,
    undoClassifyChange,
    undoClassifyRun,
} from '../../../utils/autoClassifyService';

interface ClassifyTabProps {
    isActive: boolean;
}

type NumberKey =
    | 'batch_size'
    | 'grace_seconds'
    | 'fetch_wait_minutes'
    | 'max_attempts'
    | 'context_cache_minutes'
    | 'suggestion_ttl_days'
    | 'daily_suggestion_limit'
    | 'log_retention_days'
    | 'max_tags'
    | 'summary_max_chars'
    | 'max_tokens';

// Label, bounds: the same as backend/modules/auto-classify/settings.js.
const NUMBERS: [NumberKey, string, string, number, number][] = [
    ['grace_seconds', 'grace', 'Délai de grâce (secondes)', 0, 3600],
    [
        'fetch_wait_minutes',
        'fetchWait',
        'Attente de lecture d’un lien (minutes)',
        0,
        1440,
    ],
    ['max_attempts', 'attempts', 'Essais en cas d’échec', 1, 20],
    ['batch_size', 'batch', 'Éléments par appel', 1, 50],
    ['context_cache_minutes', 'cache', 'Cache du contexte (minutes)', 0, 1440],
    [
        'suggestion_ttl_days',
        'ttl',
        'Durée de vie d’une suggestion (jours)',
        1,
        365,
    ],
    [
        'daily_suggestion_limit',
        'dailyLimit',
        'Suggestions par jour (0 = sans limite)',
        0,
        1000,
    ],
    ['log_retention_days', 'retention', 'Durée du journal (jours)', 1, 3650],
    ['max_tags', 'maxTags', 'Tags par élément', 0, 10],
    [
        'summary_max_chars',
        'summaryMax',
        'Longueur d’un résumé (caractères)',
        40,
        1000,
    ],
    ['max_tokens', 'maxTokens', 'Jetons de réponse au plus', 200, 16000],
];

const THRESHOLDS: [keyof ClassifyThresholds, string, string][] = [
    ['project', 'project', 'Projet ou domaine'],
    ['tags', 'tags', 'Tags'],
    ['duration', 'duration', 'Durée'],
    ['priority', 'priority', 'Priorité (proposée seulement)'],
    ['ask', 'ask', 'Poser la question à partir de'],
];

const FIELD_LABELS: Record<string, [string, string]> = {
    project_uid: ['autoClassify.field.project', 'projet'],
    area_uid: ['autoClassify.field.area', 'domaine'],
    tags: ['autoClassify.field.tags', 'tags'],
    estimated_minutes: ['autoClassify.field.duration', 'durée'],
    note: ['autoClassify.field.summary', 'résumé'],
};

const card = 'mb-6 rounded-xl border border-gray-200 p-4 dark:border-gray-700';
const heading =
    'mb-3 text-body-m font-semibold text-gray-900 dark:text-gray-50';
const hint = 'mt-0.5 text-body-m text-gray-600 dark:text-gray-300';

// Profile › Classement: every setting of automatic classification, a dry run
// on the last days, and the passes with their undo (docs/41-auto-classify.md).
const ClassifyTab: React.FC<ClassifyTabProps> = ({ isActive }) => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    const [draft, setDraft] = useState<ClassifySettings | null>(null);
    const [defaults, setDefaults] = useState<ClassifySettings | null>(null);
    const [aiConfigured, setAiConfigured] = useState(true);
    const [health, setHealth] = useState<ClassifyHealth | null>(null);
    const [excluded, setExcluded] = useState('');
    const [runs, setRuns] = useState<ClassifyRun[]>([]);
    const [days, setDays] = useState(7);
    const [report, setReport] = useState<DryRunReport | null>(null);
    const [busy, setBusy] = useState(false);

    const loadRuns = useCallback(
        () =>
            fetchClassifyRuns()
                .then(({ runs: list }) => setRuns(list))
                .catch(() => setRuns([])),
        []
    );

    useEffect(() => {
        if (!isActive) return;
        fetchClassifySettings()
            .then((response) => {
                setDraft(response.settings);
                setDefaults(response.defaults);
                setAiConfigured(response.ai_configured);
                setHealth(response.health ?? null);
                setExcluded(response.settings.excluded_tags.join(', '));
            })
            .catch(() =>
                showErrorToast(
                    t('autoClassify.settings.loadError', 'Réglages illisibles')
                )
            );
        loadRuns();
    }, [isActive, loadRuns, showErrorToast, t]);

    const retry = async () => {
        setBusy(true);
        try {
            const { requeued } = await retryClassifyFailed();
            setHealth({ last_error: null, retryable: 0 });
            showSuccessToast(
                t(
                    'autoClassify.health.requeued',
                    '{{count}} éléments relancés',
                    {
                        count: requeued,
                    }
                )
            );
        } catch {
            showErrorToast(
                t('autoClassify.health.retryError', 'Relance impossible')
            );
        } finally {
            setBusy(false);
        }
    };

    if (!draft) {
        return (
            <div
                className={isActive ? '' : 'hidden'}
                data-testid="classify-tab"
            />
        );
    }

    const set = <K extends keyof ClassifySettings>(
        key: K,
        value: ClassifySettings[K]
    ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

    const save = async () => {
        setBusy(true);
        try {
            const response = await saveClassifySettings({
                ...draft,
                excluded_tags: excluded
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
            });
            setDraft(response.settings);
            setExcluded(response.settings.excluded_tags.join(', '));
            showSuccessToast(
                t('autoClassify.settings.saved', 'Réglages enregistrés')
            );
        } catch (error) {
            showErrorToast(
                error instanceof ClassifyRequestError
                    ? error.message
                    : t(
                          'autoClassify.settings.saveError',
                          'Enregistrement impossible'
                      )
            );
        } finally {
            setBusy(false);
        }
    };

    const dryRun = async () => {
        setBusy(true);
        setReport(null);
        try {
            setReport(await runClassifyDryRun(days));
            await loadRuns();
        } catch {
            showErrorToast(t('autoClassify.dryRun.error', 'Essai impossible'));
        } finally {
            setBusy(false);
        }
    };

    const undo = async (run: () => Promise<unknown>) => {
        try {
            await run();
            showSuccessToast(
                t('autoClassify.mark.undone', 'Classement annulé')
            );
        } catch (error) {
            showErrorToast(
                error instanceof ClassifyRequestError && error.status === 409
                    ? t(
                          'autoClassify.mark.changed',
                          'L’élément a changé depuis : annulation impossible'
                      )
                    : t('autoClassify.mark.error', 'Annulation impossible')
            );
        }
        await loadRuns();
    };

    const describe = (after: Record<string, unknown>) =>
        Object.entries(after)
            .map(([field, value]) => {
                const [key, fallback] = FIELD_LABELS[field] ?? [field, field];
                const shown = Array.isArray(value)
                    ? value.map((tag) => `#${tag}`).join(' ')
                    : field === 'estimated_minutes'
                      ? `${value} min`
                      : field === 'note'
                        ? String(value)
                        : '';
                return `${t(key, fallback)}${shown ? ` ${shown}` : ''}`;
            })
            .join(' · ');

    const written = (dryReport: DryRunReport) =>
        dryReport.results.filter((result) => result.outcome === 'dry_run')
            .length;

    return (
        <div className={isActive ? '' : 'hidden'} data-testid="classify-tab">
            <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                {t('autoClassify.settings.title', 'Classement automatique')}
            </h3>
            <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
                {t(
                    'autoClassify.settings.description',
                    'Remplit les champs vides des nouvelles tâches, notes et liens : projet ou domaine, tags, durée, résumé d’un lien. En cas de doute, une carte dans « À trier ».'
                )}
            </p>
            {!aiConfigured && (
                <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                    {t(
                        'autoClassify.settings.noAi',
                        'Aucun fournisseur d’IA : configurez Profil › Assistant IA pour activer le classement.'
                    )}
                </p>
            )}

            {health && (health.last_error || health.retryable > 0) && (
                <div
                    role="alert"
                    className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/30 dark:text-red-100"
                >
                    {health.last_error && (
                        <>
                            <p className="font-semibold">
                                {t(
                                    'autoClassify.health.title',
                                    'Le dernier appel à l’IA a échoué'
                                )}
                            </p>
                            <p className="mt-1 break-words font-mono text-xs">
                                {health.last_error.message}
                            </p>
                            <p className="mt-1 text-xs opacity-80">
                                {new Date(
                                    health.last_error.at
                                ).toLocaleString()}
                            </p>
                        </>
                    )}
                    {health.retryable > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span>
                                {t(
                                    'autoClassify.health.failed',
                                    '{{count}} éléments en échec',
                                    { count: health.retryable }
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                disabled={busy}
                                onClick={retry}
                            >
                                {t('autoClassify.health.retry', 'Réessayer')}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <section className={card}>
                <h4 className={heading}>
                    {t('autoClassify.settings.state', 'Fonctionnement')}
                </h4>
                <label className="flex min-h-[40px] items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                    <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) =>
                            set('enabled', event.target.checked)
                        }
                    />
                    {t('autoClassify.settings.enabled', 'Activé')}
                </label>
                <label className={`${FORM.label} mt-2`}>
                    {t('autoClassify.settings.mode', 'Mode')}
                    <select
                        className={`${FORM.select} mt-1 block w-full max-w-xs`}
                        value={draft.mode}
                        onChange={(event) =>
                            set(
                                'mode',
                                event.target.value as ClassifySettings['mode']
                            )
                        }
                    >
                        <option value="write">
                            {t(
                                'autoClassify.settings.write',
                                'Écriture réelle'
                            )}
                        </option>
                        <option value="dry_run">
                            {t(
                                'autoClassify.settings.dry',
                                'Essai à blanc (rien n’est écrit)'
                            )}
                        </option>
                    </select>
                </label>
                <label className="mt-2 flex min-h-[40px] items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                    <input
                        type="checkbox"
                        checked={draft.notify}
                        onChange={(event) =>
                            set('notify', event.target.checked)
                        }
                    />
                    {t(
                        'autoClassify.settings.notify',
                        'Notifications des suggestions sur Android'
                    )}
                </label>
            </section>

            <section className={card}>
                <h4 className={heading}>
                    {t('autoClassify.settings.model', 'Modèle')}
                </h4>
                <label className={FORM.label}>
                    {t(
                        'autoClassify.settings.modelName',
                        'Modèle (vide : celui de l’Assistant IA)'
                    )}
                    <input
                        type="text"
                        className={`${FORM.input} mt-1 block w-full max-w-xs`}
                        value={draft.model}
                        placeholder="claude-haiku-5-5"
                        onChange={(event) => set('model', event.target.value)}
                    />
                </label>
                <label className={`${FORM.label} mt-3`}>
                    {t(
                        'autoClassify.settings.effort',
                        'Effort de raisonnement'
                    )}
                    <select
                        className={`${FORM.select} mt-1 block w-full max-w-xs`}
                        value={draft.reasoning_effort}
                        onChange={(event) =>
                            set(
                                'reasoning_effort',
                                event.target
                                    .value as ClassifySettings['reasoning_effort']
                            )
                        }
                    >
                        <option value="">
                            {t(
                                'autoClassify.settings.effortNone',
                                'Non envoyé'
                            )}
                        </option>
                        {['minimal', 'low', 'medium', 'high'].map((effort) => (
                            <option key={effort} value={effort}>
                                {effort}
                            </option>
                        ))}
                    </select>
                </label>
                <p className={hint}>
                    {t(
                        'autoClassify.settings.effortHint',
                        'Ignoré par le point d’accès compatible OpenAI d’Anthropic.'
                    )}
                </p>
            </section>

            <section className={card}>
                <h4 className={heading}>
                    {t(
                        'autoClassify.settings.thresholds',
                        'Seuils de confiance'
                    )}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    {THRESHOLDS.map(([key, labelKey, fallback]) => (
                        <label key={key} className={FORM.label}>
                            {t(`autoClassify.threshold.${labelKey}`, fallback)}
                            <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.05}
                                className={`${FORM.input} mt-1 block w-28`}
                                value={draft.thresholds[key]}
                                onChange={(event) =>
                                    set('thresholds', {
                                        ...draft.thresholds,
                                        [key]: Number(event.target.value),
                                    })
                                }
                            />
                            <span className={hint}>
                                {t(
                                    'autoClassify.settings.default',
                                    'Par défaut : {{value}}',
                                    {
                                        value: defaults?.thresholds[key],
                                    }
                                )}
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <section className={card}>
                <h4 className={heading}>
                    {t('autoClassify.settings.limits', 'Délais et limites')}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    {NUMBERS.map(([key, labelKey, fallback, min, max]) => (
                        <label key={key} className={FORM.label}>
                            {t(`autoClassify.number.${labelKey}`, fallback)}
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
                                    'autoClassify.settings.default',
                                    'Par défaut : {{value}}',
                                    {
                                        value: defaults?.[key],
                                    }
                                )}
                            </span>
                        </label>
                    ))}
                </div>
                <label className={`${FORM.label} mt-3`}>
                    {t(
                        'autoClassify.settings.excluded',
                        'Tags jamais posés (séparés par des virgules)'
                    )}
                    <input
                        type="text"
                        className={`${FORM.input} mt-1 block w-full`}
                        value={excluded}
                        onChange={(event) => setExcluded(event.target.value)}
                    />
                </label>
            </section>

            <div className="mb-8">
                <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={busy}
                    onClick={() => void save()}
                >
                    {t('autoClassify.settings.save', 'Enregistrer')}
                </Button>
            </div>

            <section className={card}>
                <h4 className={heading}>
                    {t('autoClassify.dryRun.title', 'Essai à blanc')}
                </h4>
                <p className={`${hint} mb-3`}>
                    {t(
                        'autoClassify.dryRun.description',
                        'Classe les éléments créés ces derniers jours sans rien écrire, pour voir ce qui changerait.'
                    )}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                    <label className={FORM.label}>
                        {t('autoClassify.dryRun.days', 'Jours')}
                        <input
                            type="number"
                            min={1}
                            max={30}
                            className={`${FORM.input} mt-1 block w-24`}
                            value={days}
                            onChange={(event) =>
                                setDays(Number(event.target.value))
                            }
                        />
                    </label>
                    <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        disabled={busy}
                        onClick={() => void dryRun()}
                    >
                        {t('autoClassify.dryRun.run', 'Lancer l’essai')}
                    </Button>
                </div>
                {report && (
                    <p
                        className="mt-3 text-sm text-gray-900 dark:text-gray-100"
                        data-testid="dry-run-report"
                    >
                        {report.error
                            ? t(
                                  'autoClassify.settings.noAi',
                                  'Aucun fournisseur d’IA : configurez Profil › Assistant IA pour activer le classement.'
                              )
                            : t(
                                  'autoClassify.dryRun.report',
                                  '{{considered}} éléments examinés, {{changed}} seraient classés.',
                                  {
                                      considered: report.considered,
                                      changed: written(report),
                                  }
                              )}
                    </p>
                )}
            </section>

            <section className={card}>
                <h4 className={heading}>
                    {t('autoClassify.history.title', 'Passes récentes')}
                </h4>
                {runs.length === 0 && (
                    <p className={hint}>
                        {t(
                            'autoClassify.history.empty',
                            'Aucune passe pour l’instant.'
                        )}
                    </p>
                )}
                <ul className="space-y-4">
                    {runs.map((run) => (
                        <li key={run.run_id}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {run.created_at
                                        ? new Date(
                                              run.created_at
                                          ).toLocaleString()
                                        : ''}
                                    {run.dry_run
                                        ? ` · ${t('autoClassify.history.dry', 'essai à blanc')}`
                                        : ''}
                                </span>
                                {run.undoable > 0 && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="md"
                                        onClick={() =>
                                            void undo(() =>
                                                undoClassifyRun(run.run_id)
                                            )
                                        }
                                    >
                                        {t(
                                            'autoClassify.history.undoRun',
                                            'Annuler la passe'
                                        )}
                                    </Button>
                                )}
                            </div>
                            <ul className="mt-1 space-y-1">
                                {run.changes.map((change) => (
                                    <li
                                        key={change.id}
                                        className="flex flex-wrap items-center justify-between gap-2 text-body-m text-gray-700 dark:text-gray-200"
                                    >
                                        <span
                                            className={
                                                change.undone_at
                                                    ? 'line-through'
                                                    : ''
                                            }
                                        >
                                            {change.item_title} —{' '}
                                            {describe(change.after)}
                                        </span>
                                        {change.undoable && (
                                            <button
                                                type="button"
                                                className="min-h-[32px] font-semibold text-primary hover:underline"
                                                onClick={() =>
                                                    void undo(() =>
                                                        undoClassifyChange(
                                                            change.id
                                                        )
                                                    )
                                                }
                                            >
                                                {t(
                                                    'autoClassify.mark.undo',
                                                    'Annuler'
                                                )}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
};

export default ClassifyTab;
