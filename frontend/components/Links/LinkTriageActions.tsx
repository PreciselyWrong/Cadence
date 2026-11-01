import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, LinkStatus } from '../../entities/Link';
import { InboxItem } from '../../entities/InboxItem';
import { Project } from '../../entities/Project';
import { Task } from '../../entities/Task';
import { useLinksStore } from '../../store/linksStore';
import { processInboxItemWithStore } from '../../utils/inboxService';
import { createTask } from '../../utils/tasksService';
import { useToast } from '../Shared/ToastContext';

interface LinkTriageActionsProps {
    item: InboxItem;
    link: Link;
    projects: Project[];
}

const DECISIONS: { status: LinkStatus; key: string; fallback: string }[] = [
    { status: 'kept', key: 'links.action.kept', fallback: 'Keep' },
    { status: 'tested', key: 'links.action.tested', fallback: 'Try' },
    { status: 'parked', key: 'links.action.parked', fallback: 'Later' },
    { status: 'dropped', key: 'links.action.dropped', fallback: 'Drop' },
];

// The four decisions of an inbox link, one tap each, as on Android: the link
// takes the status, the inbox item is marked processed (it leaves the inbox,
// the link stays in the library). Try asks for a project first and creates
// the task "Try: <title>" with the address and the note.
const LinkTriageActions: React.FC<LinkTriageActionsProps> = ({
    item,
    link,
    projects,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const save = useLinksStore((s) => s.save);
    const [busy, setBusy] = useState(false);
    const [pickingProject, setPickingProject] = useState(false);
    const [projectUid, setProjectUid] = useState('');
    const selectId = `link-triage-project-${link.uid}`;
    const title = link.title || link.domain || link.url;

    const finish = async (
        decide: () => Promise<void>
    ): Promise<void> => {
        setBusy(true);
        try {
            await decide();
        } catch {
            showErrorToast(
                t('links.triageError', 'Could not save the decision.')
            );
        } finally {
            setBusy(false);
        }
    };

    const decide = (status: LinkStatus) =>
        finish(async () => {
            await save(link.uid, { status });
            await processInboxItemWithStore(item.uid);
        });

    const tryLink = () =>
        finish(async () => {
            const task = await createTask({
                name: t('links.tryTaskName', 'Try: {{title}}', { title }),
                note: [link.url, link.note?.trim()]
                    .filter(Boolean)
                    .join('\n\n'),
                project_uid: projectUid || undefined,
            } as Task);
            await save(link.uid, { status: 'tested' });
            await processInboxItemWithStore(item.uid, {
                task_uid: task.uid ?? '',
            });
        });

    return (
        <div className="mt-2 flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {DECISIONS.map((decision) => (
                    <button
                        key={decision.status}
                        type="button"
                        disabled={busy}
                        aria-expanded={
                            decision.status === 'tested'
                                ? pickingProject
                                : undefined
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            if (decision.status === 'tested') {
                                setPickingProject((open) => !open);
                                return;
                            }
                            void decide(decision.status);
                        }}
                        className="min-h-[32px] rounded-full border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        {t(decision.key, decision.fallback)}
                    </button>
                ))}
            </div>
            {pickingProject && (
                <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    <label
                        htmlFor={selectId}
                        className="text-[12px] text-gray-600 dark:text-gray-300"
                    >
                        {t('links.tryProject', 'Project')}
                    </label>
                    <select
                        id={selectId}
                        value={projectUid}
                        onChange={(e) => setProjectUid(e.target.value)}
                        className="min-h-[32px] rounded-md border border-gray-200 bg-white px-2 text-[13px] dark:border-gray-700 dark:bg-gray-900"
                    >
                        <option value="">
                            {t('links.tryNoProject', 'No project')}
                        </option>
                        {projects.map((project) => (
                            <option key={project.uid} value={project.uid}>
                                {project.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                            e.stopPropagation();
                            void tryLink();
                        }}
                        className="min-h-[32px] rounded-full bg-blue-600 px-3 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
                    >
                        {t('links.tryCreate', 'Create task')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default LinkTriageActions;
