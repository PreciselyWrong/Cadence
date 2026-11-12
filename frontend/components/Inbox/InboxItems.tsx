import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Task } from '../../entities/Task';
import { Project } from '../../entities/Project';
import { Note } from '../../entities/Note';
import {
    loadInboxItemsToStore,
    loadMoreInboxItemsToStore,
    processInboxItemWithStore,
    deleteInboxItem,
    updateInboxItemWithStore,
    ProcessedInto,
} from '../../utils/inboxService';
import InboxItemDetail from './InboxItemDetail';
import { useToast } from '../Shared/ToastContext';
import { deferDelete } from '../../utils/deferredDelete';
import { useTranslation } from 'react-i18next';
import {
    ChevronDownIcon,
    ChevronRightIcon,
    InboxIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '../Shared/ui/PageHeader';
import PageShell, { PAGE_GUTTER } from '../Shared/ui/PageShell';
import Button from '../Shared/ui/Button';
import LoadingScreen from '../Shared/LoadingScreen';
import ProjectModal from '../Project/ProjectModal';
import NoteModal from '../Note/NoteModal';
import QuickCaptureInput from './QuickCaptureInput';
import InboxTriage from './InboxTriage';
import UnsortedTasks from './UnsortedTasks';
import TriageEntry from './TriageEntry';
import { createTask } from '../../utils/tasksService';
import { createProject } from '../../utils/projectsService';
import { createNote } from '../../utils/notesService';
import { OfflineQueuedError } from '../../utils/authUtils';
import { isUrl } from '../../utils/urlService';
import {
    addToProject,
    captureAsTask,
    CaptureDraft,
    LinkDraft,
} from '../../utils/linkTriage';
import { takeSharedText } from '../../utils/shareTargetService';
import { fetchAreas } from '../../utils/areasService';
import { fetchProjects } from '../../utils/projectsService';
import {
    getInboxRecentlyCapturedExpanded,
    updateUiSettings,
} from '../../utils/profileService';
import { useStore } from '../../store/useStore';
import { TASK_SHEET_CLASS } from '../Task/taskSheet';
import { openTaskPanel } from '../../store/taskPanelStore';
const InboxItems: React.FC = () => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast, showUndoToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const [hasInitialized, setHasInitialized] = useState(false);

    // Content handed over by the OS share sheet (see shareTargetService) is
    // prefilled into the composer rather than captured straight away, so the
    // user can still edit it or pick task/note/project
    const [sharedDraft] = useState<string>(() => takeSharedText() || '');

    const { inboxItems, isLoading, pagination } = useStore(
        (state) => state.inboxStore
    );
    const {
        areas,
        setAreas,
        setError: setAreasError,
    } = useStore((state) => state.areasStore);
    const {
        loadTags,
        hasLoaded: tagsHasLoaded,
        isLoading: tagsLoading,
    } = useStore((state) => state.tagsStore);

    const [projects, setProjects] = useState<Project[]>([]);

    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [inboxListExpanded, setInboxListExpanded] = useState(true);
    const [lastAddedUid, setLastAddedUid] = useState<string | null>(null);
    const [openItemUid, setOpenItemUid] = useState<string | null>(null);

    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);

    const [currentConversionItemUid, setCurrentConversionItemUid] = useState<
        string | null
    >(null);

    useEffect(() => {
        const urlPageSize = searchParams.get('loaded');
        const currentLoadedCount = urlPageSize ? parseInt(urlPageSize, 10) : 20;

        loadInboxItemsToStore(true, currentLoadedCount);
        setHasInitialized(true);

        const loadInitialProjects = async () => {
            try {
                const projectData = await fetchProjects();
                setProjects(Array.isArray(projectData) ? projectData : []);
            } catch (error) {
                console.error('Failed to load initial projects:', error);
                setProjects([]);
            }
        };
        loadInitialProjects();

        const loadInitialAreas = async () => {
            try {
                const areasData = await fetchAreas();
                setAreas(areasData);
            } catch (error) {
                console.error('Failed to load initial areas:', error);
                setAreasError(true);
            }
        };
        loadInitialAreas();

        const loadInitialTags = async () => {
            if (!tagsHasLoaded && !tagsLoading) {
                try {
                    await loadTags();
                } catch (error) {
                    console.error('Failed to load initial tags:', error);
                }
            }
        };
        loadInitialTags();

        getInboxRecentlyCapturedExpanded().then(setInboxListExpanded);

        const handleForceReload = () => {
            setTimeout(() => {
                const currentInboxStore = useStore.getState().inboxStore;
                const currentCount = currentInboxStore.inboxItems.length;
                loadInboxItemsToStore(false, currentCount);
            }, 500);
        };

        const handleInboxItemsUpdated = (
            event: CustomEvent<{ count: number; firstItemContent: string }>
        ) => {
            if (event.detail.count > 0) {
                showSuccessToast(
                    t(
                        'inbox.newTelegramItem',
                        'New item from Telegram: {{content}}',
                        {
                            content: event.detail.firstItemContent,
                        }
                    )
                );

                if (event.detail.count > 1) {
                    showSuccessToast(
                        t(
                            'inbox.multipleNewItems',
                            '{{count}} more new items added',
                            {
                                count: event.detail.count - 1,
                            }
                        )
                    );
                }
            }
        };

        const pollInterval = setInterval(() => {
            const currentInboxStore = useStore.getState().inboxStore;
            const currentCount = currentInboxStore.inboxItems.length;
            loadInboxItemsToStore(false, currentCount);
        }, 15000);

        window.addEventListener('forceInboxReload', handleForceReload);
        window.addEventListener(
            'inboxItemsUpdated',
            handleInboxItemsUpdated as EventListener
        );

        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('forceInboxReload', handleForceReload);
            window.removeEventListener(
                'inboxItemsUpdated',
                handleInboxItemsUpdated as EventListener
            );
        };
    }, [t, showSuccessToast]);

    useEffect(() => {
        if (!hasInitialized) return;

        const urlPageSize = searchParams.get('loaded');
        const urlLoadedCount = urlPageSize ? parseInt(urlPageSize, 10) : 0;

        if (inboxItems.length > 20 && inboxItems.length !== urlLoadedCount) {
            setSearchParams(
                { loaded: inboxItems.length.toString() },
                { replace: true }
            );
        } else if (inboxItems.length <= 20 && urlLoadedCount > 0) {
            setSearchParams({}, { replace: true });
        }
    }, [inboxItems.length, hasInitialized]);

    // Track newly-added items: when the list grows while initialized, mark the
    // newest item as "new" (entry animation) and auto-expand the list.
    const prevInboxLengthRef = React.useRef<number>(0);
    useEffect(() => {
        if (!hasInitialized) {
            prevInboxLengthRef.current = inboxItems.length;
            return;
        }
        const prev = prevInboxLengthRef.current;
        const curr = inboxItems.length;
        if (curr > prev && inboxItems[0]?.uid) {
            setLastAddedUid(inboxItems[0].uid);
            setInboxListExpanded(true);
            // Clear the "new" flag after the animation completes
            const timer = setTimeout(() => setLastAddedUid(null), 500);
            prevInboxLengthRef.current = curr;
            return () => clearTimeout(timer);
        }
        prevInboxLengthRef.current = curr;
    }, [inboxItems, hasInitialized]);

    // ── Item handlers ─────────────────────────────────────────────────────────

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
    const [unsortedReload, setUnsortedReload] = useState(0);
    const handleCaptureTask = async (
        inboxItemUid: string,
        draft: CaptureDraft
    ): Promise<void> => {
        try {
            await captureAsTask(inboxItemUid, draft);
            setUnsortedReload((key) => key + 1);
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

    const handleLoadMore = async () => {
        try {
            await loadMoreInboxItemsToStore();
        } catch (error) {
            console.error('Failed to load more inbox items:', error);
            showErrorToast(
                t('inbox.loadMoreError', 'Failed to load more items')
            );
        }
    };

    if (isLoading && inboxItems.length === 0) {
        return <LoadingScreen />;
    }

    const openIndex = openItemUid
        ? inboxItems.findIndex((item) => item.uid === openItemUid)
        : -1;

    const isTriage = searchParams.get('triage') === '1';
    const setTriage = (on: boolean) => {
        const next = new URLSearchParams(searchParams);
        if (on) next.set('triage', '1');
        else next.delete('triage');
        setSearchParams(next);
    };

    if (isTriage) {
        return (
            <PageShell template="list" className={`pt-6 ${PAGE_GUTTER}`}>
                <InboxTriage
                    projects={projects}
                    onExit={() => setTriage(false)}
                    onProjectsChanged={() => {
                        fetchProjects()
                            .then(setProjects)
                            .catch(() => {});
                    }}
                />
            </PageShell>
        );
    }

    return (
        <PageShell template="list">
            <PageHeader
                title={t('inbox.title')}
                actions={
                    <>
                        <TriageEntry />
                        {inboxItems.length > 0 && (
                            <Button
                                data-testid="inbox-triage-start"
                                onClick={() => setTriage(true)}
                            >
                                {t('inbox.triage.start', 'Triage')}
                            </Button>
                        )}
                    </>
                }
            />
            <div className="px-4 max-sm:px-2">
                {/* ── Quick capture ────────────────────────────────────────── */}
                <QuickCaptureInput
                    unified
                    projects={projects}
                    initialValue={sharedDraft}
                    autoFocus={true}
                    cardClassName="mb-5"
                    onCaptured={(items) => {
                        if (items.some((item) => item.target === 'project')) {
                            fetchProjects()
                                .then(setProjects)
                                .catch(() => {});
                        }
                    }}
                />

                <UnsortedTasks reloadKey={unsortedReload} />

                {/* ── Item list ────────────────────────────────────────────── */}
                {inboxItems.length > 0 && (
                    <div
                        className={`w-full overflow-visible ${TASK_SHEET_CLASS}`}
                    >
                        <button
                            type="button"
                            aria-expanded={inboxListExpanded}
                            onClick={() =>
                                setInboxListExpanded((prev) => {
                                    const next = !prev;
                                    updateUiSettings({
                                        inbox: {
                                            recentlyCapturedExpanded: next,
                                        },
                                    }).catch(() => {});
                                    return next;
                                })
                            }
                            className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs font-medium text-surface-on-variant outline-none hover:text-surface-on focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                            {inboxListExpanded ? (
                                <ChevronDownIcon
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ChevronRightIcon
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                />
                            )}
                            <span>
                                {t(
                                    'inbox.recentlyCaptured',
                                    'Recently captured'
                                )}
                            </span>
                            <span className="tabular-nums">
                                {inboxItems.length}
                            </span>
                        </button>

                        {inboxListExpanded && (
                            <>
                                {/* The open item detaches into its own card,
                                    splitting the list around it (see .task-sheet). */}
                                {inboxItems.map((item, index) => (
                                    <div key={item.uid || item.id}>
                                        <div
                                            data-task-expanded={
                                                index === openIndex || undefined
                                            }
                                        >
                                            <InboxItemDetail
                                                item={item}
                                                onDelete={handleDeleteItem}
                                                onUpdate={handleUpdateItem}
                                                openTaskModal={
                                                    handleOpenTaskModal
                                                }
                                                openProjectModal={
                                                    handleOpenProjectModal
                                                }
                                                openNoteModal={
                                                    handleOpenNoteModal
                                                }
                                                onCaptureTask={
                                                    handleCaptureTask
                                                }
                                                onAddToProject={
                                                    handleAddToProject
                                                }
                                                projects={projects}
                                                isNew={
                                                    item.uid === lastAddedUid
                                                }
                                                onEditingChange={(editing) =>
                                                    setOpenItemUid((prev) =>
                                                        editing
                                                            ? (item.uid ?? null)
                                                            : prev === item.uid
                                                              ? null
                                                              : prev
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                ))}

                                <div>
                                    {/* Load more */}
                                    {pagination.hasMore && (
                                        <div className="flex justify-center pt-5">
                                            <Button
                                                variant="ghost"
                                                onClick={handleLoadMore}
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <svg
                                                            className="animate-spin h-3.5 w-3.5"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <circle
                                                                className="opacity-25"
                                                                cx="12"
                                                                cy="12"
                                                                r="10"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                            />
                                                            <path
                                                                className="opacity-75"
                                                                fill="currentColor"
                                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                            />
                                                        </svg>
                                                        {t(
                                                            'inbox.loading',
                                                            'Loading…'
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <InboxIcon className="h-3.5 w-3.5" />
                                                        {t(
                                                            'inbox.loadMore',
                                                            'Load more'
                                                        )}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}

                                    {/* Only while items remain to load: the
                                        header already counts a full list. */}
                                    {inboxItems.length < pagination.total && (
                                        <div
                                            className="pb-2 pt-4 text-center text-xs text-surface-on-variant"
                                            data-testid="inbox-showing-count"
                                        >
                                            {t(
                                                'inbox.showingItems',
                                                'Showing {{current}} of {{total}} items',
                                                {
                                                    current: inboxItems.length,
                                                    total: pagination.total,
                                                }
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {(() => {
                    return (
                        isProjectModalOpen &&
                        (() => {
                            try {
                                return (
                                    <ProjectModal
                                        isOpen={isProjectModalOpen}
                                        onClose={() => {
                                            setIsProjectModalOpen(false);
                                            setProjectToEdit(null);
                                        }}
                                        onSave={handleSaveProject}
                                        project={projectToEdit || undefined}
                                        areas={
                                            Array.isArray(areas) ? areas : []
                                        }
                                    />
                                );
                            } catch (error) {
                                console.error(
                                    'ProjectModal rendering error:',
                                    error
                                );
                                return null;
                            }
                        })()
                    );
                })()}

                {(() => {
                    try {
                        return (
                            <NoteModal
                                isOpen={isNoteModalOpen}
                                onClose={() => {
                                    setIsNoteModalOpen(false);
                                    setNoteToEdit(null);
                                }}
                                onSave={handleSaveNote}
                                note={noteToEdit}
                                projects={
                                    Array.isArray(projects) ? projects : []
                                }
                                onCreateProject={handleCreateProject}
                            />
                        );
                    } catch (error) {
                        console.error('NoteModal rendering error:', error);
                        return null;
                    }
                })()}
            </div>
        </PageShell>
    );
};

export default InboxItems;
