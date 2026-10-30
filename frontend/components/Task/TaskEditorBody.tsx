import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import QuickCaptureInput from '../Inbox/QuickCaptureInput';
import ConfirmDialog from '../Shared/ConfirmDialog';
import TodoMdBadge from '../Shared/TodoMdBadge';
import MarkdownRenderer from '../Shared/MarkdownRenderer';
import { SidePanelSection } from '../SidePanel/SidePanelParts';
import TaskSubtasksCard from './TaskDetails/TaskSubtasksCard';
import TaskAttachmentsCard from './TaskDetails/TaskAttachmentsCard';
import TaskComments from './TaskComments';
import TaskChipRow from './TaskChipRow';
import { SaveState } from './useTaskAutosave';
import { TaskEditor } from './useTaskEditor';
import { openTaskPanel } from '../../store/taskPanelStore';

export const SaveIndicator: React.FC<{ state: SaveState }> = ({ state }) => {
    const { t } = useTranslation();
    return (
        <span
            role="status"
            aria-live="polite"
            data-testid="task-save-state"
            data-state={state}
            className="mr-auto flex items-center gap-1 self-center text-xs text-gray-500 dark:text-gray-400"
        >
            {state === 'saving' && t('taskPanel.saving', 'Saving…')}
            {state === 'saved' && (
                <>
                    <CheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    {t('taskPanel.saved', 'Saved')}
                </>
            )}
            {state === 'error' && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                    {t('taskPanel.saveFailed', 'Save failed, change undone')}
                </span>
            )}
        </span>
    );
};

export const TaskEditorBody: React.FC<{ ed: TaskEditor }> = ({ ed }) => {
    const {
        t,
        task,
        readOnly,
        projects,
        nameSeed,
        draftName,
        isEditingNote,
        setIsEditingNote,
        note,
        setNote,
        assignablePeople,
        subtasks,
        blockedConfirm,
        setBlockedConfirm,
        commitTitle,
        commitNote,
        saveNote,
        changeDue,
        changeStart,
        changeDefer,
        toggleCompletion,
        handleSubtaskUpdate,
        handleSubtaskDelete,
        handleQuickAddSubtask,
        setError,
        run,
        runFields,
    } = ed;

    return (
        <>
            {readOnly && (
                <div data-testid="todo-md-task-panel">
                    <p className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                        <TodoMdBadge className="ml-0" />
                        {t(
                            'todoMd.readOnly',
                            'This comes from a TODO.md file. Edit the file instead.'
                        )}
                    </p>
                    {task.source_section && (
                        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {task.source_section}
                        </p>
                    )}
                </div>
            )}
            <div
                data-testid="task-name-field"
                aria-label={t('taskPanel.titleLabel', 'Task title')}
                className="pt-1 text-xl font-semibold text-gray-900 dark:text-white"
                onBlur={(event) => {
                    if (
                        !event.currentTarget.contains(
                            event.relatedTarget as Node
                        )
                    ) {
                        void commitTitle();
                    }
                }}
            >
                {readOnly ? (
                    <h2 className="break-words">{task.name}</h2>
                ) : (
                    <QuickCaptureInput
                        mode="edit"
                        bare
                        multiline={false}
                        hidePrimaryButton
                        initialValue={nameSeed}
                        projects={projects}
                        onTextChange={(text) => {
                            draftName.current = text;
                        }}
                        onSubmitOverride={(text) => commitTitle(text)}
                    />
                )}
            </div>

            <TaskChipRow
                readOnly={readOnly}
                task={task}
                people={assignablePeople}
                onDue={changeDue}
                onStart={changeStart}
                onDefer={changeDefer}
                onPriority={(priority) => {
                    setError(null);
                    void run({ priority }, (s) => s.setPriority(priority));
                }}
                onProject={(projectId) => {
                    setError(null);
                    void run(
                        {
                            project_id: (projectId ??
                                null) as unknown as number,
                        },
                        (s) => s.setProject(projectId)
                    );
                }}
                onArea={(areaId) =>
                    void runFields(
                        { area_id: (areaId ?? null) as unknown as number },
                        { area_id: areaId },
                        'task.areaUpdateError',
                        'Failed to update area'
                    )
                }
                onTags={(names) =>
                    void run(
                        {
                            tags: names.map((name) => ({
                                name,
                            })) as Task['tags'],
                        },
                        (s) => s.setTags(names)
                    )
                }
                onStatus={(status) =>
                    void runFields(
                        { status },
                        { status },
                        'task.statusUpdateError',
                        'Failed to update status'
                    )
                }
                onRecurrence={(payload) =>
                    void run(payload, (s) => s.setRecurrence(payload))
                }
                onEstimate={(minutes) =>
                    void runFields(
                        { estimated_minutes: minutes },
                        { estimated_minutes: minutes },
                        'task.estimateUpdateError',
                        'Failed to update estimate'
                    )
                }
                onAssignee={(uid) =>
                    void run({ assigned_to: uid }, (s) => s.setAssignee(uid))
                }
                onOpenParent={openTaskPanel}
            />

            <div data-testid="task-note-field">
                {readOnly ? (
                    note.trim() && (
                        <div className="px-3 py-2 text-sm">
                            <MarkdownRenderer
                                content={note}
                                className="prose prose-sm dark:prose-invert max-w-none break-words"
                            />
                        </div>
                    )
                ) : isEditingNote ? (
                    <textarea
                        id="taskNote"
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onBlur={commitNote}
                        rows={Math.min(
                            14,
                            Math.max(4, note.split('\n').length + 1)
                        )}
                        aria-label={t('forms.description', 'Description')}
                        className="block w-full resize-y rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-900 dark:text-gray-100"
                        placeholder={t(
                            'task.contentPlaceholder',
                            'Add content here... (Markdown supported)'
                        )}
                    />
                ) : (
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label={t('forms.description', 'Description')}
                        data-testid="task-note-preview"
                        onClick={(e) => {
                            if ((e.target as HTMLElement).closest('a, input'))
                                return;
                            setIsEditingNote(true);
                        }}
                        onKeyDown={(e) => {
                            if (
                                e.key === 'Enter' &&
                                e.target === e.currentTarget
                            )
                                setIsEditingNote(true);
                        }}
                        className="min-h-[3rem] cursor-text rounded-xl px-3 py-2 text-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-gray-900/50"
                    >
                        {note.trim() ? (
                            <MarkdownRenderer
                                content={note}
                                className="prose prose-sm dark:prose-invert max-w-none"
                                onContentChange={(next) => {
                                    setNote(next);
                                    saveNote(next);
                                }}
                            />
                        ) : (
                            <span className="text-gray-500 dark:text-gray-400">
                                {t(
                                    'taskPanel.addDescription',
                                    'Add a description (Markdown)'
                                )}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {task.uid && (
                <>
                    {!readOnly && (
                        <SidePanelSection
                            title={t('task.subtasks', 'Subtasks')}
                        >
                            <TaskSubtasksCard
                                subtasks={subtasks}
                                projects={projects}
                                onSubtaskUpdate={handleSubtaskUpdate}
                                onSubtaskDelete={(uid) =>
                                    void handleSubtaskDelete(uid)
                                }
                                onQuickAdd={(name) =>
                                    void handleQuickAddSubtask(name)
                                }
                            />
                        </SidePanelSection>
                    )}

                    <SidePanelSection
                        title={t('task.attachments', 'Attachments')}
                    >
                        <TaskAttachmentsCard
                            taskUid={task.uid}
                            showTitle={false}
                        />
                    </SidePanelSection>

                    <SidePanelSection title={t('task.comments', 'Comments')}>
                        <TaskComments task={task} />
                    </SidePanelSection>
                </>
            )}

            {blockedConfirm && (
                <ConfirmDialog
                    title={t(
                        'relations.completeBlockedTitle',
                        'Task is blocked'
                    )}
                    message={t(
                        'relations.completeBlockedMessage',
                        'This task is blocked by {{count}} open task(s). Complete it anyway?',
                        { count: task.blocked_by_count || 1 }
                    )}
                    confirmButtonText={t(
                        'relations.completeAnyway',
                        'Complete anyway'
                    )}
                    onConfirm={() => {
                        setBlockedConfirm(false);
                        toggleCompletion();
                    }}
                    onCancel={() => setBlockedConfirm(false)}
                />
            )}
        </>
    );
};

export const TaskEditorFooter: React.FC<{
    ed: TaskEditor;
    withStatus?: boolean;
}> = ({ ed, withStatus = false }) => {
    const { t, done, readOnly, postponeToTomorrow, handleComplete } = ed;
    return (
        <footer className="flex flex-shrink-0 items-center justify-end gap-3 bg-gray-50 px-5 py-3 dark:bg-gray-900/40">
            {withStatus && <SaveIndicator state={ed.state} />}
            <button
                type="button"
                onClick={postponeToTomorrow}
                disabled={done || readOnly}
                data-testid="task-postpone-button"
                className="rounded-full bg-gray-200/70 px-5 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
                {t('datePopover.tomorrow', 'Tomorrow')}
            </button>
            <button
                type="button"
                onClick={handleComplete}
                data-testid="task-complete-button"
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
                <CheckIcon className="h-4 w-4" />
                {done
                    ? t('taskPanel.reopen', 'Reopen')
                    : t('taskPanel.complete', 'Complete')}
            </button>
        </footer>
    );
};
