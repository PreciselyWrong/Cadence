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
import {
    attachLinkToProject,
    linkTaskNote,
    linkTitle,
} from '../../utils/linkTriage';
import LinkProjectPicker from './LinkProjectPicker';

interface LinkTriageActionsProps {
    item: InboxItem;
    link: Link;
    projects: Project[];
}

type Decision = LinkStatus | 'attach';
type Picking = 'tested' | 'attach';

const DECISIONS: { id: Decision; key: string; fallback: string }[] = [
    { id: 'kept', key: 'links.action.kept', fallback: 'Keep' },
    { id: 'tested', key: 'links.action.tested', fallback: 'Try' },
    { id: 'attach', key: 'links.action.attach', fallback: 'Attach' },
    { id: 'parked', key: 'links.action.parked', fallback: 'Later' },
    { id: 'dropped', key: 'links.action.dropped', fallback: 'Drop' },
];

// The decisions of an inbox link, one tap each, as on Android: the link
// takes the status, the inbox item is marked processed (it leaves the inbox,
// the link stays in the library). Try asks for a project first (or none)
// and creates the task "Try: <title>" with the address and the note; Attach
// asks for a project and files a task named after the link there.
const LinkTriageActions: React.FC<LinkTriageActionsProps> = ({
    item,
    link,
    projects,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const save = useLinksStore((s) => s.save);
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState<Picking | null>(null);
    const selectId = `link-triage-project-${link.uid}`;

    const finish = async (decide: () => Promise<void>): Promise<void> => {
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

    const tryLink = (projectUid: string) =>
        finish(async () => {
            const task = await createTask({
                name: t('links.tryTaskName', 'Try: {{title}}', {
                    title: linkTitle(link),
                }),
                note: linkTaskNote(link),
                project_uid: projectUid || undefined,
            } as Task);
            await save(link.uid, { status: 'tested' });
            await processInboxItemWithStore(item.uid, {
                task_uid: task.uid ?? '',
            });
        });

    const attach = (projectUid: string) =>
        finish(async () => {
            const task = await attachLinkToProject(link, projectUid, save);
            await processInboxItemWithStore(item.uid, {
                task_uid: task.uid ?? '',
            });
        });

    return (
        <div className="mt-2 flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {DECISIONS.filter(
                    (decision) =>
                        decision.id !== 'attach' || projects.length > 0
                ).map((decision) => {
                    const picks =
                        decision.id === 'tested' || decision.id === 'attach';
                    return (
                        <button
                            key={decision.id}
                            type="button"
                            disabled={busy}
                            aria-expanded={
                                picks ? picking === decision.id : undefined
                            }
                            onClick={(e) => {
                                e.stopPropagation();
                                if (picks) {
                                    const id = decision.id as Picking;
                                    setPicking((open) =>
                                        open === id ? null : id
                                    );
                                    return;
                                }
                                void decide(decision.id as LinkStatus);
                            }}
                            className="min-h-[32px] rounded-full border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            {t(decision.key, decision.fallback)}
                        </button>
                    );
                })}
            </div>
            {picking && (
                <LinkProjectPicker
                    key={picking}
                    id={selectId}
                    projects={projects}
                    allowNone={picking === 'tested'}
                    busy={busy}
                    onConfirm={(projectUid) =>
                        void (picking === 'attach'
                            ? attach(projectUid)
                            : tryLink(projectUid))
                    }
                />
            )}
        </div>
    );
};

export default LinkTriageActions;
