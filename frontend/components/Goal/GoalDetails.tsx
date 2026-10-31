import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Goal, GoalStatus } from '../../entities/Goal';
import { Task } from '../../entities/Task';
import { Project } from '../../entities/Project';
import {
    createGoal,
    fetchGoalByUid,
    deleteGoal,
    updateGoal,
} from '../../utils/goalsService';
import { fetchProjects } from '../../utils/projectsService';
import { createGoalUrl, extractUidFromSlug } from '../../utils/slugUtils';
import ConfirmDialog from '../Shared/ConfirmDialog';
import ShareModal from '../Shared/ShareModal';
import TaskList from '../Task/TaskList';
import ProjectItem from '../Project/ProjectItem';
import useProjectCardActions from '../Project/useProjectCardActions';
import { useStore } from '../../store/useStore';
import { useToast } from '../Shared/ToastContext';
import GoalModal from './GoalModal';
import GoalHero from './GoalHero';

const TASK_STATUS_DONE = [2, 3, 'done', 'archived'];

type GoalTab = 'tasks' | 'projects';

const GoalDetails: React.FC = () => {
    const { t } = useTranslation();
    const { uidSlug } = useParams<{ uidSlug: string }>();
    const navigate = useNavigate();
    const { showSuccessToast, showErrorToast } = useToast();

    const [goal, setGoal] = useState<Goal | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<GoalTab>('tasks');
    const [addingKeyResult, setAddingKeyResult] = useState(false);
    const [keyResultTitle, setKeyResultTitle] = useState('');
    // Full project records (completion, sharing) for the project cards, the
    // same data /projects shows. Goal.Projects only carries a few fields.
    const [projectCards, setProjectCards] = useState<Project[]>([]);

    const loadGoals = useStore((state: any) => state.goalsStore.loadGoals);
    const projects: Project[] = useStore(
        (state: any) => state.projectsStore.projects
    );

    useEffect(() => {
        const uid = extractUidFromSlug(uidSlug ?? '');
        if (!uid) {
            setError(t('goals.notFound', 'Goal not found'));
            setLoading(false);
            return;
        }

        fetchGoalByUid(uid)
            .then((data) => setGoal(data))
            .catch((err) =>
                setError(err?.message || t('goals.notFound', 'Goal not found'))
            )
            .finally(() => setLoading(false));
    }, [uidSlug, t]);

    useEffect(() => {
        fetchProjects('all', '')
            .then((list) => setProjectCards(list))
            .catch(() => undefined);
    }, []);

    const refreshProjects = async () => {
        const [list, refreshedGoal] = await Promise.all([
            fetchProjects('all', ''),
            goal?.uid ? fetchGoalByUid(goal.uid) : Promise.resolve(null),
        ]);
        setProjectCards(list);
        if (refreshedGoal) {
            setGoal((prev) =>
                prev ? { ...prev, ...refreshedGoal } : refreshedGoal
            );
        }
    };

    const { cardActions, modals: projectModals } = useProjectCardActions(() =>
        refreshProjects()
    );

    const handleDeleteGoal = async () => {
        if (!goal?.uid) return;
        try {
            await deleteGoal(goal.uid);
            loadGoals(true);
            showSuccessToast(t('success.goalDeleted', 'Goal deleted!'));
            navigate('/goals');
        } catch {
            showErrorToast(
                t('errors.failedToDeleteGoal', 'Failed to delete goal.')
            );
        }
        setIsConfirmDeleteOpen(false);
    };

    const handleGoalSaved = (saved: Goal) => {
        setGoal((prev) => (prev ? { ...prev, ...saved } : saved));
    };

    const handleStatusChange = async (status: GoalStatus) => {
        if (!goal?.uid) return;
        try {
            const { goal: updated } = await updateGoal(goal.uid, { status });
            handleGoalSaved(updated);
            loadGoals(true);
        } catch {
            showErrorToast(
                t('errors.failedToUpdateGoal', 'Failed to update goal.')
            );
        }
    };

    const handleAddKeyResult = async () => {
        const title = keyResultTitle.trim();
        if (!goal?.uid || !title) {
            setAddingKeyResult(false);
            return;
        }
        try {
            await createGoal({
                title,
                parent_goal_uid: goal.uid,
                horizon: goal.horizon,
                status: 'active',
            });
            const refreshed = await fetchGoalByUid(goal.uid);
            setGoal((prev) => (prev ? { ...prev, ...refreshed } : refreshed));
            loadGoals(true);
            setKeyResultTitle('');
            setAddingKeyResult(false);
        } catch {
            showErrorToast(
                t('errors.failedToSaveGoal', 'Failed to save goal.')
            );
        }
    };

    const handleTaskUpdate = async (updatedTask: Task) => {
        setGoal((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                Tasks: (prev.Tasks ?? []).map((t: any) =>
                    (t.uid ?? t.id) === (updatedTask.uid ?? updatedTask.id)
                        ? updatedTask
                        : t
                ),
            };
        });
    };

    const handleTaskDelete = (taskUid: string) => {
        setGoal((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                Tasks: (prev.Tasks ?? []).filter((t: any) => t.uid !== taskUid),
            };
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-600 dark:text-gray-300">
                {t('common.loading', 'Loading...')}
            </div>
        );
    }

    if (error || !goal) {
        return (
            <div className="text-red-500 p-4">
                {error ?? t('goals.notFound', 'Goal not found')}
            </div>
        );
    }

    const tasks: Task[] = (goal.Tasks ?? []) as Task[];
    const goalProjects: Project[] = (goal.Projects ?? []) as Project[];
    const activeTasks = tasks.filter(
        (t) => !TASK_STATUS_DONE.includes(t.status as any)
    );
    const completedTasks = tasks.filter((t) =>
        TASK_STATUS_DONE.includes(t.status as any)
    );
    const goalUids = new Set(goalProjects.map((p) => p.uid));
    const goalProjectCards = projectCards.filter(
        (p) => p.uid && goalUids.has(p.uid)
    );

    const keyResults: Goal[] = goal.KeyResults ?? [];
    // One level only: a key result has none, and neither has a bucket-list goal.
    const canHaveKeyResults = !goal.parent_goal_uid && !goal.bucket;

    const tabClass = (tab: GoalTab) =>
        `relative flex items-center self-stretch py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab
                ? 'text-gray-900 dark:text-gray-100 after:absolute after:bottom-0 after:left-px after:right-px after:h-0.5 after:rounded-full after:bg-gray-900 dark:after:bg-gray-100'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-200'
        }`;

    return (
        <div className="w-full px-2 sm:px-4 lg:px-6 pt-4 pb-12">
            <GoalHero
                goal={goal}
                t={t}
                doneCount={goal.progress?.done ?? completedTasks.length}
                totalCount={goal.progress?.total ?? tasks.length}
                onStatusChange={handleStatusChange}
                onShareClick={() => setIsShareModalOpen(true)}
                onEditClick={() => setIsEditing(true)}
                onDeleteClick={() => setIsConfirmDeleteOpen(true)}
            />

            {goal.parent_goal && (
                <p className="mb-3 px-2 text-sm text-gray-600 dark:text-gray-300">
                    {t('forms.goalParent', 'Key result of')}{' '}
                    <Link
                        to={createGoalUrl(goal.parent_goal)}
                        className="underline-offset-2 hover:underline"
                    >
                        {goal.parent_goal.title}
                    </Link>
                </p>
            )}

            {(keyResults.length > 0 || canHaveKeyResults) && (
                <section
                    className="mb-6 px-2"
                    data-testid={
                        keyResults.length > 0 ? 'key-results' : undefined
                    }
                    aria-label={t('goals.keyResults.title', 'Key results')}
                >
                    {keyResults.length > 0 && (
                        <>
                            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('goals.keyResults.title', 'Key results')}
                            </h3>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                {keyResults.map((kr) => (
                                    <li key={kr.uid} className="py-2">
                                        <Link
                                            to={createGoalUrl({
                                                uid: kr.uid,
                                                title: kr.title,
                                            })}
                                            className="flex items-center gap-3"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
                                                {kr.title}
                                            </span>
                                            <span className="flex-shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">
                                                {t(
                                                    'goals.keyResults.progress',
                                                    '{{done}} of {{total}} done',
                                                    {
                                                        done:
                                                            kr.progress?.done ??
                                                            0,
                                                        total:
                                                            kr.progress
                                                                ?.total ?? 0,
                                                    }
                                                )}
                                            </span>
                                            <span
                                                className="h-1 w-20 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                                                aria-hidden="true"
                                            >
                                                <span
                                                    className="block h-full rounded-full bg-blue-500"
                                                    style={{
                                                        width: `${kr.progress?.percent ?? 0}%`,
                                                    }}
                                                />
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {canHaveKeyResults &&
                        (addingKeyResult ? (
                            <input
                                autoFocus
                                type="text"
                                value={keyResultTitle}
                                onChange={(e) =>
                                    setKeyResultTitle(e.target.value)
                                }
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        void handleAddKeyResult();
                                    } else if (e.key === 'Escape') {
                                        setAddingKeyResult(false);
                                        setKeyResultTitle('');
                                    }
                                }}
                                onBlur={() => {
                                    if (!keyResultTitle.trim()) {
                                        setAddingKeyResult(false);
                                    }
                                }}
                                placeholder={t(
                                    'goals.keyResults.placeholder',
                                    'Key result'
                                )}
                                className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setAddingKeyResult(true)}
                                className="mt-1 text-xs text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
                            >
                                {t('goals.keyResults.add', 'Add a key result')}
                            </button>
                        ))}
                </section>
            )}

            <div className="mb-4">
                <div className="flex items-center min-h-[2.5rem]">
                    <div className="flex items-center gap-4 sm:gap-6 self-stretch pl-2 sm:pl-3">
                        <button
                            type="button"
                            onClick={() => setActiveTab('tasks')}
                            className={tabClass('tasks')}
                            aria-pressed={activeTab === 'tasks'}
                        >
                            {t('tasks.title', 'Tasks')} ({tasks.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('projects')}
                            className={tabClass('projects')}
                            aria-pressed={activeTab === 'projects'}
                        >
                            {t('projects.title', 'Projects')} (
                            {goalProjects.length})
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'tasks' ? (
                tasks.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300 px-2">
                        {t('goals.noTasks', 'No tasks assigned to this goal.')}
                    </p>
                ) : (
                    <div className="space-y-6">
                        {activeTasks.length > 0 && (
                            <TaskList
                                tasks={activeTasks}
                                projects={projects}
                                onTaskUpdate={handleTaskUpdate}
                                onTaskDelete={handleTaskDelete}
                            />
                        )}
                        {completedTasks.length > 0 && (
                            <div>
                                <h4 className="px-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">
                                    {t('tasks.completed', 'Completed')} (
                                    {completedTasks.length})
                                </h4>
                                <TaskList
                                    tasks={completedTasks}
                                    projects={projects}
                                    onTaskUpdate={handleTaskUpdate}
                                    onTaskDelete={handleTaskDelete}
                                    showCompletedTasks={true}
                                />
                            </div>
                        )}
                    </div>
                )
            ) : goalProjects.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300 px-2">
                    {t('goals.noProjects', 'No projects linked to this goal.')}
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {goalProjectCards.map((project) => (
                        <ProjectItem
                            key={project.id}
                            project={project}
                            viewMode="cards"
                            getCompletionPercentage={() =>
                                (project as any).completion_percentage || 0
                            }
                            {...cardActions}
                        />
                    ))}
                </div>
            )}

            <GoalModal
                isOpen={isEditing}
                onClose={() => setIsEditing(false)}
                goal={goal}
                onSaved={handleGoalSaved}
            />

            {projectModals}

            {isConfirmDeleteOpen && (
                <ConfirmDialog
                    title={t('modals.deleteGoal.title', 'Delete Goal')}
                    message={`${t('modals.deleteGoal.message', 'Are you sure you want to delete')} "${goal.title}"?`}
                    onConfirm={handleDeleteGoal}
                    onCancel={() => setIsConfirmDeleteOpen(false)}
                />
            )}

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                resourceType="goal"
                resourceUid={goal.uid || null}
                resourceName={goal.title}
            />
        </div>
    );
};

export default GoalDetails;
