import React from 'react';
import { TFunction } from 'i18next';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ProjectHandoffState } from '../../../entities/Project';

const CLEAN_TREE = /^(propre|clean)/i;

interface HandoffSummaryProps {
    handoff: ProjectHandoffState;
    t: TFunction;
    className?: string;
}

// The "État actuel" of a TODO.md project on a board card or column: the next
// action, then the branch, the working tree state and a blocker flag.
const HandoffSummary: React.FC<HandoffSummaryProps> = ({
    handoff,
    t,
    className = '',
}) => {
    const hasMeta = handoff.branch || handoff.tree || handoff.blockers;
    if (!handoff.next_action && !hasMeta) return null;
    const clean = handoff.tree ? CLEAN_TREE.test(handoff.tree) : false;

    return (
        <div
            className={`rounded-lg border border-indigo-100 bg-indigo-50/60 px-2.5 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/30 ${className}`}
        >
            {handoff.next_action && (
                <p
                    className="line-clamp-3 text-[13px] font-medium leading-snug text-indigo-950 dark:text-indigo-200"
                    title={handoff.next_action}
                >
                    → {handoff.next_action}
                </p>
            )}
            {hasMeta && (
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                    {handoff.branch && (
                        <span
                            className="max-w-full truncate rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] dark:bg-gray-900/80"
                            title={handoff.branch}
                        >
                            {handoff.branch}
                        </span>
                    )}
                    {handoff.tree && (
                        <span
                            className="inline-flex min-w-0 items-center gap-1"
                            title={handoff.tree}
                        >
                            <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    clean ? 'bg-green-500' : 'bg-amber-500'
                                }`}
                            />
                            <span className="truncate">{handoff.tree}</span>
                        </span>
                    )}
                    {handoff.blockers && (
                        <span
                            className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            title={handoff.blockers}
                        >
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {t('projectBoard.blocked', 'Blocked')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default HandoffSummary;
