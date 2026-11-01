import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
    TodoMdRepoStatus,
    discardTodoMdRepo,
    fetchTodoMdStatus,
    retryTodoMdRepo,
} from '../../utils/todoMdService';
import { getCurrentLocale } from '../../utils/dateUtils';

const REFRESH_MS = 30_000;

interface TodoMdRepoSyncProps {
    slug: string;
    // Bumped by the parent after a reread, so the state is fetched again.
    refreshKey?: number;
    onChanged?: () => Promise<void> | void;
}

// Under a project mirrored from a git repository: when it was last synced,
// or the edits that did not reach the repository, with Retry / Discard.
const TodoMdRepoSync: React.FC<TodoMdRepoSyncProps> = ({
    slug,
    refreshKey,
    onChanged,
}) => {
    const { t } = useTranslation();
    const [repo, setRepo] = useState<TodoMdRepoStatus | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const status = await fetchTodoMdStatus();
            setRepo(status.repos.find((r) => r.slug === slug) || null);
        } catch {
            setRepo(null);
        }
    }, [slug]);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [load, refreshKey]);

    if (!repo) return null;

    const act = async (action: typeof retryTodoMdRepo) => {
        if (busy) return;
        setBusy(true);
        try {
            setRepo(await action(slug));
            await onChanged?.();
        } catch {
            await load();
        } finally {
            setBusy(false);
        }
    };

    const conflict = repo.pending.find((p) => p.reason === 'conflict');
    let message: string;
    let tone = 'text-gray-600 dark:text-gray-300';
    if (conflict) {
        tone = 'text-amber-700 dark:text-amber-400';
        message = t(
            'todoMd.repoConflict',
            'Conflict: "{{name}}" changed in the repository, nothing was written.',
            { name: conflict.name }
        );
    } else if (repo.pending.length > 0) {
        tone = 'text-amber-700 dark:text-amber-400';
        message = t(
            'todoMd.repoPending',
            '{{count}} change(s) waiting: the repository cannot be reached.',
            { count: repo.pending.length }
        );
    } else if (repo.last_error) {
        tone = 'text-red-600 dark:text-red-400';
        message = t(
            'todoMd.repoError',
            'Could not sync with {{repo}}: {{error}}',
            { repo: repo.repo, error: repo.last_error }
        );
    } else if (repo.synced_at) {
        message = t('todoMd.repoSynced', 'Synced with {{repo}} · {{ago}}', {
            repo: repo.repo,
            ago: formatDistanceToNow(new Date(repo.synced_at), {
                addSuffix: true,
                locale: getCurrentLocale(),
            }),
        });
    } else {
        message = t('todoMd.repoNotSynced', 'Not synced with {{repo}} yet', {
            repo: repo.repo,
        });
    }

    const button =
        'rounded-md px-1.5 py-0.5 font-medium hover:bg-white/60 disabled:opacity-60 dark:hover:bg-gray-800/60';

    return (
        <div
            className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs ${tone}`}
            data-testid="todo-md-repo-sync"
            role={repo.pending.length > 0 ? 'status' : undefined}
        >
            <span className="min-w-0 break-words">{message}</span>
            {repo.pending.length > 0 && (
                <>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(retryTodoMdRepo)}
                        className={`${button} text-blue-600 dark:text-blue-400`}
                        data-testid="todo-md-repo-retry"
                    >
                        {t('todoMd.repoRetry', 'Retry')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(discardTodoMdRepo)}
                        className={`${button} text-gray-600 dark:text-gray-300`}
                        data-testid="todo-md-repo-discard"
                    >
                        {t('todoMd.repoDiscard', 'Discard')}
                    </button>
                </>
            )}
        </div>
    );
};

export default TodoMdRepoSync;
