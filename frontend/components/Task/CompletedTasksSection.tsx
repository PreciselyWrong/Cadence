import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';

// Minimal mode only. Whether a list's "Completed" section is open is kept per
// list in localStorage; a storage failure just means it starts collapsed.
const storageKey = (list: string) => `tududi.completedOpen.${list}`;

const readOpen = (list: string): boolean => {
    try {
        return localStorage.getItem(storageKey(list)) === '1';
    } catch {
        return false;
    }
};

const writeOpen = (list: string, open: boolean): void => {
    try {
        localStorage.setItem(storageKey(list), open ? '1' : '0');
    } catch {
        // Storage is unavailable (private window, blocked site data).
    }
};

interface CompletedTasksSectionProps {
    list: string;
    count: number;
    children: React.ReactNode;
}

const CompletedTasksSection: React.FC<CompletedTasksSectionProps> = ({
    list,
    count,
    children,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(() => readOpen(list));

    useEffect(() => {
        setOpen(readOpen(list));
    }, [list]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        writeOpen(list, next);
    };

    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

    return (
        <section className="mt-6" data-testid="completed-tasks-section">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                data-testid="completed-tasks-toggle"
            >
                <Chevron className="h-4 w-4" aria-hidden="true" />
                <span>{`${t('tasks.completed', 'Completed')} (${count})`}</span>
            </button>
            {open && <div className="mt-2">{children}</div>}
        </section>
    );
};

// Loads a list's completed tasks while `enabled`, and again whenever
// `refreshKey` changes. Pages pass a key that changes when open tasks change.
export const useCompletedTasks = (
    enabled: boolean,
    load: () => Promise<Task[]>,
    refreshKey: string
): [Task[], React.Dispatch<React.SetStateAction<Task[]>>] => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        Promise.resolve()
            .then(() => loadRef.current())
            .then((result) => {
                if (!cancelled) setTasks(result);
            })
            .catch((error) => {
                console.error('Failed to load completed tasks:', error);
            });
        return () => {
            cancelled = true;
        };
    }, [enabled, refreshKey]);

    return [tasks, setTasks];
};

export default CompletedTasksSection;
