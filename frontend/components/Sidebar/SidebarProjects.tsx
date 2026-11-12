import React, { useEffect } from 'react';
import { Location } from 'react-router-dom';
import {
    FolderIcon,
    ChevronRightIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { useCan } from '../../hooks/useCan';
import { Project } from '../../entities/Project';
import { useSidebarSectionExpanded } from '../../hooks/useSidebarSectionExpanded';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { useSidebarSectionBadge } from '../../hooks/useSidebarSectionBadge';
import { flattenProjectTree, foldProjectTree } from '../../utils/projectTree';
import { useFoldedProjects } from '../../hooks/useFoldedProjects';
import {
    DROP_HIGHLIGHT_CLASS,
    dropTargetAttrs,
    useDropHover,
    useSidebarDrop,
} from './sidebarDrop';
import EntityIcon from '../Shared/EntityIcon';
import { isProjectLive } from '../../utils/projectStatus';
import { SidebarPinButton, useProjectPin } from './sidebarPins';

interface SidebarProjectsProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    isDarkMode: boolean;
    openProjectModal: () => void;
}

export const getProjectPath = (project: Project) => {
    const slug = project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `/project/${project.uid}-${slug}`;
};

const SidebarProjects: React.FC<SidebarProjectsProps> = ({
    handleNavClick,
    location,
    openProjectModal,
}) => {
    const { t } = useTranslation();
    const canCreateProjects = useCan('create_projects');
    const [isExpanded, setIsExpanded] = useSidebarSectionExpanded('projects');

    const showBadge = useSidebarSectionBadge('projects');

    const projects = useStore((state) => state.projectsStore.projects);
    const hasLoaded = useStore((state) => state.projectsStore.hasLoaded);
    const loadProjects = useStore((state) => state.projectsStore.loadProjects);

    useEffect(() => {
        if (!hasLoaded) {
            loadProjects();
        }
    }, [hasLoaded, loadProjects]);

    const activeProjects = projects.filter((p) => isProjectLive(p.status));
    const pinProject = useProjectPin();
    const [foldedProjects, toggleFold] = useFoldedProjects();
    const openProjectUid = activeProjects.find(
        (p) => getProjectPath(p) === location.pathname
    )?.uid;

    useEffect(() => {
        if (
            activeProjects.some((p) => getProjectPath(p) === location.pathname)
        ) {
            setIsExpanded(true);
        }
    }, [location.pathname, activeProjects.length]);

    const isActive = (path: string) => location.pathname === path;

    const isMinimal = useIsMinimal();
    const rowSize = isMinimal
        ? 'py-[7px] text-[14px]'
        : 'py-[4px] text-[13.5px]';

    // A row takes tasks and notes dragged onto it, and drags onto an area.
    const isDropHover = useDropHover();
    const { nativeSource } = useSidebarDrop();

    const itemClass = (path: string, projectUid?: string) =>
        `group relative flex justify-between items-center rounded-[8px] pl-[30px] pr-[10px] ${rowSize} cursor-pointer text-gray-600 dark:text-[oklch(82%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800 ${
            isActive(path) ? 'bg-gray-100 dark:bg-gray-800' : ''
        } ${isDropHover('project', projectUid) ? DROP_HIGHLIGHT_CLASS : ''}`;

    const navigate = (project: Project) =>
        handleNavClick(
            getProjectPath(project),
            project.name,
            <FolderIcon className="h-4 w-4 mr-2" />
        );

    return (
        <ul className="flex flex-col">
            <li
                className={`group flex justify-between items-center px-[10px] py-[4px] rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 ${
                    location.pathname === '/projects'
                        ? 'bg-gray-100 dark:bg-white/5'
                        : ''
                }`}
                onClick={() => {
                    if (activeProjects.length > 0) setIsExpanded((v) => !v);
                }}
            >
                <span
                    className={`flex items-center gap-[6px] text-[12px] tracking-[0.01em] font-semibold uppercase cursor-pointer hover:text-black dark:hover:text-white ${
                        location.pathname === '/projects'
                            ? 'text-black dark:text-white'
                            : 'text-gray-500 dark:text-gray-300'
                    }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleNavClick(
                            '/projects',
                            t('sidebar.projects'),
                            <FolderIcon className="h-4 w-4 mr-2" />
                        );
                    }}
                >
                    <FolderIcon className="h-[14px] w-[14px]" />
                    {t('sidebar.projects')}
                </span>
                <div className="flex items-center gap-1">
                    {canCreateProjects && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openProjectModal();
                            }}
                            className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white "
                            aria-label={t('projects.addProject', 'Add Project')}
                            title={t('projects.addProject', 'Add Project')}
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {activeProjects.length > 0 && (
                        <>
                            {showBadge && (
                                <span className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
                                    {activeProjects.length}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded((v) => !v);
                                }}
                                aria-expanded={isExpanded}
                                aria-label={t(
                                    'sidebar.toggleSection',
                                    'Expand or collapse'
                                )}
                                className="p-2 -m-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white "
                            >
                                <ChevronRightIcon
                                    className="h-3 w-3 transition-transform duration-150"
                                    style={{
                                        transform: isExpanded
                                            ? 'rotate(90deg)'
                                            : 'none',
                                    }}
                                />
                            </button>
                        </>
                    )}
                </div>
            </li>

            {isExpanded && (
                <li className="p-0 list-none">
                    <div className="overflow-x-hidden flex flex-col gap-0.5 mb-1.5">
                        {foldProjectTree(
                            flattenProjectTree(activeProjects),
                            foldedProjects,
                            openProjectUid
                        ).map(({ project, depth, hasChildren, folded }) => (
                            <div
                                key={project.uid}
                                {...dropTargetAttrs(
                                    'project',
                                    project.uid as string
                                )}
                                {...nativeSource({
                                    kind: 'project',
                                    project,
                                })}
                                className={itemClass(
                                    getProjectPath(project),
                                    project.uid
                                )}
                                // A margin on a full-width row pushed
                                // nested rows past the list and clipped
                                // them; shrink the row by the indent.
                                style={
                                    depth > 0
                                        ? {
                                              marginLeft: depth * 12,
                                              width: `calc(100% - ${depth * 12}px)`,
                                          }
                                        : undefined
                                }
                                onClick={() => navigate(project)}
                            >
                                {hasChildren && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFold(project.uid as string);
                                        }}
                                        aria-expanded={!folded}
                                        aria-label={
                                            folded
                                                ? t(
                                                      'sidebar.unfoldProject',
                                                      'Unfold {{name}}',
                                                      { name: project.name }
                                                  )
                                                : t(
                                                      'sidebar.foldProject',
                                                      'Fold {{name}}',
                                                      { name: project.name }
                                                  )
                                        }
                                        className="absolute left-[8px] top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:text-black hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700"
                                    >
                                        <ChevronRightIcon
                                            className="h-3 w-3 transition-transform duration-150"
                                            style={{
                                                transform: folded
                                                    ? 'none'
                                                    : 'rotate(90deg)',
                                            }}
                                        />
                                    </button>
                                )}
                                <EntityIcon
                                    icon={project.icon}
                                    className="mr-1.5 h-[15px] w-[15px] text-gray-500 dark:text-gray-400"
                                />
                                <span className="truncate min-w-0 flex-1">
                                    {project.name}
                                </span>
                                <SidebarPinButton
                                    name={project.name}
                                    pinned={!!project.pin_to_sidebar}
                                    onToggle={(pinned) =>
                                        pinProject(project, pinned)
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </li>
            )}
        </ul>
    );
};

export default SidebarProjects;
