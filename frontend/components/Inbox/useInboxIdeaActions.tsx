import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../../entities/Task';
import { Project } from '../../entities/Project';
import { Note } from '../../entities/Note';
import {
    processInboxItemWithStore,
    deleteInboxItem,
    updateInboxItemWithStore,
    ProcessedInto,
} from '../../utils/inboxService';
import { useToast } from '../Shared/ToastContext';
import { deferDelete } from '../../utils/deferredDelete';
import ProjectModal from '../Project/ProjectModal';
import NoteModal from '../Note/NoteModal';
import { createTask } from '../../utils/tasksService';
import { createProject, fetchProjects } from '../../utils/projectsService';
import { createNote } from '../../utils/notesService';
import { OfflineQueuedError } from '../../utils/authUtils';
import { isUrl } from '../../utils/urlService';
import {
    addToProject,
    captureAsTask,
    CaptureDraft,
    LinkDraft,
} from '../../utils/linkTriage';
import { fetchAreas } from '../../utils/areasService';
import { useStore } from '../../store/useStore';
import { openTaskPanel } from '../../store/taskPanelStore';

interface InboxIdeaActionsOptions {
    // An idea became a task waiting in « Tâches à classer ».
    onTaskCaptured?(): void;
}

/**
 * What an inbox idea can become (task, project page, project, note) or how
 * it leaves (delete with undo), with the project and note modals those
 * decisions open. Plan's idea sheet and the triage page share it.
 */
export const useInboxIdeaActions = ({
    onTaskCaptured,
}: InboxIdeaActionsOptions = {}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast, showUndoToast } = useToast();
    const { areas, setAreas } = useStore((state) => state.areasStore);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
    const [currentConversionItemUid, setCurrentConversionItemUid] = useState<
        string | null
    >(null);

    const reloadProjects = useCallback(() => {
        fetchProjects()
            .then((data) => setProjects(Array.isArray(data) ? data : []))
            .catch((error) => {
                console.error('Failed to load projects:', error);
                setProjects([]);
            });
    }, []);

    useEffect(() => {
        reloadProjects();
    }, [reloadProjects]);

    const handleProcessItem = async (
        uid: string,
        showToast: boolean = true,
        processedInto?: ProcessedInto
    ) => {
        try {
            await processInboxItemWithStore(uid, processedInto);
            if (showToast) {
                showSuccessToast(t('inbox.itemProcessed'));
            }
        } catch (error) {
            console.error('Failed to process inbox item:', error);
            showErrorToast(t('inbox.processError'));
        }
    };

    const handleUpdateItem = async (
        uid: string,
        newContent: string
    ): Promise<void> => {
        try {
            await updateInboxItemWithStore(uid, newContent);
            showSuccessToast(t('inbox.itemUpdated'));
        } catch (error) {
            console.error('Failed to update inbox item:', error);
            showErrorToast(t('inbox.updateError'));
        }
    };

    // The item leaves the list at once; the delete waits for the undo window.
    const handleDeleteItem = (uid: string) => {
        const {
            inboxItems: current,
            removeInboxItemByUid,
            addInboxItem,
        } = useStore.getState().inboxStore;
        const item = current.find((entry) => entry.uid === uid);
        removeInboxItemByUid(uid);
        const restore = () => {
            if (item) addInboxItem(item);
        };
        const undo = deferDelete(
            `inbox:${uid}`,
            (options) => deleteInboxItem(uid, options),
            (error) => {
                console.error('Failed to delete inbox item:', error);
                restore();
                showErrorToast(t('inbox.deleteError'));
            }
        );
        showUndoToast(t('inbox.itemDeleted'), () => {
            if (undo()) restore();
        });
    };

    const createTaskAndHandleConversion = async (
        taskData: Task,
        options: { inboxItemUid?: string; navigateAfterCreate?: boolean } = {}
    ) => {
        try {
            const createdTask = await createTask(taskData);
            const taskLink = (
                <span>
                    {t('task.created', 'Task')}{' '}
                    <button
                        type="button"
                        onClick={() =>
                            createdTask.uid && openTaskPanel(createdTask.uid)
                        }
                        className="text-green-200 underline hover:text-green-100"
                    >
                        {createdTask.name}
                    </button>{' '}
                    {t('task.createdSuccessfully', 'created successfully!')}
                </span>
            );
            showSuccessToast(taskLink);

            const inboxUid =
                options.inboxItemUid ?? currentConversionItemUid ?? undefined;

            if (inboxUid) {
                await handleProcessItem(
                    inboxUid,
                    false,
                    createdTask.uid ? { task_uid: createdTask.uid } : undefined
                );
                if (!options.inboxItemUid) {
                    setCurrentConversionItemUid(null);
                }
            }

            if (options.navigateAfterCreate && createdTask.uid) {
                openTaskPanel(createdTask.uid);
            }

            return createdTask;
        } catch (error) {
            if (!(error instanceof OfflineQueuedError)) {
                console.error('Failed to create task:', error);
                showErrorToast(t('task.createError'));
            }
            throw error;
        } finally {
            if (options.inboxItemUid) {
                setCurrentConversionItemUid(null);
            }
        }
    };

    const handleOpenTaskModal = async (task: Task, inboxItemUid?: string) => {
        if (inboxItemUid) {
            setCurrentConversionItemUid(inboxItemUid);
        }

        try {
            await createTaskAndHandleConversion(task, {
                inboxItemUid,
                navigateAfterCreate: false,
            });
        } catch (error) {
            if (error instanceof OfflineQueuedError) {
                showSuccessToast(
                    t(
                        'inbox.itemQueuedOffline',
                        "Saved offline. It'll sync automatically once you're back online."
                    )
                );
            }
            // Other errors are already reported via toast notifications
        }
    };

    // An idea that is only an address becomes a task in one click.
    const handleCaptureTask = async (
        inboxItemUid: string,
        draft: CaptureDraft
    ): Promise<void> => {
        try {
            await captureAsTask(inboxItemUid, draft);
            onTaskCaptured?.();
            showSuccessToast(
                draft.project_uid
                    ? t('links.capture.taskAdded', 'Task added')
                    : t(
                          'links.capture.taskToSort',
                          'Task added to Tasks to sort'
                      )
            );
        } catch (error) {
            console.error('Failed to capture the task:', error);
            showErrorToast(t('task.createError', 'Could not create the task.'));
        }
    };

    // "Project…": the page goes to the project, the item leaves the inbox.
    const handleAddToProject = async (
        inboxItemUid: string,
        draft: LinkDraft
    ): Promise<void> => {
        try {
            await addToProject(inboxItemUid, draft);
            showSuccessToast(
                t('links.capture.addedToProject', 'Added to the project')
            );
        } catch (error) {
            console.error('Failed to keep the link:', error);
            showErrorToast(t('links.saveError', 'Could not save the link.'));
        }
    };

    const handleOpenProjectModal = async (
        project: Project | null,
        inboxItemUid?: string
    ) => {
        try {
            try {
                const areasData = await fetchAreas();
                setAreas(areasData);
            } catch (error) {
                console.error('Failed to load areas:', error);
                showErrorToast(t('area.loadError', 'Failed to load areas'));
                setAreas([]);
            }

            setProjectToEdit(project);

            if (inboxItemUid) {
                setCurrentConversionItemUid(inboxItemUid);
            }

            setIsProjectModalOpen(true);
        } catch (error) {
            console.error('Failed to open project modal:', error);
        }
    };

    const handleOpenNoteModal = async (
        note: Note | null,
        inboxItemUid?: string
    ) => {
        if (note && note.content && isUrl(note.content.trim())) {
            if (!note.tags) {
                note.tags = [{ name: 'bookmark' }];
            } else if (!note.tags.some((tag) => tag.name === 'bookmark')) {
                note.tags.push({ name: 'bookmark' });
            }
        }

        setNoteToEdit(note);

        if (inboxItemUid) {
            setCurrentConversionItemUid(inboxItemUid);
        }

        setIsNoteModalOpen(true);
    };

    const handleSaveProject = async (project: Project) => {
        try {
            const createdProject = await createProject(project);

            const updatedProjects = await fetchProjects();
            setProjects(updatedProjects);

            const { setProjects: setGlobalProjects } =
                useStore.getState().projectsStore;
            setGlobalProjects(updatedProjects);

            if (currentConversionItemUid !== null) {
                await handleProcessItem(
                    currentConversionItemUid,
                    false,
                    createdProject?.uid
                        ? { project_uid: createdProject.uid }
                        : undefined
                );
                setCurrentConversionItemUid(null);
            }
        } catch (error) {
            if (error instanceof OfflineQueuedError) {
                showSuccessToast(
                    t(
                        'inbox.itemQueuedOffline',
                        "Saved offline. It'll sync automatically once you're back online."
                    )
                );
                return;
            }
            console.error('Failed to create project:', error);
            showErrorToast(t('project.createError'));
        }
    };

    const handleSaveNote = async (note: Note) => {
        try {
            const noteContent = note.content || '';
            const isBookmarkContent = isUrl(noteContent.trim());

            if (!note.tags) {
                note.tags = [];
            }

            if (
                isBookmarkContent &&
                !note.tags.some((tag) => tag.name === 'bookmark')
            ) {
                note.tags = [...note.tags, { name: 'bookmark' }];
            }

            const createdNote = await createNote(note);
            useStore.getState().notesStore.addNote(createdNote);

            if (currentConversionItemUid !== null) {
                await handleProcessItem(
                    currentConversionItemUid,
                    false,
                    createdNote?.uid ? { note_uid: createdNote.uid } : undefined
                );
                setCurrentConversionItemUid(null);
            }

            setIsNoteModalOpen(false);
        } catch (error) {
            if (error instanceof OfflineQueuedError) {
                throw error;
            }
            console.error('Failed to create note:', error);
            showErrorToast(t('note.createError', 'Failed to create note'));
        }
    };

    const handleCreateProject = async (name: string): Promise<Project> => {
        try {
            const project = await createProject({ name, status: 'planned' });
            const { projectsStore } = useStore.getState();
            projectsStore.setProjects([...projectsStore.projects, project]);
            showSuccessToast(t('project.createSuccess'));
            return project;
        } catch (error) {
            console.error('Failed to create project:', error);
            showErrorToast(t('project.createError'));
            throw error;
        }
    };

    const modals = (
        <>
            {isProjectModalOpen && (
                <ProjectModal
                    isOpen={isProjectModalOpen}
                    onClose={() => {
                        setIsProjectModalOpen(false);
                        setProjectToEdit(null);
                    }}
                    onSave={handleSaveProject}
                    project={projectToEdit || undefined}
                    areas={Array.isArray(areas) ? areas : []}
                />
            )}
            <NoteModal
                isOpen={isNoteModalOpen}
                onClose={() => {
                    setIsNoteModalOpen(false);
                    setNoteToEdit(null);
                }}
                onSave={handleSaveNote}
                note={noteToEdit}
                projects={projects}
                onCreateProject={handleCreateProject}
            />
        </>
    );

    return {
        projects,
        reloadProjects,
        modals,
        detailProps: {
            onDelete: handleDeleteItem,
            onUpdate: handleUpdateItem,
            openTaskModal: handleOpenTaskModal,
            openProjectModal: handleOpenProjectModal,
            openNoteModal: handleOpenNoteModal,
            onCaptureTask: handleCaptureTask,
            onAddToProject: handleAddToProject,
            projects,
        },
    };
};
