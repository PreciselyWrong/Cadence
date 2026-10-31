import React, { useEffect, useState } from 'react';
import {
    FolderIcon,
    Squares2X2Icon,
    ChevronRightIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { Location } from 'react-router-dom';
import { Area } from '../../entities/Area';
import { useTranslation } from 'react-i18next';
import { useCan } from '../../hooks/useCan';
import { useIsMinimal } from '../../hooks/useUiDensity';
import { useSidebarSectionBadge } from '../../hooks/useSidebarSectionBadge';
import { useSidebarSectionExpanded } from '../../hooks/useSidebarSectionExpanded';
import { useStore } from '../../store/useStore';
import { flattenProjectTree } from '../../utils/projectTree';
import { getProjectPath } from './SidebarProjects';
import {
    DROP_HIGHLIGHT_CLASS,
    dropTargetAttrs,
    useDropHover,
    useSidebarDrop,
} from './sidebarDrop';
import { isProjectLive } from '../../utils/projectStatus';

interface SidebarAreasProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    isDarkMode: boolean;
    openAreaModal: (area: Area | null) => void;
    areas: Area[];
}

const getAreaPath = (area: Area) => {
    const slug = area.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `/area/${area.uid}-${slug}`;
};

const SidebarAreas: React.FC<SidebarAreasProps> = ({
    handleNavClick,
    location,
    openAreaModal,
    areas,
}) => {
    const { t } = useTranslation();
    const canCreateAreas = useCan('create_projects');
    const [isExpanded, setIsExpanded] = useSidebarSectionExpanded('areas');

    useEffect(() => {
        if (areas.some((area) => getAreaPath(area) === location.pathname)) {
            setIsExpanded(true);
        }
    }, [location.pathname, areas.length]);

    const isAreasPageActive = location.pathname === '/areas';

    // Minimal shows each area as a folder that opens onto its projects.
    const isMinimal = useIsMinimal();
    const showBadge = useSidebarSectionBadge('areas');
    const projects = useStore((state) => state.projectsStore.projects);
    const hasLoadedProjects = useStore(
        (state) => state.projectsStore.hasLoaded
    );
    const loadProjects = useStore((state) => state.projectsStore.loadProjects);
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

    // An area row takes projects and tasks dragged onto it; a project row in
    // an open folder takes tasks and notes, and drags onto another area.
    const isDropHover = useDropHover();
    const { nativeSource } = useSidebarDrop();
    const highlight = (lit: boolean) => (lit ? DROP_HIGHLIGHT_CLASS : '');

    useEffect(() => {
        if (isMinimal && !hasLoadedProjects) loadProjects();
    }, [isMinimal, hasLoadedProjects, loadProjects]);

    const renderFolder = (area: Area) => {
        const folderOpen = openFolders[area.uid] === true;
        const areaProjects = flattenProjectTree(
            projects.filter(
                (p) =>
                    p.area_id === area.id && isProjectLive(p.status)
            )
        );
        return (
            <div key={area.uid}>
                <div
                    {...dropTargetAttrs('area', area.uid as string)}
                    className={`flex items-center gap-[4px] rounded-[8px] pl-[6px] pr-[10px] h-[34px] text-[14px] text-gray-700 dark:text-[oklch(82%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800 ${
                        location.pathname === getAreaPath(area)
                            ? 'bg-gray-100 dark:bg-gray-800'
                            : ''
                    } ${highlight(isDropHover('area', area.uid))}`}
                >
                    <button
                        type="button"
                        onClick={() =>
                            setOpenFolders((prev) => ({
                                ...prev,
                                [area.uid]: !folderOpen,
                            }))
                        }
                        aria-expanded={folderOpen}
                        aria-label={t(
                            'sidebar.toggleFolder',
                            'Show or hide projects'
                        )}
                        className="p-1 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white "
                    >
                        <ChevronRightIcon
                            className="h-3 w-3 transition-transform duration-150"
                            style={{
                                transform: folderOpen
                                    ? 'rotate(90deg)'
                                    : 'none',
                            }}
                        />
                    </button>
                    <span
                        className="flex-1 min-w-0 truncate cursor-pointer"
                        onClick={() => navigate(area)}
                    >
                        {area.name}
                    </span>
                </div>
                {folderOpen &&
                    areaProjects.map(({ project, depth }) => (
                        <div
                            key={project.uid}
                            {...dropTargetAttrs(
                                'project',
                                project.uid as string
                            )}
                            {...nativeSource({ kind: 'project', project })}
                            className={`flex items-center rounded-[8px] h-[34px] pr-[10px] text-[14px] cursor-pointer text-gray-600 dark:text-[oklch(82%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800 ${highlight(
                                isDropHover('project', project.uid)
                            )}`}
                            style={{ paddingLeft: 30 + depth * 12 }}
                            onClick={() =>
                                handleNavClick(
                                    getProjectPath(project),
                                    project.name,
                                    <FolderIcon className="h-4 w-4 mr-2" />
                                )
                            }
                        >
                            <span className="truncate min-w-0">
                                {project.name}
                            </span>
                        </div>
                    ))}
            </div>
        );
    };

    const itemClass = (path: string, areaUid?: string) =>
        `group flex justify-between items-center rounded-[8px] pl-[30px] pr-[10px] py-[4px] text-[13.5px] cursor-pointer text-gray-600 dark:text-[oklch(82%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800 ${
            location.pathname === path
                ? 'bg-gray-100 dark:bg-gray-800'
                : ''
        } ${highlight(isDropHover('area', areaUid))}`;

    const navigate = (area: Area) =>
        handleNavClick(
            getAreaPath(area),
            area.name,
            <Squares2X2Icon className="h-4 w-4 mr-2" />
        );

    return (
        <ul className="flex flex-col">
            <li
                className={`group flex justify-between items-center px-[10px] py-[4px] rounded-[8px] cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 ${
                    isAreasPageActive ? 'bg-gray-100 dark:bg-white/5' : ''
                }`}
                onClick={() => {
                    if (areas.length > 0) setIsExpanded((v) => !v);
                }}
            >
                <span
                    className={`flex items-center text-[12px] tracking-[0.01em] font-semibold uppercase hover:text-gray-900 dark:hover:text-white ${
                        isAreasPageActive
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-300'
                    }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleNavClick(
                            '/areas',
                            'Areas',
                            <Squares2X2Icon className="h-5 w-5 mr-2" />
                        );
                    }}
                >
                    <Squares2X2Icon className="h-[14px] w-[14px] mr-[6px] shrink-0" />
                    {t('sidebar.areas')}
                </span>
                <div className="flex items-center gap-1">
                    {canCreateAreas && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openAreaModal(null);
                            }}
                            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white "
                            aria-label={t('areas.addArea', 'Add Area')}
                            title={t('areas.addArea', 'Add Area')}
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {areas.length > 0 && (
                        <>
                            {showBadge && (
                                <span className="text-[12px] text-gray-500 dark:text-gray-400 tabular-nums">
                                    {areas.length}
                                </span>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded((v) => !v);
                                }}
                                aria-expanded={isExpanded}
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
                    <div className="max-h-[168px] overflow-y-auto overscroll-y-contain flex flex-col gap-0.5 mb-1.5">
                        {areas.map((area) =>
                            isMinimal ? (
                                renderFolder(area)
                            ) : (
                                <div
                                    key={area.uid}
                                    {...dropTargetAttrs(
                                        'area',
                                        area.uid as string
                                    )}
                                    className={itemClass(
                                        getAreaPath(area),
                                        area.uid
                                    )}
                                    onClick={() => navigate(area)}
                                >
                                    <span className="truncate min-w-0">
                                        {area.name}
                                    </span>
                                </div>
                            )
                        )}
                    </div>
                </li>
            )}
        </ul>
    );
};

export default SidebarAreas;
