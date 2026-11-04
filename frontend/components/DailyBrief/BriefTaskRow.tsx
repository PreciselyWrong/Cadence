import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '@heroicons/react/24/outline';

interface BriefTaskRowProps {
    name: string;
    done: boolean;
    onToggle: () => void;
    onOpen: () => void;
    meta?: string;
    trailing?: React.ReactNode;
}

// A task line of the brief: the completion circle, the title (opens the task
// panel) and one quiet meta line. The state shown is the task's current one.
const BriefTaskRow: React.FC<BriefTaskRowProps> = ({
    name,
    done,
    onToggle,
    onOpen,
    meta,
    trailing,
}) => {
    const { t } = useTranslation();
    return (
        <div
            className="flex items-start gap-3 border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-800"
            data-testid="brief-task-row"
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={t('dailyBrief.task.complete', "C'est fait")}
                onClick={onToggle}
                className={`mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border-[1.8px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    done
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-400 text-transparent hover:border-indigo-500 dark:border-gray-500'
                }`}
            >
                <CheckIcon className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
                <button
                    type="button"
                    onClick={onOpen}
                    className={`block max-w-full truncate text-left text-[15px] text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-100 ${
                        done
                            ? 'text-gray-500 line-through decoration-gray-400 dark:text-gray-400'
                            : ''
                    }`}
                >
                    {name}
                </button>
                {meta && (
                    <div className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">
                        {meta}
                    </div>
                )}
            </div>
            {trailing}
        </div>
    );
};

export default BriefTaskRow;
