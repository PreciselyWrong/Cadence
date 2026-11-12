import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../entities/Link';
import { Project } from '../../entities/Project';
import { Tag } from '../../entities/Tag';
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
    // Offered only when the link has no note yet.
    onAddNote?: () => void;
}

// What can be done with a link, behind "⋯": edit, make a task of it, archive
// it (kept, hidden by default) or delete it for good.
const LinkActions: React.FC<LinkActionsProps> = ({
    link,
    projects,
    availableTags,
    onChange,
    onTask,
    onDelete,
    onAddNote,
}) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const archived = link.status === 'dropped';

    return (
        <div className="flex min-w-0 items-center gap-1">
            <OverflowMenu
                label={t('links.more', 'More actions')}
                align="left"
                items={[
                    {
                        key: 'edit',
                        label: t('common.edit', 'Edit'),
                        onClick: () => setEditing(true),
                    },
                    ...(onAddNote && !link.note
                        ? [
                              {
                                  key: 'note',
                                  label: t('links.addNote', 'Add a note'),
                                  onClick: onAddNote,
                              },
                          ]
                        : []),
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
                        key: 'archive',
                        label: archived
                            ? t('links.action.restore', 'Unarchive')
                            : t('links.action.dropped', 'Archive'),
                        onClick: () =>
                            void onChange({
                                status: archived ? 'new' : 'dropped',
                            }),
                    },
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
                        'It leaves your links for good. To set it aside, archive it instead.'
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
