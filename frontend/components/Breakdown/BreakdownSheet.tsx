import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowDownIcon,
    ArrowUpIcon,
    PlusIcon,
    SparklesIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import { INLINE_FIELD_CLASS } from '../Shared/ui/controlSizes';
import { formatDuration } from '../DailyPlan/planUtils';
import {
    applyBreakdown,
    BreakdownReason,
    proposeBreakdown,
} from '../../utils/breakdownService';
import {
    addStep,
    canApply,
    draftsFromProposal,
    DraftStep,
    fallbackDrafts,
    MAX_MINUTES,
    MAX_STEPS,
    MIN_MINUTES,
    moveStep,
    NAME_MAX,
    readySteps,
    removeStep,
    stepProblem,
    totalMinutes,
    updateStep,
} from './breakdownModel';

interface BreakdownSheetProps {
    taskUid: string;
    taskName: string;
    onClose: () => void;
    // The steps are created: the caller reloads its subtasks.
    onApplied: () => void | Promise<void>;
}

const REASON_TEXT: Record<Exclude<BreakdownReason, null>, [string, string]> = {
    disabled: ['breakdown.reason.disabled', 'IA désactivée.'],
    not_configured: ['breakdown.reason.notConfigured', 'IA non configurée.'],
    failed: ['breakdown.reason.failed', 'IA indisponible.'],
    empty: ['breakdown.reason.empty', 'L’IA n’a proposé aucune étape.'],
};

// « Découper en étapes »: the AI proposes small timed steps, edited here, then
// added as subtasks in one go. Without the AI the sheet asks for a first step
// of two minutes instead (docs/fork/WEB-UX-NOTES.md).
const BreakdownSheet: React.FC<BreakdownSheetProps> = ({
    taskUid,
    taskName,
    onClose,
    onApplied,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [steps, setSteps] = useState<DraftStep[]>([]);
    const [reason, setReason] = useState<BreakdownReason>(null);
    const [fromAi, setFromAi] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const focusId = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        proposeBreakdown(taskUid)
            .then((proposal) => {
                if (cancelled) return;
                const ai =
                    proposal.source === 'ai' && proposal.steps.length > 0;
                setFromAi(ai);
                setReason(ai ? null : (proposal.reason ?? 'failed'));
                setSteps(
                    ai ? draftsFromProposal(proposal.steps) : fallbackDrafts()
                );
            })
            .catch(() => {
                if (cancelled) return;
                setFromAi(false);
                setReason('failed');
                setSteps(fallbackDrafts());
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [taskUid]);

    // The empty step of the fallback is where the person types first.
    useEffect(() => {
        if (loading) return;
        const first = fromAi ? null : steps[0]?.id;
        if (first) {
            panelRef.current
                ?.querySelector<HTMLInputElement>(`[data-step="${first}"]`)
                ?.focus();
        } else {
            panelRef.current?.focus();
        }
        // Once, when the proposal arrives.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // A step just added takes the focus.
    useEffect(() => {
        if (!focusId.current) return;
        panelRef.current
            ?.querySelector<HTMLInputElement>(
                `[data-step="${focusId.current}"]`
            )
            ?.focus();
        focusId.current = null;
    }, [steps]);

    const ready = readySteps(steps);
    const applicable = canApply(steps) && !submitting;
    const total = totalMinutes(steps);
    const hasNameProblem = steps.some((s) => stepProblem(s) === 'name');
    const hasMinutesProblem = steps.some((s) => stepProblem(s) === 'minutes');

    const add = () => {
        const next = addStep(steps);
        if (next.length === steps.length) return;
        focusId.current = next[next.length - 1].id;
        setSteps(next);
    };

    const apply = async () => {
        if (!applicable) return;
        setSubmitting(true);
        try {
            await applyBreakdown(taskUid, ready);
            await onApplied();
            onClose();
        } catch {
            showErrorToast(
                t('breakdown.applyError', 'Impossible d’ajouter les étapes.')
            );
            setSubmitting(false);
        }
    };

    // Escape closes this sheet only, not the task sheet behind it.
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
    };

    const applyLabel =
        ready.length > 0
            ? t('breakdown.apply', 'Ajouter {{count}} étapes', {
                  count: ready.length,
              })
            : t('breakdown.applyNone', 'Ajouter les étapes');

    const reasonLine = reason && REASON_TEXT[reason];

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="breakdown-title"
            data-testid="breakdown-sheet"
            onKeyDown={onKeyDown}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
            <div
                aria-hidden="true"
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <div
                ref={panelRef}
                tabIndex={-1}
                className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface-card text-surface-on shadow-xl ring-1 ring-outline-variant outline-none sm:max-w-lg sm:rounded-panel"
            >
                <header className="flex items-start gap-3 px-4 pb-2 pt-4">
                    <SparklesIcon
                        aria-hidden="true"
                        className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    />
                    <div className="min-w-0 flex-1">
                        <h2
                            id="breakdown-title"
                            className="text-title text-surface-on"
                        >
                            {t('breakdown.title', 'Découper en étapes')}
                        </h2>
                        <p className="truncate text-body-m text-surface-on-variant">
                            {taskName}
                        </p>
                    </div>
                    <IconButton
                        label={t('common.close', 'Fermer')}
                        onClick={onClose}
                    >
                        <XMarkIcon />
                    </IconButton>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                    {loading ? (
                        <p
                            role="status"
                            aria-busy="true"
                            className="animate-pulse py-8 text-center text-body-m text-surface-on-variant"
                        >
                            {t('breakdown.loading', 'L’IA découpe la tâche…')}
                        </p>
                    ) : (
                        <>
                            {!fromAi && (
                                <div className="mb-3">
                                    <p className="text-body text-surface-on">
                                        {t(
                                            'breakdown.fallbackPrompt',
                                            'Première étape de 2 min ?'
                                        )}
                                    </p>
                                    {reasonLine && (
                                        <p
                                            data-testid="breakdown-reason"
                                            className="mt-0.5 text-label-m text-surface-on-variant"
                                        >
                                            {t(reasonLine[0], reasonLine[1])}
                                            {(reason === 'not_configured' ||
                                                reason === 'disabled') && (
                                                <>
                                                    {' '}
                                                    <Link
                                                        to="/profile?section=ai-assistant"
                                                        className="text-primary hover:underline"
                                                    >
                                                        {t(
                                                            'breakdown.settingsLink',
                                                            'Profil › Assistant IA'
                                                        )}
                                                    </Link>
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}

                            <ol className="space-y-1.5">
                                {steps.map((step, index) => {
                                    const problem = stepProblem(step);
                                    return (
                                        <li
                                            key={step.id}
                                            className="flex flex-wrap items-center gap-1.5"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="w-5 shrink-0 text-right text-label-m tabular-nums text-surface-on-variant"
                                            >
                                                {index + 1}
                                            </span>
                                            <input
                                                type="text"
                                                data-step={step.id}
                                                value={step.name}
                                                aria-label={t(
                                                    'breakdown.stepName',
                                                    'Nom de l’étape {{n}}',
                                                    { n: index + 1 }
                                                )}
                                                aria-invalid={
                                                    problem === 'name'
                                                }
                                                placeholder={t(
                                                    'breakdown.stepPlaceholder',
                                                    'Étape'
                                                )}
                                                onChange={(event) =>
                                                    setSteps((list) =>
                                                        updateStep(
                                                            list,
                                                            step.id,
                                                            {
                                                                name: event
                                                                    .target
                                                                    .value,
                                                            }
                                                        )
                                                    )
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === 'Enter' &&
                                                        step.name.trim() &&
                                                        index ===
                                                            steps.length - 1
                                                    ) {
                                                        event.preventDefault();
                                                        add();
                                                    }
                                                }}
                                                className={`${INLINE_FIELD_CLASS} min-w-0 flex-[1_1_11rem] ${
                                                    problem === 'name'
                                                        ? '!ring-danger'
                                                        : ''
                                                }`}
                                            />
                                            <div className="ml-auto flex items-center gap-1.5">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={step.minutes}
                                                    aria-label={t(
                                                        'breakdown.minutes',
                                                        'Minutes de l’étape {{n}}',
                                                        { n: index + 1 }
                                                    )}
                                                    aria-invalid={
                                                        problem === 'minutes'
                                                    }
                                                    onChange={(event) =>
                                                        setSteps((list) =>
                                                            updateStep(
                                                                list,
                                                                step.id,
                                                                {
                                                                    minutes:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                }
                                                            )
                                                        )
                                                    }
                                                    className={`${INLINE_FIELD_CLASS} w-14 shrink-0 text-right tabular-nums ${
                                                        problem === 'minutes'
                                                            ? '!ring-danger'
                                                            : ''
                                                    }`}
                                                />
                                                <span
                                                    aria-hidden="true"
                                                    className="w-7 shrink-0 text-label-m text-surface-on-variant"
                                                >
                                                    {t('breakdown.unit', 'min')}
                                                </span>
                                                <IconButton
                                                    label={t(
                                                        'breakdown.moveUp',
                                                        'Monter l’étape {{n}}',
                                                        { n: index + 1 }
                                                    )}
                                                    disabled={index === 0}
                                                    onClick={() =>
                                                        setSteps((list) =>
                                                            moveStep(
                                                                list,
                                                                step.id,
                                                                -1
                                                            )
                                                        )
                                                    }
                                                >
                                                    <ArrowUpIcon />
                                                </IconButton>
                                                <IconButton
                                                    label={t(
                                                        'breakdown.moveDown',
                                                        'Descendre l’étape {{n}}',
                                                        { n: index + 1 }
                                                    )}
                                                    disabled={
                                                        index ===
                                                        steps.length - 1
                                                    }
                                                    onClick={() =>
                                                        setSteps((list) =>
                                                            moveStep(
                                                                list,
                                                                step.id,
                                                                1
                                                            )
                                                        )
                                                    }
                                                >
                                                    <ArrowDownIcon />
                                                </IconButton>
                                                <IconButton
                                                    label={t(
                                                        'breakdown.remove',
                                                        'Retirer l’étape {{n}}',
                                                        { n: index + 1 }
                                                    )}
                                                    onClick={() =>
                                                        setSteps((list) =>
                                                            removeStep(
                                                                list,
                                                                step.id
                                                            )
                                                        )
                                                    }
                                                >
                                                    <XMarkIcon />
                                                </IconButton>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>

                            {(hasNameProblem || hasMinutesProblem) && (
                                <p
                                    role="alert"
                                    className="mt-2 text-label-m text-danger"
                                >
                                    {hasNameProblem
                                        ? t(
                                              'breakdown.problem.name',
                                              'Un nom d’étape fait {{max}} caractères au plus.',
                                              { max: NAME_MAX }
                                          )
                                        : t(
                                              'breakdown.problem.minutes',
                                              'Une durée va de {{min}} à {{max}} minutes.',
                                              {
                                                  min: MIN_MINUTES,
                                                  max: MAX_MINUTES,
                                              }
                                          )}
                                </p>
                            )}

                            <Button
                                variant="ghost"
                                icon={<PlusIcon className="h-4 w-4" />}
                                disabled={steps.length >= MAX_STEPS}
                                onClick={add}
                                className="mt-2 -ml-1"
                            >
                                {t('breakdown.addStep', 'Ajouter une étape')}
                            </Button>
                        </>
                    )}
                </div>

                <footer className="flex items-center gap-2 border-t border-outline-variant px-4 py-3">
                    <span
                        data-testid="breakdown-total"
                        className="mr-auto text-body-m text-surface-on-variant"
                    >
                        {!loading &&
                            total > 0 &&
                            t('breakdown.total', 'Total : {{duration}}', {
                                duration: formatDuration(total),
                            })}
                    </span>
                    <Button variant="ghost" size="md" onClick={onClose}>
                        {t('common.cancel', 'Annuler')}
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        disabled={loading || !applicable}
                        onClick={() => void apply()}
                    >
                        {applyLabel}
                    </Button>
                </footer>
            </div>
        </div>,
        document.body
    );
};

export default BreakdownSheet;
