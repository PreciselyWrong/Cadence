import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { InboxIcon } from '@heroicons/react/24/outline';
import { InboxItem } from '../../entities/InboxItem';
import { Project } from '../../entities/Project';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import {
    analyzeInboxText,
    applyAnalysisToTask,
    deleteInboxItemWithStore,
    ensureAnalysisArea,
    InboxAnalysis,
    processInboxItemWithStore,
    ProcessedInto,
} from '../../utils/inboxService';
import { createTask } from '../../utils/tasksService';
import { createProject } from '../../utils/projectsService';
import { createNote } from '../../utils/notesService';
import { splitFirstLine } from '../../utils/captureText';
import { matchProjectName, priorityFromText } from '../../utils/inboxTokens';
import {
    suggestTriage,
    TriageKind,
    TriageSuggestion,
} from '../../utils/inboxTriage';
import { isEditableTarget } from '../../utils/shortcutDispatcher';
import { isAuthError } from '../../utils/authUtils';

interface InboxTriageProps {
    projects: Project[];
    onExit: () => void;
    onProjectsChanged: () => void;
}

const reasonText = (t: TFunction, suggestion: TriageSuggestion): string => {
    const options = { detail: suggestion.detail };
    switch (suggestion.reason) {
        case 'project':
            return t(
                'inbox.triage.reasonProject',
                'It names the project +{{detail}}',
                options
            );
        case 'tag':
            return t(
                'inbox.triage.reasonTag',
                'It is tagged #{{detail}}',
                options
            );
        case 'url':
            return t('inbox.triage.reasonUrl', 'It is a link', options);
        case 'keyword':
            return t(
                'inbox.triage.reasonKeyword',
                'It starts with "{{detail}}"',
                options
            );
        case 'long':
            return t(
                'inbox.triage.reasonLong',
                'It is long, like a note',
                options
            );
        default:
            return t(
                'inbox.triage.reasonDefault',
                'Short text, most often a task',
                options
            );
    }
};

// Keyboard-first pass over the inbox: one item at a time, one key each.
const InboxTriage: React.FC<InboxTriageProps> = ({
    projects,
    onExit,
    onProjectsChanged,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const inboxItems = useStore((state) => state.inboxStore.inboxItems);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [handled, setHandled] = useState(0);
    const totalRef = useRef(inboxItems.length);
    const lastGRef = useRef(0);

    const queue = useMemo(
        () => inboxItems.filter((item) => !skipped.includes(item.uid ?? '')),
        [inboxItems, skipped]
    );
    const current: InboxItem | undefined = queue[0];
    const suggestion = useMemo(
        () => (current ? suggestTriage(current.content) : null),
        [current]
    );

    const convert = useCallback(
        async (item: InboxItem, kind: TriageKind) => {
            const { first, rest } = splitFirstLine(item.content);
            let analysis: InboxAnalysis | null = null;
            try {
                analysis = await ensureAnalysisArea(
                    await analyzeInboxText(first, {
                        referenceDate: item.created_at,
                    })
                );
            } catch (error) {
                console.error('Triage analysis failed:', error);
            }
            const title = analysis?.cleaned_content?.trim() || first.trim();
            const tags = (analysis?.parsed_tags ?? []).map((name) => ({
                name,
            }));
            const projectName = analysis?.parsed_projects?.[0];
            const project = projectName
                ? matchProjectName(projects, projectName)
                : undefined;

            let into: ProcessedInto;
            if (kind === 'task') {
                const created = await createTask(
                    applyAnalysisToTask(
                        {
                            name: title,
                            note: rest || undefined,
                            priority: priorityFromText(first) ?? 'low',
                            status: 'not_started',
                            tags,
                            project_uid: project?.uid,
                            completed_at: null,
                        },
                        analysis
                    )
                );
                into = { task_uid: created.uid as string };
            } else if (kind === 'project') {
                const created = await createProject({
                    name: title,
                    description: rest,
                    status: 'planned',
                    tags,
                    due_date_at: analysis?.parsed_due_date ?? undefined,
                });
                onProjectsChanged();
                into = { project_uid: created.uid as string };
            } else {
                const created = await createNote({
                    title,
                    content: rest || item.content,
                    tags,
                    project_uid: project?.uid,
                });
                useStore.getState().notesStore.addNote(created);
                into = { note_uid: created.uid as string };
            }
            await processInboxItemWithStore(item.uid as string, into);
        },
        [projects, onProjectsChanged]
    );

    const act = useCallback(
        async (action: TriageKind | 'later' | 'delete') => {
            if (!current?.uid || busy) return;
            const uid = current.uid;
            if (action === 'later') {
                setSkipped((list) => [...list, uid]);
                showSuccessToast(
                    t('inbox.triage.keptLater', 'Kept in the inbox for later')
                );
                return;
            }
            setBusy(true);
            try {
                if (action === 'delete') {
                    await deleteInboxItemWithStore(uid);
                    showSuccessToast(t('inbox.itemDeleted'));
                } else {
                    await convert(current, action);
                    showSuccessToast(
                        action === 'task'
                            ? t('inbox.triage.madeTask', 'Task created')
                            : action === 'project'
                              ? t('inbox.triage.madeProject', 'Project created')
                              : t('inbox.triage.madeNote', 'Note created')
                    );
                }
                setHandled((count) => count + 1);
            } catch (error) {
                if (!isAuthError(error)) {
                    console.error('Triage action failed:', error);
                    showErrorToast(
                        t(
                            'inbox.triage.error',
                            'Could not process this item. It is still in the inbox.'
                        )
                    );
                }
            } finally {
                setBusy(false);
            }
        },
        [current, busy, convert, showErrorToast, showSuccessToast, t]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'g' || event.key === 'G') {
                lastGRef.current = Date.now();
                return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isEditableTarget(event.target) || event.defaultPrevented)
                return;
            // The second key of a "g then ..." go-to sequence
            if (Date.now() - lastGRef.current < 1000) return;
            const key = event.key.toLowerCase();
            const handlers: Record<string, () => void> = {
                t: () => void act('task'),
                p: () => void act('project'),
                n: () => void act('note'),
                l: () => void act('later'),
                delete: () => void act('delete'),
                backspace: () => void act('delete'),
                enter: () => suggestion && void act(suggestion.kind),
                escape: onExit,
            };
            const handler = handlers[key];
            if (!handler) return;
            event.preventDefault();
            handler();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [act, onExit, suggestion]);

    const total = Math.max(totalRef.current, handled + queue.length);
    const percent = total > 0 ? Math.round((handled / total) * 100) : 100;

    const actions: Array<{
        key: string;
        action: TriageKind | 'later' | 'delete';
        label: string;
    }> = [
        { key: 'T', action: 'task', label: t('inbox.triage.task', 'Task') },
        {
            key: 'P',
            action: 'project',
            label: t('inbox.triage.project', 'Project'),
        },
        { key: 'N', action: 'note', label: t('inbox.triage.note', 'Note') },
        { key: 'L', action: 'later', label: t('inbox.triage.later', 'Later') },
        {
            key: 'Del',
            action: 'delete',
            label: t('inbox.triage.delete', 'Delete'),
        },
    ];

    return (
        <div data-testid="inbox-triage" className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {t('inbox.triage.title', 'Triage the inbox')}
                </h2>
                <button
                    type="button"
                    onClick={onExit}
                    className="text-sm text-gray-600 dark:text-gray-300 hover:underline"
                >
                    {t('inbox.triage.exit', 'Exit')}
                    <kbd className="ml-2 px-1.5 rounded border border-gray-300 dark:border-gray-600 text-[11px] font-mono">
                        Esc
                    </kbd>
                </button>
            </div>

            <div
                className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-1"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
                <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <p className="mb-5 text-xs text-gray-500 dark:text-gray-400">
                {t('inbox.triage.progress', '{{done}} of {{total}} sorted', {
                    done: handled,
                    total,
                })}
            </p>

            {!current ? (
                <div
                    data-testid="inbox-triage-done"
                    className="rounded-xl bg-white dark:bg-gray-800 shadow-sm p-10 text-center"
                >
                    <InboxIcon className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-700 dark:text-gray-200">
                        {skipped.length > 0
                            ? t(
                                  'inbox.triage.doneLater',
                                  '{{count}} kept for later. Everything else is sorted.',
                                  { count: skipped.length }
                              )
                            : t(
                                  'inbox.triage.done',
                                  'Inbox is empty. Nothing left to sort.'
                              )}
                    </p>
                </div>
            ) : (
                <div className="rounded-xl bg-white dark:bg-gray-800 shadow-sm p-6">
                    <p
                        data-testid="inbox-triage-content"
                        className="whitespace-pre-wrap break-words text-xl leading-relaxed text-gray-900 dark:text-gray-100"
                    >
                        {current.content}
                    </p>
                    {suggestion && (
                        <p
                            data-testid="inbox-triage-suggestion"
                            className="mt-4 text-sm text-gray-600 dark:text-gray-300"
                        >
                            {t(
                                'inbox.triage.suggested',
                                'Suggested: {{kind}}',
                                {
                                    kind: t(
                                        `inbox.triage.${suggestion.kind}`,
                                        suggestion.kind
                                    ),
                                }
                            )}
                            {' - '}
                            {reasonText(t, suggestion)}
                            <kbd className="ml-2 px-1.5 rounded border border-gray-300 dark:border-gray-600 text-[11px] font-mono">
                                Enter
                            </kbd>
                        </p>
                    )}
                    <div className="mt-6 flex flex-wrap gap-2">
                        {actions.map(({ key, action, label }) => (
                            <button
                                key={action}
                                type="button"
                                disabled={busy}
                                data-testid={`triage-${action}`}
                                onClick={() => void act(action)}
                                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    suggestion?.kind === action
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {label}
                                <kbd className="px-1.5 rounded border border-current/30 text-[11px] font-mono opacity-80">
                                    {key}
                                </kbd>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InboxTriage;
