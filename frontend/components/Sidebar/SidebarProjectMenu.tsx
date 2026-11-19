import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { Project } from '../../entities/Project';
import useProjectCardActions from '../Project/useProjectCardActions';
import { ContextMenu, MenuEntry } from '../Shared/ui/Menu';
import { useProjectPin } from './sidebarPins';

export interface ProjectMenuTarget {
    project: Project;
    x: number;
    y: number;
}

interface SidebarProjectMenuProps {
    // A new object for each right click, so the menu opens again.
    target: ProjectMenuTarget;
    onOpen: (project: Project) => void;
}

// The menu of a sidebar project, with the same Edit and Delete dialogs as
// the project cards. It stays mounted after the menu closes, because Edit
// and Delete open a dialog that must outlive the menu panel.
const SidebarProjectMenu: React.FC<SidebarProjectMenuProps> = ({
    target,
    onOpen,
}) => {
    const { t } = useTranslation();
    const loadProjects = useStore((state) => state.projectsStore.loadProjects);
    const { cardActions, modals } = useProjectCardActions(loadProjects);
    const pinProject = useProjectPin();
    const [open, setOpen] = useState(true);
    useEffect(() => setOpen(true), [target]);

    const { project } = target;
    const entries: MenuEntry[] = [
        {
            key: 'open',
            label: t('common.open', 'Open'),
            onSelect: () => onOpen(project),
        },
        ...(project.pin_to_sidebar
            ? [
                  {
                      key: 'unpin',
                      label: t(
                          'projectItem.unpinFromSidebar',
                          'Unpin from sidebar'
                      ),
                      onSelect: () => pinProject(project, false),
                  },
              ]
            : []),
        {
            key: 'edit',
            label: t('projectItem.edit', 'Edit'),
            onSelect: () => cardActions.handleEditProject(project),
        },
        'separator',
        {
            key: 'delete',
            label: t('common.delete', 'Delete'),
            danger: true,
            onSelect: () => {
                cardActions.setProjectToDelete(project);
                cardActions.setIsConfirmDialogOpen(true);
            },
        },
    ];

    return (
        <>
            {open && (
                <ContextMenu
                    entries={entries}
                    x={target.x}
                    y={target.y}
                    onClose={() => setOpen(false)}
                    testId="sidebar-project-menu"
                />
            )}
            {createPortal(modals, document.body)}
        </>
    );
};

export default SidebarProjectMenu;
