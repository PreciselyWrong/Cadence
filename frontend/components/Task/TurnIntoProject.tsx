import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FolderIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { turnTaskIntoProject } from '../../utils/tasksService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import { useToast } from '../Shared/ToastContext';

// A top-level, one-off task the user owns, not mirrored from a TODO.md file.
export const canBecomeProject = (task: Task): boolean =>
    Boolean(task.uid) &&
    !task.parent_task_id &&
    !task.recurring_parent_id &&
    (!task.recurrence_type || task.recurrence_type === 'none') &&
    !(task as Task & { source_key?: string | null }).source_key;

// « Transformer en projet » (docs/37-links.md): a menu item, its question,
// then the new project opens.
const TurnIntoProject: React.FC<{ task: Task; onDone?: () => void }> = ({
    task,
    onDone,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { showErrorToast } = useToast();
    const [asking, setAsking] = useState(false);
    if (!canBecomeProject(task)) return null;
    const label = t('task.turnIntoProject', 'Turn into a project');

    const turn = async () => {
        setAsking(false);
        try {
            const { project } = await turnTaskIntoProject(task.uid as string);
            onDone?.();
            navigate(`/project/${project.uid}`);
        } catch {
            showErrorToast(
                t(
                    'task.turnIntoProjectError',
                    'Could not turn it into a project.'
                )
            );
        }
    };

    return (
        <>
            <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                    e.stopPropagation();
                    setAsking(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
                <FolderIcon className="h-4 w-4" />
                {label}
            </button>
            {asking && (
                <ConfirmDialog
                    title={label}
                    message={t(
                        'task.turnIntoProjectMessage',
                        'Turn « {{name}} » into a project? Its subtasks become the project’s tasks and the addresses of its note its pages.',
                        { name: task.name }
                    )}
                    confirmButtonText={label}
                    onConfirm={() => void turn()}
                    onCancel={() => setAsking(false)}
                />
            )}
        </>
    );
};

export default TurnIntoProject;
