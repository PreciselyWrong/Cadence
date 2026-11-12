import AutoClassifiedMark from '../AutoClassify/AutoClassifiedMark';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckIcon,
    ExclamationTriangleIcon,
    PaperClipIcon,
} from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import QuickCaptureInput from '../Inbox/QuickCaptureInput';
import ConfirmDialog from '../Shared/ConfirmDialog';
import TodoMdBadge from '../Shared/TodoMdBadge';
import TaskSourceBadge from '../Shared/TaskSourceBadge';
import MarkdownRenderer from '../Shared/MarkdownRenderer';
import MarkdownEditor from '../Note/MarkdownEditor';
import { SidePanelSection } from '../SidePanel/SidePanelParts';
import TaskSubtasksCard from './TaskDetails/TaskSubtasksCard';
import TaskAttachmentsCard from './TaskDetails/TaskAttachmentsCard';
import TaskComments from './TaskComments';
import TaskContexts from './TaskContexts';
import Backlinks from '../Shared/Backlinks';
import AddToLinks from '../Links/AddToLinks';
import TaskChipRow from './TaskChipRow';
import { SaveState } from './useTaskAutosave';
import { TaskEditor } from './useTaskEditor';
import TaskCheckCircle from './TaskCheckCircle';
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

interface TaskEditorBodyProps {
    ed: TaskEditor;
    // The sheet names itself after the title: this id labels it.
    titleId?: string;
    // "Planned Thu 12 Nov · 10:00", shown under the chips.
    plannedLabel?: string | null;
}

export const TaskEditorBody: React.FC<TaskEditorBodyProps> = ({
    ed,
    titleId,
    plannedLabel,
}) => {
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
        changeReminder,
        toggleCompletion,
        handleSubtaskUpdate,
        handleSubtaskDelete,
        handleQuickAddSubtask,
        setError,
        run,
        runFields,
    } = ed;
    // The upload area only takes room once the task has a file or the user
    // asks to attach one; the card stays mounted to learn the count.
    const [attachmentsCount, setAttachmentsCount] = useState(0);
    const [attachOpen, setAttachOpen] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    const showAttachments = attachOpen || attachmentsCount > 0;

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
            {!readOnly && <TaskSourceBadge task={task} className="mb-2" />}
            {titleId && (
                <h2 id={titleId} className="sr-only">
                    {task.name}
                </h2>
            )}
            <div className="flex items-start gap-3">
                {/* The task is done by its check circle, as on a row (Android
                passe de soustraction): no Complete button to mistake for
                Save. */}
                <span className="pt-2">
                    <TaskCheckCircle
                        task={task}
                        onToggle={ed.handleComplete}
                        testId="task-complete-button"
                    />
                </span>
                <div
                    data-testid="task-name-field"
                    aria-label={t('taskPanel.titleLabel', 'Task title')}
                    className="min-w-0 flex-1 pt-1 text-xl font-semibold text-surface-on"
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
            </div>
            {!readOnly && <AutoClassifiedMark entity="task" uid={task.uid} />}

            <TaskChipRow
                task={task}
                people={assignablePeople}
                onDue={changeDue}
                onStart={changeStart}
                onDefer={changeDefer}
                onReminder={changeReminder}
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
            {plannedLabel && (
                <p
                    data-testid="task-planned-label"
                    className="-mt-2 text-sm tabular-nums text-gray-600 dark:text-gray-300"
                >
                    {plannedLabel}
                </p>
            )}

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
                    <div className="rounded-xl bg-gray-100 px-3 pt-2 text-sm text-gray-900 focus-within:ring-2 focus-within:ring-indigo-500 dark:bg-gray-900 dark:text-gray-100">
                        <MarkdownEditor
                            value={note}
                            outlineKey={
                                task.uid ? `task:${task.uid}` : undefined
                            }
                            taskProjectId={task.project_id}
                            onChange={setNote}
                            onBlur={commitNote}
                            autoFocus
                            minHeight="7rem"
                            ariaLabel={t('forms.description', 'Description')}
                            placeholder={t(
                                'task.contentPlaceholder',
                                'Add content here... (Markdown supported)'
                            )}
                        />
                    </div>
                ) : (
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label={t('forms.description', 'Description')}
                        data-testid="task-note-preview"
                        onClick={(e) => {
                            if (
                                (e.target as HTMLElement).closest(
                                    'a, input, button'
                                )
                            )
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
                                outlineKey={
                                    task.uid ? `task:${task.uid}` : undefined
                                }
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
                <AddToLinks
                    sourceType="task"
                    sourceUid={task.uid}
                    texts={[task.name, note]}
                />
            )}

            {task.uid && (
                <>
                    {!readOnly && (
                        <SidePanelSection
                            title={
                                subtasks.length > 0
                                    ? t('task.subtasks', 'Subtasks')
                                    : ''
                            }
                        >
                            <TaskSubtasksCard
                                showTitle={false}
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

                    <div
                        hidden={!showAttachments}
                        data-testid="task-attachments-section"
                    >
                        <SidePanelSection
                            title={t('task.attachments', 'Attachments')}
                        >
                            <TaskAttachmentsCard
                                taskUid={task.uid}
                                showTitle={false}
                                onAttachmentsCountChange={setAttachmentsCount}
                            />
                        </SidePanelSection>
                    </div>
                    {!showAttachments && (
                        <button
                            type="button"
                            onClick={() => setAttachOpen(true)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        >
                            <PaperClipIcon className="h-4 w-4" />
                            {t('capture.attach', 'Attach files')}
                        </button>
                    )}

                    <TaskContexts taskUid={task.uid} />

                    <Backlinks type="task" uid={task.uid} className="-mx-2" />

                    <SidePanelSection
                        title={
                            commentCount > 0
                                ? t('task.comments', 'Comments')
                                : ''
                        }
                    >
                        <TaskComments
                            task={task}
                            quietWhenEmpty
                            onCommentCountChange={setCommentCount}
                        />
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
    const { t, done, postponeToTomorrow } = ed;
    return (
        <footer className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-outline-variant/60 px-5 py-2.5">
            {withStatus && <SaveIndicator state={ed.state} />}
            <button
                type="button"
                onClick={postponeToTomorrow}
                disabled={done}
                data-testid="task-postpone-button"
                className="h-7 rounded-lg px-2.5 text-body-m font-medium text-surface-on ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 max-sm:min-h-[44px]"
            >
                {t('datePopover.tomorrow', 'Tomorrow')}
            </button>
        </footer>
    );
};
