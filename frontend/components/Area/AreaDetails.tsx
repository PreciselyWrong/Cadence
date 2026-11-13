import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Segmented from '../Shared/ui/Segmented';
import PageShell, { PAGE_GUTTER } from '../Shared/ui/PageShell';
import EmptyState from '../Shared/ui/EmptyState';
import { useStore } from '../../store/useStore';
import { Area } from '../../entities/Area';
import { Goal } from '../../entities/Goal';
import { Project } from '../../entities/Project';
import { Task } from '../../entities/Task';
import { fetchTasks } from '../../utils/tasksService';
import { fetchProjects } from '../../utils/projectsService';
import { updateArea } from '../../utils/areasService';
import { updateGoal } from '../../utils/goalsService';
import RoadmapChart from '../Roadmap/RoadmapChart';
import AreaModal from './AreaModal';
import AreaHero from './AreaHero';
import GoalRow from '../Goal/GoalRow';
import TaskList from '../Task/TaskList';
import ProjectItem from '../Project/ProjectItem';
import useProjectCardActions from '../Project/useProjectCardActions';
import ShareModal from '../Shared/ShareModal';
import ConfirmDialog from '../Shared/ConfirmDialog';
import { useToast } from '../Shared/ToastContext';
import { leaveShare } from '../../utils/sharesService';
import { TASK_SHEET_CLASS } from '../Task/taskSheet';
import { isProjectLive } from '../../utils/projectStatus';

type AreaTab = 'projects' | 'goals' | 'tasks' | 'timeline';

const AreaDetails: React.FC = () => {
    const { t } = useTranslation();
    const { uidSlug } = useParams<{ uidSlug: string }>();
    const navigate = useNavigate();
    const { showSuccessToast, showErrorToast } = useToast();

    const areasStore = useStore((state: any) => state.areasStore);
    const projectsStore = useStore((state: any) => state.projectsStore);
    const tasksStore = useStore((state: any) => state.tasksStore);
    const goalsStore = useStore((state: any) => state.goalsStore);

    const [area, setArea] = useState<Area | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [areaTasks, setAreaTasks] = useState<Task[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<AreaTab>('projects');
    const [showFinished, setShowFinished] = useState(false);

    const areaUid = uidSlug?.split('-')[0] || '';

    useEffect(() => {
        if (!areasStore.isLoading && areasStore.areas.length === 0) {
            areasStore.loadAreas();
        }
    }, [areasStore]);

    useEffect(() => {
        if (!projectsStore.hasLoaded && !projectsStore.isLoading) {
            projectsStore.loadProjects();
        }
    }, [projectsStore]);

    useEffect(() => {
        if (!goalsStore.hasLoaded && !goalsStore.isLoading) {
            goalsStore.loadGoals();
        }
    }, [goalsStore]);

    useEffect(() => {
        if (!areaUid) {
            setIsError(true);
            setIsLoading(false);
            return;
        }
        const found = areasStore.areas.find((a: Area) => a.uid === areaUid);
        if (found) {
            setArea(found);
            setIsError(false);
        } else if (!areasStore.isLoading && areasStore.areas.length > 0) {
            setIsError(true);
        }
        setIsLoading(areasStore.isLoading && !found);
    }, [areaUid, areasStore.areas, areasStore.isLoading]);

    const loadAreaTasks = useCallback(async () => {
        if (!area?.uid) return;
        setLoadingTasks(true);
        try {
            const result = await fetchTasks(
                `?area_uid=${area.uid}&type=all&status=all`
            );
            setAreaTasks(result.tasks || []);
        } catch {
            setAreaTasks([]);
        } finally {
            setLoadingTasks(false);
        }
    }, [area?.uid]);

    useEffect(() => {
        if (area?.uid) loadAreaTasks();
    }, [area?.uid, loadAreaTasks]);

    // Reloads the full project list and keeps the global store in step.
    const refreshProjects = async () => {
        const list = await fetchProjects('all', '');
        useStore.getState().projectsStore.setProjects(list);
    };

    const { cardActions, modals: projectModals } = useProjectCardActions(() =>
        refreshProjects()
    );

    const areaProjects: Project[] = projectsStore.projects.filter(
        (p: Project) => {
            const projectArea = p.area || (p as any).Area;
            return projectArea?.uid === areaUid;
        }
    );

    // Closed and stashed projects fold away below the ones still going
    const isFinished = (p: Project) => !isProjectLive(p.status);
    const openProjects = areaProjects.filter((p) => !isFinished(p));
    const finishedProjects = areaProjects.filter(isFinished);
    const renderProjectCard = (project: Project) => (
        <ProjectItem
            key={project.id}
            project={project}
            viewMode="list"
            {...cardActions}
        />
    );

    const areaGoals: Goal[] = goalsStore.goals.filter(
        (g: Goal) =>
            g.Area?.uid === areaUid || (area && g.area_id === (area as any).id)
    );

    const handleRemoveGoalFromArea = async (goal: Goal) => {
        if (!goal.uid) return;
        try {
            const result = await updateGoal(goal.uid, { area_id: null });
            goalsStore.setGoals(
                goalsStore.goals.map((g: Goal) =>
                    g.uid === result.goal.uid ? result.goal : g
                )
            );
        } catch {
            // silently ignore
        }
    };

    const handleTaskUpdate = async (updatedTask: Task) => {
        setAreaTasks((prev) =>
            prev.map((t) => (t.uid === updatedTask.uid ? updatedTask : t))
        );
        tasksStore.setTasks(
            tasksStore.tasks.map((t: Task) =>
                t.uid === updatedTask.uid ? updatedTask : t
            )
        );
    };

    const handleTaskDelete = (taskUid: string) => {
        setAreaTasks((prev) => prev.filter((t) => t.uid !== taskUid));
        tasksStore.setTasks(
            tasksStore.tasks.filter((t: Task) => t.uid !== taskUid)
        );
    };

    const handleAreaSave = async (areaData: Partial<Area>) => {
        if (!area?.uid) return;
        const result = await updateArea(area.uid, {
            name: areaData.name,
            description: areaData.description,
            color: areaData.color,
        });
        // The update answer has no can_leave, so keep what the list knew
        areasStore.setAreas(
            areasStore.areas.map((a: Area) =>
                a.uid === result.uid ? { ...a, ...result } : a
            )
        );
        setArea({ ...area, ...result });
        setIsEditModalOpen(false);
        const slug = result.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        navigate(`/area/${result.uid}-${slug}`, { replace: true });
    };

    // The viewer gives up an area shared with them, and with it the projects
    // it brought along
    const handleLeaveArea = async () => {
        setIsLeaveConfirmOpen(false);
        if (!area?.uid) return;
        try {
            await leaveShare('area', area.uid);
        } catch {
            showErrorToast(
                t('shares.leave.failed', 'Could not leave. Please try again.')
            );
            return;
        }
        areasStore.setAreas(
            areasStore.areas.filter((a: Area) => a.uid !== area.uid)
        );
        refreshProjects().catch(() => undefined);
        showSuccessToast(
            t('shares.leave.left', 'You left "{{name}}"', { name: area.name })
        );
        navigate('/areas');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-600 dark:text-gray-300">
                {t('areas.loading', 'Loading…')}
            </div>
        );
    }

    if (isError || !area) {
        return <EmptyState title={t('areas.notFound', 'Area not found')} />;
    }

    const activeTasks = areaTasks.filter(
        (t) =>
            t.status !== 'done' &&
            t.status !== 2 &&
            t.status !== 'archived' &&
            t.status !== 3
    );
    const completedTasks = areaTasks.filter(
        (t) => t.status === 'done' || t.status === 2
    );

    return (
        <PageShell template="board">
            <AreaHero
                area={area}
                t={t}
                doneCount={completedTasks.length}
                totalCount={areaTasks.length}
                onShareClick={() => setIsShareModalOpen(true)}
                onEditClick={() => setIsEditModalOpen(true)}
                onLeaveClick={() => setIsLeaveConfirmOpen(true)}
            />

            <div className={`mb-4 ${PAGE_GUTTER}`}>
                <Segmented
                    selected={activeTab}
                    onSelect={(id) => setActiveTab(id as AreaTab)}
                    options={[
                        {
                            id: 'projects',
                            label: t('projects.title', 'Projects'),
                            count: areaProjects.length,
                        },
                        {
                            id: 'goals',
                            label: t('goals.title', 'Goals'),
                            count: areaGoals.length,
                        },
                        {
                            id: 'tasks',
                            label: t('areas.tasksInArea', 'Tasks'),
                            count: areaTasks.length,
                        },
                        {
                            id: 'timeline',
                            label: t('projectTimeline.title', 'Timeline'),
                        },
                    ]}
                />
            </div>

            {activeTab === 'timeline' && <RoadmapChart areaUid={area.uid} />}

            {activeTab === 'projects' &&
                (areaProjects.length === 0 ? (
                    <EmptyState
                        title={t(
                            'areas.noProjects',
                            'No projects in this area.'
                        )}
                    />
                ) : (
                    <div className={`space-y-6 ${PAGE_GUTTER}`}>
                        {openProjects.length > 0 && (
                            <div role="list" className="-mx-3">
                                {openProjects.map(renderProjectCard)}
                            </div>
                        )}
                        {finishedProjects.length > 0 && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowFinished((value) => !value)
                                    }
                                    className="inline-flex items-center gap-1 px-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200"
                                    aria-expanded={showFinished}
                                    data-testid="area-finished-projects-toggle"
                                >
                                    <ChevronRightIcon
                                        className={`h-4 w-4 transition-transform ${showFinished ? 'rotate-90' : ''}`}
                                    />
                                    {t(
                                        'areas.finishedProjects',
                                        'Finished ({{count}})',
                                        { count: finishedProjects.length }
                                    )}
                                </button>
                                {showFinished && (
                                    <div
                                        role="list"
                                        className="-mx-3 mt-2 opacity-80"
                                    >
                                        {finishedProjects.map(
                                            renderProjectCard
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

            {activeTab === 'goals' &&
                (areaGoals.length === 0 ? (
                    <EmptyState
                        title={t(
                            'goals.noGoalsInArea',
                            'No goals linked to this area.'
                        )}
                    />
                ) : (
                    <div
                        className={`task-list-container overflow-visible ${TASK_SHEET_CLASS} task-sheet-rails ${PAGE_GUTTER}`}
                    >
                        {areaGoals.map((goal) => (
                            <div key={goal.uid}>
                                <GoalRow
                                    goal={goal}
                                    onRemoveFromArea={handleRemoveGoalFromArea}
                                />
                            </div>
                        ))}
                    </div>
                ))}

            {activeTab === 'tasks' &&
                (loadingTasks ? (
                    <div
                        className={`${PAGE_GUTTER} text-body-m text-surface-on-variant`}
                    >
                        {t('loading.tasks', 'Loading tasks…')}
                    </div>
                ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
                    <EmptyState
                        title={t(
                            'areas.noTasks',
                            'No tasks directly in this area'
                        )}
                    />
                ) : (
                    <div className={`space-y-6 ${PAGE_GUTTER}`}>
                        {activeTasks.length > 0 && (
                            <TaskList
                                tasks={activeTasks}
                                projects={projectsStore.projects}
                                onTaskUpdate={handleTaskUpdate}
                                onTaskDelete={handleTaskDelete}
                                hideAreaName
                            />
                        )}
                        {completedTasks.length > 0 && (
                            <div>
                                <h3 className="mb-3 px-2 text-body-m font-medium text-surface-on-variant">
                                    {t('tasks.completed', 'Completed')}
                                    <span className="ml-2 tabular-nums">
                                        {completedTasks.length}
                                    </span>
                                </h3>
                                <TaskList
                                    tasks={completedTasks}
                                    projects={projectsStore.projects}
                                    onTaskUpdate={handleTaskUpdate}
                                    onTaskDelete={handleTaskDelete}
                                    hideAreaName
                                    showCompletedTasks={true}
                                />
                            </div>
                        )}
                    </div>
                ))}

            {projectModals}

            {isEditModalOpen && (
                <AreaModal
                    isOpen={isEditModalOpen}
                    area={area}
                    onSave={handleAreaSave}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                resourceType="area"
                resourceUid={area.uid || null}
                resourceName={area.name}
            />

            {isLeaveConfirmOpen && (
                <ConfirmDialog
                    title={t('shares.leave.areaTitle', 'Leave area')}
                    message={t(
                        'shares.leave.areaMessage',
                        'You will no longer see "{{name}}" or the projects shared with it, and your open tasks there will be unassigned. The person who shared it will be told.',
                        { name: area.name }
                    )}
                    onConfirm={handleLeaveArea}
                    onCancel={() => setIsLeaveConfirmOpen(false)}
                    confirmButtonText={t('shares.leave.action', 'Leave')}
                />
            )}
        </PageShell>
    );
};

export default AreaDetails;
