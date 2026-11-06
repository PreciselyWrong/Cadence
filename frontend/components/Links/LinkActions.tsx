import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, LinkStatus } from '../../entities/Link';
import { Project } from '../../entities/Project';
import { Tag } from '../../entities/Tag';
import { LINK_STATUSES } from '../../utils/linkFilters';
import { LinkChanges } from '../../utils/linksService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import OverflowMenu from '../Shared/OverflowMenu';
import LinkEditDialog from './LinkEditDialog';

interface LinkActionsProps {
    link: Link;
    projects: Project[];
    availableTags: Tag[];
    onChange: (changes: LinkChanges) => Promise<unknown>;
    onTask?: () => Promise<unknown>;
    onDelete: () => Promise<unknown>;
}

// What can be done with a link: where it stands (one menu, one answer), and
// the rest behind "⋯".
const LinkActions: React.FC<LinkActionsProps> = ({
    link,
    projects,
    availableTags,
    onChange,
    onTask,
    onDelete,
}) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const statusLabels: Record<LinkStatus, string> = {
        new: t('links.status.new', 'To read'),
        to_evaluate: t('links.status.to_evaluate', 'To evaluate'),
        tested: t('links.status.tested', 'To try'),
        kept: t('links.status.kept', 'Kept'),
        parked: t('links.status.parked', 'Later'),
        dropped: t('links.status.dropped', 'Archived'),
    };

    return (
        <div className="flex min-w-0 items-center gap-1">
            <select
                aria-label={t('links.filter.status', 'Status')}
                value={link.status}
                onChange={(e) =>
                    void onChange({ status: e.target.value as LinkStatus })
                }
                className="min-h-[32px] min-w-0 max-w-full rounded-lg border border-gray-200 bg-white pl-2 pr-7 text-[12px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
                {LINK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                        {statusLabels[status]}
                    </option>
                ))}
            </select>
            <OverflowMenu
                label={t('links.more', 'More actions')}
                align="left"
                items={[
                    {
                        key: 'edit',
                        label: t('common.edit', 'Edit'),
                        onClick: () => setEditing(true),
                    },
                    ...(onTask
                        ? [
                              {
                                  key: 'task',
                                  label: t(
                                      'links.action.createTask',
                                      'Create a task'
                                  ),
                                  onClick: () => void onTask(),
                              },
                          ]
                        : []),
                    {
                        key: 'delete',
                        label: t('common.delete', 'Delete'),
                        onClick: () => setDeleting(true),
                    },
                ]}
            />
            {editing && (
                <LinkEditDialog
                    link={link}
                    projects={projects}
                    availableTags={availableTags}
                    onSave={onChange}
                    onClose={() => setEditing(false)}
                />
            )}
            {deleting && (
                <ConfirmDialog
                    title={t('links.deleteTitle', 'Delete this link?')}
                    message={t(
                        'links.deleteMessage',
                        'It leaves your links for good, and is not taken again from your tasks and notes. To set it aside, choose Archived instead.'
                    )}
                    confirmButtonText={t('common.delete', 'Delete')}
                    onCancel={() => setDeleting(false)}
                    onConfirm={() => {
                        setDeleting(false);
                        void onDelete();
                    }}
                />
            )}
        </div>
    );
};

export default LinkActions;
