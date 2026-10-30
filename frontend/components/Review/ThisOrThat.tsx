import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { formatDuration } from '../DailyPlan/planUtils';

interface ThisOrThatProps {
    tasks: Task[];
    // The chosen task; the caller decides what choosing means.
    onChoose: (task: Task) => void;
    onClose: () => void;
}

// Two tasks side by side, pick one: the pick stays and meets the next one
// until a single task is left. Choosing changes nothing on the tasks.
const ThisOrThat: React.FC<ThisOrThatProps> = ({
    tasks,
    onChoose,
    onClose,
}) => {
    const { t } = useTranslation();
    const [kept, setKept] = useState<Task | null>(tasks[0] ?? null);
    const [queue, setQueue] = useState<Task[]>(tasks.slice(1));

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (!kept || queue.length === 0) return;
            if (event.key === 'ArrowLeft' || event.key === '1') pick(kept);
            if (event.key === 'ArrowRight' || event.key === '2') pick(queue[0]);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    const pick = (task: Task) => {
        setKept(task);
        setQueue((current) => current.slice(1));
    };

    const skipBoth = () => {
        setKept(queue[1] ?? null);
        setQueue((current) => current.slice(2));
    };

    const challenger = queue[0] ?? null;
    const finished = !challenger;

    const card = (task: Task, shortcut: string) => (
        <button
            type="button"
            onClick={() => pick(task)}
            className="flex min-h-[7rem] flex-1 flex-col items-start rounded-lg border border-gray-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-700 dark:hover:bg-gray-800"
        >
            <span className="text-base font-medium text-gray-900 dark:text-gray-100">
                {task.original_name || task.name}
            </span>
            <span className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {[
                    task.Project?.name,
                    task.estimated_minutes
                        ? formatDuration(task.estimated_minutes)
                        : null,
                ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
            <span className="mt-auto pt-2 text-[11px] text-gray-400 max-md:hidden">
                {shortcut}
            </span>
        </button>
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('thisOrThat.title', 'Which one now?')}
                className="w-full max-w-xl rounded-t-xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="mb-4 text-base font-medium text-gray-900 dark:text-gray-100">
                    {finished && kept
                        ? t('thisOrThat.done', 'Your next action')
                        : t('thisOrThat.title', 'Which one now?')}
                </h3>
                {!kept ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('thisOrThat.none', 'Nothing left to compare.')}
                    </p>
                ) : finished ? (
                    <div className="space-y-4">
                        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {kept.original_name || kept.name}
                        </p>
                        <button
                            type="button"
                            onClick={() => onChoose(kept)}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            {t('thisOrThat.addToday', 'Add to today')}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                        {card(kept, '←')}
                        {card(challenger, '→')}
                    </div>
                )}
                <div className="mt-4 flex justify-between text-sm">
                    {!finished && kept ? (
                        <button
                            type="button"
                            onClick={skipBoth}
                            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            {t('thisOrThat.skipBoth', 'Neither')}
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        {t('thisOrThat.close', 'Close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ThisOrThat;
