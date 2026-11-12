import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Bars3Icon,
    MagnifyingGlassIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline';
import ConfirmDialog from './Shared/ConfirmDialog';
import PageShell from './Shared/ui/PageShell';
import Segmented from './Shared/ui/Segmented';
import ProjectModal from './Project/ProjectModal';
import FilterDropdown, { FilterOption } from './Shared/FilterDropdown';
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    DragMoveEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    rectSortingStrategy,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useStore } from '../store/useStore';
import {
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    reorderProjects,
} from '../utils/projectsService';
import { fetchAreas } from '../utils/areasService';
import { useTranslation } from 'react-i18next';
import { SortOption } from './Shared/SortFilterButton';

import { Project, ProjectStatus } from '../entities/Project';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    FunnelIcon,
    PlusIcon,
    RectangleStackIcon,
    ClockIcon,
    ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import ProjectItem from './Project/ProjectItem';
import DormantProjects from './Project/DormantProjects';
import BookmarksImportDialog from './Project/BookmarksImportDialog';
import SortableItem from './Shared/SortableItem';
import { useSidebarDrop } from './Sidebar/sidebarDrop';
import PageHeader from './Shared/ui/PageHeader';
import Button, { IconButton } from './Shared/ui/Button';
import SearchField from './Shared/ui/SearchField';
import ImportWizard from './Spreadsheet/ImportWizard';
import BlankSlate from './Shared/BlankSlate';
import { projectMatchesFocus, useFocus } from '../utils/focus';
import FocusEmptyHint from './Focus/FocusEmptyHint';
import { useCan } from '../hooks/useCan';
import {
    mergeVisibleOrder,
    resetSortableCursor,
    sortableCursorHandlers,
    swallowNextClick,
    useSortableSensors,
} from './Shared/sortableList';
import ProjectShareModal from './Project/ProjectShareModal';
import useCompleteProject, {
    countOpenTasks,
} from './Project/useCompleteProject';
import { useToast } from './Shared/ToastContext';
import { saveProjectAsTemplate } from '../utils/templatesService';
import { fetchProfile, updateUiSettings } from '../utils/profileService';
import { flattenProjectTree } from '../utils/projectTree';
import OverflowMenu from './Shared/OverflowMenu';
import SkeletonRows from './Shared/SkeletonRows';
import { isProjectInStash, isProjectLive } from '../utils/projectStatus';

// Custom order: projects without a position (new ones) come first, newest
// first, then the rest by the position the user dragged them to.
const compareCustomOrder = (a: Project, b: Project) => {
    const posA = a.sort_position ?? null;
    const posB = b.sort_position ?? null;
    if (posA === null || posB === null) {
        if (posA !== posB) return posA === null ? -1 : 1;
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdB - createdA;
    }
    return posA - posB;
};

const compareProjects = (a: Project, b: Project, orderBy: string) => {
    const [field, direction] = orderBy.split(':');
    if (field === 'custom') return compareCustomOrder(a, b);
    const isAsc = direction === 'asc';

    let valueA, valueB;

    switch (field) {
        case 'name':
            valueA = a.name?.toLowerCase() || '';
            valueB = b.name?.toLowerCase() || '';
            break;
        case 'due_date_at':
            valueA = a.due_date_at ? new Date(a.due_date_at).getTime() : 0;
            valueB = b.due_date_at ? new Date(b.due_date_at).getTime() : 0;
            break;
        case 'updated_at':
            valueA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            valueB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            break;
        case 'created_at':
        default:
            valueA = a.created_at ? new Date(a.created_at).getTime() : 0;
            valueB = b.created_at ? new Date(b.created_at).getTime() : 0;
            break;
    }

    if (valueA < valueB) return isAsc ? -1 : 1;
    if (valueA > valueB) return isAsc ? 1 : -1;
    return 0;
};

interface ProjectsListFilters {
    showSomeday: boolean;
    showCompleted: boolean;
}

const LIST_FILTERS_KEY = 'projectsListFilters';

const readCachedListFilters = (): ProjectsListFilters => {
    const defaults = { showSomeday: false, showCompleted: false };
    try {
        const cached = localStorage.getItem(LIST_FILTERS_KEY);
        if (cached) {
            const { showSomeday, showCompleted } = JSON.parse(cached);
            return {
                showSomeday: showSomeday === true,
                showCompleted: showCompleted === true,
            };
        }
        // Carry over the older someday-only toggle
        if (localStorage.getItem('projectsSomedayFilter') === '1') {
            return { ...defaults, showSomeday: true };
        }
    } catch {
        // ignore storage errors
    }
    return defaults;
};

const cacheListFilters = (filters: ProjectsListFilters) => {
    try {
        localStorage.setItem(LIST_FILTERS_KEY, JSON.stringify(filters));
    } catch {
        // ignore storage errors
    }
};

const Projects: React.FC = () => {
    const { t } = useTranslation();
    const focus = useFocus();
    const { showErrorToast, showSuccessToast } = useToast();
    const {
        areas,
        setAreas,
        setError: setAreasError,
    } = useStore((state) => state.areasStore);
    const {
        projects,
        setProjects,
        setError: setProjectsError,
    } = useStore((state) => state.projectsStore);
    const { isLoading, isError } = useStore((state) => state.projectsStore);
    const canCreateProjects = useCan('create_projects');
    const { requestComplete, completeDialog } = useCompleteProject();
    const templatesEnabled = useStore(
        (state) => state.userSettingsStore.templatesEnabled
    );

    // Try using a ref to avoid React state conflicts
    const modalStateRef = useRef({
        isOpen: false,
        projectToEdit: null as Project | null,
    });
    const [modalState, setModalState] = useState({
        isOpen: false,
        projectToEdit: null as Project | null,
    });
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(
        null
    );
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
        useState<boolean>(false);
    const [projectToSaveAsTemplate, setProjectToSaveAsTemplate] =
        useState<Project | null>(null);
    const [isTemplateConfirmOpen, setIsTemplateConfirmOpen] =
        useState<boolean>(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
    const [shareModal, setShareModal] = useState<{
        isOpen: boolean;
        project: Project | null;
    }>({ isOpen: false, project: null });
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
        const saved = localStorage.getItem('projectsViewMode');
        return saved === 'list' || saved === 'cards' ? saved : 'list';
    });
    const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
    const [orderBy, setOrderBy] = useState<string>(() => {
        const saved = localStorage.getItem('projectsSortOrder');
        // Most useful first: the projects touched last.
        return saved || 'updated_at:desc';
    });

    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const statusFilter = searchParams.get('status') || 'not_completed';
    const [listFilters, setListFilters] = useState<ProjectsListFilters>(
        readCachedListFilters
    );
    const somedayFilter = listFilters.showSomeday;
    const completedFilter = listFilters.showCompleted;

    // The saved settings live on the user; the local copy only avoids a
    // flash of hidden projects before the profile loads.
    useEffect(() => {
        let cancelled = false;
        fetchProfile()
            .then((profile) => {
                const saved = profile.ui_settings?.project?.list;
                if (cancelled || !saved) return;
                setListFilters((current) => {
                    const next = {
                        showSomeday:
                            typeof saved.showSomeday === 'boolean'
                                ? saved.showSomeday
                                : current.showSomeday,
                        showCompleted:
                            typeof saved.showCompleted === 'boolean'
                                ? saved.showCompleted
                                : current.showCompleted,
                    };
                    cacheListFilters(next);
                    return next;
                });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const handleListFiltersChange = (next: ProjectsListFilters) => {
        setListFilters(next);
        cacheListFilters(next);
        updateUiSettings({ project: { list: next } }).catch((error) => {
            console.error('Error saving projects settings:', error);
            showErrorToast(
                t(
                    'projects.listSettings.saveError',
                    'Failed to save projects settings'
                )
            );
        });
    };

    // Restore persisted filters from localStorage on first mount (URL params take precedence)
    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        let changed = false;

        if (!params.has('status')) {
            const saved = localStorage.getItem('projectsStatusFilter');
            if (saved && saved !== 'not_completed') {
                params.set('status', saved);
                changed = true;
            }
        }

        if (!params.has('area')) {
            const saved = localStorage.getItem('projectsAreaFilter');
            if (saved) {
                params.set('area', saved);
                changed = true;
            }
        }

        if (changed) {
            setSearchParams(params, { replace: true });
        }
    }, []);

    // Get area UID from URL parameters
    const getAreaUidFromParams = () => {
        const areaParam = searchParams.get('area');

        if (areaParam) {
            // Extract area UID from the area parameter (format: uid-name-slug or just uid)
            return areaParam.split('-')[0];
        }

        return '';
    };

    // Sort options for the filter button
    const sortOptions: SortOption[] = [
        { value: 'created_at:desc', label: t('sort.created_at', 'Created At') },
        { value: 'name:asc', label: t('sort.name', 'Name') },
        { value: 'due_date_at:asc', label: t('sort.due_date', 'Due Date') },
        { value: 'updated_at:desc', label: t('common.updated', 'Updated') },
        { value: 'custom:asc', label: t('sort.custom', 'Custom') },
    ];
    const isCustomOrder = orderBy.startsWith('custom:');
    const liveProjectCount = projects.filter((p) =>
        isProjectLive(p.status)
    ).length;
    const stashProjectCount = projects.filter((p) =>
        isProjectInStash(p.status)
    ).length;
    const sensors = useSortableSensors();
    // A card dragged onto a sidebar area is filed there.
    const sidebarDrop = useSidebarDrop();
    const sidebarItem = (id: unknown) => {
        const project = projects.find((p) => p.uid === id);
        return project ? ({ kind: 'project', project } as const) : null;
    };

    // Filter options for dropdowns
    const statusOptions: FilterOption[] = [
        { value: 'all', label: t('projects.filters.all') },
        {
            value: 'not_started',
            label: t('projectStatus.not_started', 'Not Started'),
        },
        { value: 'planned', label: t('projectStatus.planned', 'Planned') },
        {
            value: 'in_progress',
            label: t('projectStatus.in_progress', 'In Progress'),
        },
        { value: 'waiting', label: t('projectStatus.waiting', 'Waiting') },
        { value: 'done', label: t('projectStatus.done', 'Completed') },
        { value: 'paused', label: t('projectStatus.paused', 'Paused') },
        {
            value: 'cancelled',
            label: t('projectStatus.cancelled', 'Abandoned'),
        },
        { value: 'archived', label: t('projectStatus.archived', 'Archived') },
        { value: 'divider', label: '' },
        {
            value: 'not_completed',
            label: t('projects.filters.active', 'Active'),
        },
        { value: 'shared', label: t('projects.filters.shared', 'Shared') },
    ];

    const areaOptions: FilterOption[] = [
        { value: '', label: t('projects.filters.allAreas') },
        ...areas.map((area) => ({
            value: area.uid,
            label: area.name,
        })),
    ];

    useEffect(() => {
        const loadAreas = async () => {
            try {
                const areasData = await fetchAreas();
                setAreas(areasData);
            } catch (error) {
                console.error('Failed to fetch areas:', error);
                setAreasError(true);
            }
        };

        loadAreas();
    }, []);

    // Persist viewMode to localStorage
    useEffect(() => {
        localStorage.setItem('projectsViewMode', viewMode);
    }, [viewMode]);

    // Projects are now loaded by Layout component into global store

    // Modal state tracking removed after fixing the issue

    // Handle click outside to close dropdown and escape key
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeDropdown === null) return;

            const target = event.target as Element;

            // Check if clicking inside any dropdown container
            const isInsideDropdown = target.closest('.dropdown-container');

            if (!isInsideDropdown) {
                setActiveDropdown(null);
            }
        };

        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && activeDropdown !== null) {
                setActiveDropdown(null);
            }
        };

        if (activeDropdown !== null) {
            document.addEventListener('click', handleClickOutside, true);
            document.addEventListener('keydown', handleEscapeKey);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside, true);
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [activeDropdown]);

    // Persist sort order to localStorage
    useEffect(() => {
        localStorage.setItem('projectsSortOrder', orderBy);
    }, [orderBy]);

    // Handle sort change
    const handleSortChange = (newOrderBy: string) => {
        setOrderBy(newOrderBy);
    };

    const handleSaveProject = async (project: Project) => {
        try {
            if (project.uid) {
                await updateProject(project.uid, project);
            } else {
                await createProject(project);
            }
            // Fetch all projects without filters to keep global store complete
            const projectsData = await fetchProjects('all', '');
            setProjects(projectsData);
        } catch (error) {
            console.error('Error saving project:', error);
            setProjectsError(true);
        } finally {
            setModalState({ isOpen: false, projectToEdit: null });
        }
    };

    const handleNewProject = () => {
        modalStateRef.current = { isOpen: true, projectToEdit: null };
        setModalState({ isOpen: true, projectToEdit: null });
    };

    // Clears every filter that can hide a project, including search.
    const handleShowAllProjects = () => {
        const params = new URLSearchParams(searchParams);
        params.set('status', 'all');
        params.delete('area');
        localStorage.setItem('projectsStatusFilter', 'all');
        localStorage.setItem('projectsAreaFilter', '');
        setSearchParams(params);
        setSearchQuery('');
        if (!listFilters.showSomeday || !listFilters.showCompleted) {
            handleListFiltersChange({ showSomeday: true, showCompleted: true });
        }
    };

    const handleEditProject = (project: Project) => {
        modalStateRef.current = {
            isOpen: true,
            projectToEdit: project,
        };
        setModalState({
            isOpen: true,
            projectToEdit: project,
        });
    };

    const handleSaveAsTemplate = (project: Project) => {
        setProjectToSaveAsTemplate(project);
        setIsTemplateConfirmOpen(true);
    };

    const handleConfirmSaveAsTemplate = async () => {
        if (!projectToSaveAsTemplate?.uid) return;
        try {
            await saveProjectAsTemplate(projectToSaveAsTemplate.uid, {
                name: projectToSaveAsTemplate.name,
            });
            showSuccessToast(
                t('projects.savedAsTemplate', '"{{name}}" saved as template.', {
                    name: projectToSaveAsTemplate.name,
                })
            );
        } catch {
            showErrorToast(
                t(
                    'projects.saveAsTemplateError',
                    'Failed to save project as template.'
                )
            );
        } finally {
            setIsTemplateConfirmOpen(false);
            setProjectToSaveAsTemplate(null);
        }
    };

    const handleDeleteProject = async () => {
        if (!projectToDelete) return;

        try {
            if (projectToDelete.uid !== undefined) {
                await deleteProject(projectToDelete.uid);

                // Fetch all projects without filters to keep global store complete
                const projectsData = await fetchProjects('all', '');
                setProjects(projectsData);
            } else {
                console.error('Cannot delete project: UID is undefined.');
            }
        } catch (error: any) {
            console.error('Error deleting project:', error);
            // Show permission denied if 403-like message, else generic
            const msg =
                typeof error?.message === 'string' &&
                /403|Forbidden|permission/i.test(error.message)
                    ? t('errors.permissionDenied', 'Permission denied')
                    : t('projects.deleteError', 'Failed to delete project');
            showErrorToast(msg);
        } finally {
            setIsConfirmDialogOpen(false);
            setProjectToDelete(null);
        }
    };

    const handleStatusChange = async (
        project: Project,
        newStatus: ProjectStatus
    ) => {
        if (!project.uid) return;
        if (newStatus === 'done' && project.status !== 'done') {
            requestComplete(project, countOpenTasks(project), async () => {
                setProjects(await fetchProjects('all', ''));
            });
            return;
        }
        const prevProjects = projects;
        setProjects(
            projects.map((p) =>
                p.uid === project.uid ? { ...p, status: newStatus } : p
            )
        );
        try {
            const saved = await updateProject(project.uid, {
                status: newStatus,
            });
            setProjects(
                useStore
                    .getState()
                    .projectsStore.projects.map((p) =>
                        p.uid === saved.uid
                            ? { ...p, completed_at: saved.completed_at }
                            : p
                    )
            );
        } catch (error) {
            console.error('Error updating project status:', error);
            setProjects(prevProjects);
            showErrorToast(
                t(
                    'errors.projectStatusUpdateFailed',
                    'Failed to update project status'
                )
            );
        }
    };

    const handleStatusFilterChange = (value: string) => {
        const params = new URLSearchParams(searchParams);

        if (value === 'not_completed') {
            params.delete('status');
        } else {
            params.set('status', value);
        }
        localStorage.setItem('projectsStatusFilter', value);
        setSearchParams(params);
    };

    const handleAreaFilterChange = (value: string) => {
        const params = new URLSearchParams(searchParams);

        params.delete('area');

        if (value !== '') {
            params.set('area', value);
        }
        localStorage.setItem('projectsAreaFilter', value);
        setSearchParams(params);
    };

    // Update the area filter when areas are loaded (to handle area UID lookups).
    // While a Focus names an area, the page is locked to it.
    const focusAreaUid = focus?.area_uid ?? '';
    const actualAreaFilter = useMemo(() => {
        return focusAreaUid || getAreaUidFromParams();
    }, [searchParams, areas, focusAreaUid]);

    // Filter, sort and search projects
    const displayProjects = useMemo(() => {
        let filteredProjects = [...projects];

        // Apply status filter
        if (statusFilter === 'not_completed') {
            filteredProjects = filteredProjects.filter((project) =>
                isProjectLive(project.status)
            );
        } else if (statusFilter === 'shared') {
            filteredProjects = filteredProjects.filter(
                (project) => project.is_shared
            );
        } else if (statusFilter !== 'all') {
            filteredProjects = filteredProjects.filter(
                (project) => project.status === statusFilter
            );
        }

        // Apply area filter by UID
        if (actualAreaFilter) {
            filteredProjects = filteredProjects.filter((project) => {
                const projectArea = project.area || (project as any).Area;
                return projectArea?.uid === actualAreaFilter;
            });
        }

        // A Focus project or tags narrow the list further (the area is
        // already applied above)
        if (focus && (focus.project_uid || focus.tags?.length)) {
            filteredProjects = filteredProjects.filter((project) =>
                projectMatchesFocus(project, {
                    project_uid: focus.project_uid,
                    tags: focus.tags,
                })
            );
        }

        // Hide someday-tagged projects unless the setting shows them
        if (!somedayFilter) {
            filteredProjects = filteredProjects.filter(
                (project) =>
                    !project.tags?.some(
                        (tag) => tag.name.toLowerCase() === 'someday'
                    )
            );
        }

        // Hide completed projects unless the setting shows them or the
        // status filter asks for them
        if (!completedFilter && statusFilter !== 'done') {
            filteredProjects = filteredProjects.filter(
                (project) => project.status !== 'done'
            );
        }

        // Archived projects only show when asked for
        if (statusFilter !== 'archived' && statusFilter !== 'all') {
            filteredProjects = filteredProjects.filter(
                (project) => project.status !== 'archived'
            );
        }

        // Apply search filter
        if (searchQuery.trim()) {
            filteredProjects = filteredProjects.filter(
                (project) =>
                    project.name
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                    (project.description &&
                        project.description
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()))
            );
        }

        // Apply sorting
        filteredProjects.sort((a, b) => compareProjects(a, b, orderBy));

        // The list shows sub-projects right under their parent
        if (viewMode === 'list') {
            return flattenProjectTree(filteredProjects).map(
                (node) => node.project
            );
        }
        return filteredProjects;
    }, [
        viewMode,
        projects,
        statusFilter,
        actualAreaFilter,
        focus,
        somedayFilter,
        completedFilter,
        searchQuery,
        orderBy,
    ]);

    const subProjectDepthByUid = useMemo(() => {
        if (viewMode !== 'list') return new Map<string, number>();
        return new Map(
            flattenProjectTree(displayProjects).map((node) => [
                node.project.uid as string,
                node.depth,
            ])
        );
    }, [viewMode, displayProjects]);

    const renderProjectRow = (project: Project) => {
        const depth = subProjectDepthByUid.get(project.uid as string) ?? 0;
        if (depth === 0) return renderProjectItem(project);
        return (
            <div style={{ paddingLeft: depth * 24 }}>
                {renderProjectItem(project)}
            </div>
        );
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        resetSortableCursor();
        if (sidebarDrop.dragEnd(event, sidebarItem(active.id))) return;
        if (!over || active.id === over.id) return;
        swallowNextClick();

        const visibleUids = displayProjects.map((p) => p.uid as string);
        const from = visibleUids.indexOf(active.id as string);
        const to = visibleUids.indexOf(over.id as string);
        if (from === -1 || to === -1) return;
        const movedVisible = arrayMove(visibleUids, from, to);

        const fullOrder = projects
            .filter((p) => p.uid)
            .sort((a, b) => compareProjects(a, b, orderBy))
            .map((p) => p.uid as string);
        const newOrder = mergeVisibleOrder(fullOrder, movedVisible);

        const positionByUid = new Map(newOrder.map((uid, i) => [uid, i]));
        const prevProjects = projects;
        setProjects(
            projects.map((p) =>
                p.uid && positionByUid.has(p.uid)
                    ? { ...p, sort_position: positionByUid.get(p.uid) }
                    : p
            )
        );
        // Dragging under another sort starts a custom order from what is
        // on screen.
        const prevOrderBy = orderBy;
        if (!isCustomOrder) setOrderBy('custom:asc');
        try {
            await reorderProjects(newOrder);
        } catch (error) {
            console.error('Error saving project order:', error);
            setProjects(prevProjects);
            setOrderBy(prevOrderBy);
            showErrorToast(
                t('projects.reorderError', 'Failed to save project order')
            );
        }
    };

    const renderProjectItem = (project: Project) => (
        <ProjectItem
            project={project}
            viewMode={viewMode}
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            handleEditProject={handleEditProject}
            setProjectToDelete={setProjectToDelete}
            setIsConfirmDialogOpen={setIsConfirmDialogOpen}
            onOpenShare={(p) => setShareModal({ isOpen: true, project: p })}
            onStatusChange={handleStatusChange}
            onSaveAsTemplate={
                templatesEnabled ? handleSaveAsTemplate : undefined
            }
        />
    );

    const projectsContainerClass =
        viewMode === 'cards'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'flex flex-col';

    if (isLoading) {
        return (
            <PageShell template="list">
                <PageHeader title={t('projects.title')} />
                <div className="px-3">
                    <SkeletonRows rows={7} />
                </div>
            </PageShell>
        );
    }

    if (isError) {
        return (
            <div className="p-8 text-body-m text-danger">
                {t('projects.error')}
            </div>
        );
    }

    return (
        // The cards grid takes a wider column than the list.
        <PageShell
            template={viewMode === 'list' ? 'list' : 'board'}
            className={viewMode === 'list' ? '' : 'mx-auto max-w-7xl'}
        >
            <PageHeader
                title={t('projects.title')}
                meta={
                    <>
                        {t('projects.counts.active', '{{n}} active', {
                            n: liveProjectCount,
                        })}
                        {stashProjectCount > 0 && (
                            <>
                                {' · '}
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleStatusFilterChange('paused')
                                    }
                                    className="underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                                >
                                    {t(
                                        'projects.counts.stash',
                                        '{{n}} in the stash',
                                        { n: stashProjectCount }
                                    )}
                                </button>
                            </>
                        )}
                    </>
                }
                actions={
                    <>
                        <IconButton
                            label={t('common.search', 'Search')}
                            active={isSearchExpanded}
                            aria-expanded={isSearchExpanded}
                            onClick={() => {
                                if (isSearchExpanded) setSearchQuery('');
                                setIsSearchExpanded(!isSearchExpanded);
                            }}
                        >
                            <MagnifyingGlassIcon />
                        </IconButton>
                        <Segmented
                            aria-label={t('projects.viewAs', 'View')}
                            selected={viewMode}
                            onSelect={(id) =>
                                setViewMode(id as 'cards' | 'list')
                            }
                            options={[
                                {
                                    id: 'list',
                                    label: t('projects.listViewAriaLabel'),
                                    icon: <Bars3Icon />,
                                    iconOnly: true,
                                },
                                {
                                    id: 'cards',
                                    label: t('projects.cardViewAriaLabel'),
                                    icon: <Squares2X2Icon />,
                                    iconOnly: true,
                                },
                            ]}
                        />
                        <OverflowMenu
                            label={t('common.moreActions', 'More actions')}
                            testId="projects-more-menu"
                            items={[
                                ...sortOptions.map((option) => ({
                                    key: `sort-${option.value}`,
                                    label: option.label,
                                    checked: orderBy === option.value,
                                    onClick: () =>
                                        handleSortChange(option.value),
                                    testId: `projects-sort-${option.value}`,
                                })),
                                {
                                    key: 'show-someday',
                                    label: t(
                                        'projects.listSettings.showSomeday',
                                        'Show someday projects'
                                    ),
                                    title: t(
                                        'projects.listSettings.showSomedayHint',
                                        'Projects tagged #someday.'
                                    ),
                                    checked: listFilters.showSomeday,
                                    onClick: () =>
                                        handleListFiltersChange({
                                            ...listFilters,
                                            showSomeday:
                                                !listFilters.showSomeday,
                                        }),
                                    testId: 'projects-show-someday',
                                },
                                {
                                    key: 'show-completed',
                                    label: t(
                                        'projects.listSettings.showCompleted',
                                        'Show completed projects'
                                    ),
                                    checked: listFilters.showCompleted,
                                    onClick: () =>
                                        handleListFiltersChange({
                                            ...listFilters,
                                            showCompleted:
                                                !listFilters.showCompleted,
                                        }),
                                    testId: 'projects-show-completed',
                                },
                                {
                                    key: 'history',
                                    label: t('projects.history', 'History'),
                                    title: t(
                                        'projects.historyHint',
                                        'Completed projects, newest first'
                                    ),
                                    icon: <ClockIcon className="h-4 w-4" />,
                                    to: '/projects/completed',
                                    testId: 'projects-history-link',
                                },
                                ...(templatesEnabled
                                    ? [
                                          {
                                              key: 'templates',
                                              label: t(
                                                  'projects.fromTemplate',
                                                  'From template'
                                              ),
                                              icon: (
                                                  <RectangleStackIcon className="h-4 w-4" />
                                              ),
                                              to: '/templates',
                                          },
                                      ]
                                    : []),
                                ...(canCreateProjects
                                    ? [
                                          {
                                              key: 'import',
                                              label: t(
                                                  'spreadsheet.menu.importShort',
                                                  'Import'
                                              ),
                                              icon: (
                                                  <ArrowUpTrayIcon className="h-4 w-4" />
                                              ),
                                              title: t(
                                                  'spreadsheet.menu.importHint',
                                                  'Import projects and tasks from Excel or CSV'
                                              ),
                                              onClick: () =>
                                                  setIsImportOpen(true),
                                              testId: 'projects-import-button',
                                          },
                                          {
                                              key: 'import-bookmarks',
                                              label: t(
                                                  'bookmarksImport.title',
                                                  'Import bookmarks'
                                              ),
                                              icon: (
                                                  <ArrowUpTrayIcon className="h-4 w-4" />
                                              ),
                                              onClick: () =>
                                                  setIsBookmarksOpen(true),
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                        {canCreateProjects && (
                            <Button
                                variant="primary"
                                icon={<PlusIcon className="h-4 w-4" />}
                                onClick={handleNewProject}
                                data-testid="new-project-button"
                            >
                                {t('projects.new', 'New Project')}
                            </Button>
                        )}
                    </>
                }
            >
                <div className="flex flex-wrap items-center gap-2">
                    <FilterDropdown
                        options={statusOptions}
                        value={statusFilter}
                        onChange={handleStatusFilterChange}
                        size="desktop"
                        autoWidth={true}
                        fill
                    />
                    {focusAreaUid ? (
                        <span
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            title={t(
                                'focus.locked',
                                'Set by your Focus. Clear it from the chip in the top bar.'
                            )}
                            data-testid="projects-area-locked"
                        >
                            {areas.find((area) => area.uid === focusAreaUid)
                                ?.name ?? t('focus.chip', 'Focus')}
                        </span>
                    ) : (
                        <FilterDropdown
                            options={areaOptions}
                            value={actualAreaFilter}
                            onChange={handleAreaFilterChange}
                            size="desktop"
                            autoWidth={true}
                            fill
                        />
                    )}
                    {isSearchExpanded && (
                        <SearchField
                            className="min-w-[12rem] flex-1"
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder={t('projects.searchPlaceholder')}
                        />
                    )}
                </div>
            </PageHeader>

            <div className="px-3 max-sm:px-1">
                {/* Projects Grid/List */}
                {displayProjects.length === 0 ? (
                    projects.length === 0 ? (
                        <BlankSlate
                            title={t(
                                'projects.noProjectsYet',
                                'No projects yet.'
                            )}
                            hint={t(
                                'projects.blankSlateHint',
                                'A project groups the tasks and notes that lead to one outcome, like planning a trip or launching a website. Keep them tidy by grouping them into areas like Work or Home.'
                            )}
                            actions={[
                                ...(canCreateProjects
                                    ? [
                                          {
                                              label: t(
                                                  'projects.blankSlateNew',
                                                  'Create your first project'
                                              ),
                                              icon: PlusIcon,
                                              onClick: handleNewProject,
                                          },
                                      ]
                                    : []),
                                ...(canCreateProjects && templatesEnabled
                                    ? [
                                          {
                                              label: t(
                                                  'projects.blankSlateTemplate',
                                                  'Start from a template'
                                              ),
                                              icon: RectangleStackIcon,
                                              to: '/templates',
                                          },
                                      ]
                                    : []),
                                {
                                    label: t(
                                        'projects.blankSlateAreas',
                                        'Set up areas'
                                    ),
                                    icon: Squares2X2Icon,
                                    to: '/areas',
                                },
                            ]}
                        />
                    ) : (
                        <>
                            <BlankSlate
                                title={t(
                                    'projects.noProjectsFound',
                                    'No projects found'
                                )}
                                hint={t(
                                    'projects.blankSlateFilteredHint',
                                    'Try changing your filters or search.'
                                )}
                                actions={[
                                    {
                                        label: t(
                                            'projects.blankSlateShowAll',
                                            'Show all projects'
                                        ),
                                        icon: FunnelIcon,
                                        onClick: handleShowAllProjects,
                                    },
                                    ...(canCreateProjects
                                        ? [
                                              {
                                                  label: t(
                                                      'projects.new',
                                                      'New Project'
                                                  ),
                                                  icon: PlusIcon,
                                                  onClick: handleNewProject,
                                              },
                                          ]
                                        : []),
                                ]}
                            />
                            <FocusEmptyHint className="mx-auto mt-4 max-w-md" />
                        </>
                    )
                ) : displayProjects.every((p) => p.uid) ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        {...sortableCursorHandlers}
                        onDragMove={(event: DragMoveEvent) =>
                            sidebarDrop.dragMove(
                                event,
                                sidebarItem(event.active.id)
                            )
                        }
                        onDragEnd={handleDragEnd}
                        onDragCancel={() => {
                            sortableCursorHandlers.onDragCancel();
                            sidebarDrop.dragCancel();
                        }}
                    >
                        <SortableContext
                            items={displayProjects.map((p) => p.uid as string)}
                            strategy={
                                viewMode === 'cards'
                                    ? rectSortingStrategy
                                    : verticalListSortingStrategy
                            }
                        >
                            <div role="list" className={projectsContainerClass}>
                                {displayProjects.map((project) => (
                                    <SortableItem
                                        key={project.id}
                                        id={project.uid as string}
                                        label={project.name}
                                        roleDescription={t(
                                            'sortable.project',
                                            'sortable project'
                                        )}
                                        testIdPrefix="sortable-project"
                                    >
                                        {renderProjectRow(project)}
                                    </SortableItem>
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                ) : (
                    <div role="list" className={projectsContainerClass}>
                        {displayProjects.map((project) => (
                            <React.Fragment key={project.id}>
                                {renderProjectRow(project)}
                            </React.Fragment>
                        ))}
                    </div>
                )}
                <DormantProjects />
            </div>

            {isBookmarksOpen && (
                <BookmarksImportDialog
                    projects={projects}
                    onClose={() => setIsBookmarksOpen(false)}
                    onDone={(projectUid) => {
                        setIsBookmarksOpen(false);
                        navigate(`/project/${projectUid}`);
                    }}
                />
            )}
            {modalState.isOpen && (
                <ProjectModal
                    isOpen={modalState.isOpen}
                    onClose={() => {
                        setModalState({ isOpen: false, projectToEdit: null });
                    }}
                    onSave={handleSaveProject}
                    onDelete={async (projectUid) => {
                        try {
                            await deleteProject(projectUid);

                            // Update both local and global state
                            const updatedProjects = projects.filter(
                                (p: Project) => p.uid !== projectUid
                            );
                            setProjects(updatedProjects);

                            setModalState({
                                isOpen: false,
                                projectToEdit: null,
                            });
                        } catch (error) {
                            console.error('Error deleting project:', error);
                        }
                    }}
                    project={modalState.projectToEdit || undefined}
                    areas={areas}
                    defaultAreaId={
                        areas.find((area) => area.uid === focusAreaUid)?.id ??
                        null
                    }
                />
            )}

            {isConfirmDialogOpen && (
                <ConfirmDialog
                    title={t('modals.deleteProject.title')}
                    message={t('modals.deleteProject.message', {
                        projectName: projectToDelete?.name,
                    })}
                    onConfirm={handleDeleteProject}
                    onCancel={() => setIsConfirmDialogOpen(false)}
                />
            )}

            {isTemplateConfirmOpen && (
                <ConfirmDialog
                    title={t('modals.saveAsTemplate.title', 'Save as Template')}
                    message={t(
                        'modals.saveAsTemplate.message',
                        'Save "{{name}}" as a template? This will create a reusable template based on this project.',
                        { name: projectToSaveAsTemplate?.name }
                    )}
                    onConfirm={handleConfirmSaveAsTemplate}
                    onCancel={() => {
                        setIsTemplateConfirmOpen(false);
                        setProjectToSaveAsTemplate(null);
                    }}
                    confirmButtonText={t('common.save', 'Save')}
                />
            )}

            {shareModal.isOpen && shareModal.project && (
                <ProjectShareModal
                    isOpen={shareModal.isOpen}
                    onClose={() =>
                        setShareModal({ isOpen: false, project: null })
                    }
                    project={shareModal.project}
                />
            )}

            {isImportOpen && (
                <ImportWizard
                    onClose={() => setIsImportOpen(false)}
                    onImported={async () =>
                        setProjects(await fetchProjects('all', ''))
                    }
                />
            )}

            {completeDialog}
        </PageShell>
    );
};

export default Projects;
