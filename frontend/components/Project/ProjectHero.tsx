import LinkPreviews from '../Links/LinkPreviews';
import { getCurrentLocale } from '../../utils/dateUtils';
import React, { useEffect, useRef, useState } from 'react';
import { TFunction } from 'i18next';
import { differenceInCalendarDays, format } from 'date-fns';
import {
    ArrowUturnLeftIcon,
    CameraIcon,
    CheckCircleIcon,
    CheckIcon,
    ChevronDownIcon,
    EllipsisHorizontalIcon,
    FolderIcon,
} from '@heroicons/react/24/outline';
import { Project, ProjectStatus } from '../../entities/Project';
import { Area } from '../../entities/Area';
import { getAssetPath } from '../../config/paths';
import { getProjectStatusTint } from './projectStatusStyles';
import TodoMdProjectNote from './TodoMdProjectNote';
import { isTodoMdProject, todoMdRepoSlug } from '../../utils/todoMd';
import EntityIcon from '../Shared/EntityIcon';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import { PAGE_GUTTER } from '../Shared/ui/PageShell';

const PROJECT_STATUSES: ProjectStatus[] = [
    'not_started',
    'planned',
    'in_progress',
    'waiting',
    'done',
    'paused',
    'cancelled',
    'archived',
];
const MAX_NAME_LENGTH = 150;

interface ProjectHeroProps {
    project: Project;
    areas: Area[];
    t: TFunction;
    doneCount: number;
    totalCount: number;
    onUpdate: (patch: Partial<Project>) => Promise<void>;
    // Marking done goes here instead of onUpdate, so open tasks can be asked about
    onComplete?: () => void;
    onDeleteClick: () => void;
    onShareClick: () => void;
    // Offered when the project is shared with the viewer (can_leave)
    onLeaveClick?: () => void;
    onSaveAsTemplate?: () => void;
    // The pages' actions: Markdown copy and check (docs/37-links.md).
    pageActions?: { key: string; label: string; onSelect: () => void }[];
    onEditBannerClick?: () => void;
    onEditClick?: () => void;
    onTogglePin?: () => void;
    onImportClick?: () => void;
    onExport?: (format: 'xlsx' | 'csv') => void;
    // Rereads the TODO.md files and reloads the project (TODO.md projects).
    onReread?: () => Promise<void>;
    // The task to do next: the one the user designated, else the page's own
    // suggestion.
    nextAction?: { uid?: string; name: string } | null;
}

const ProjectHero: React.FC<ProjectHeroProps> = ({
    project,
    t,
    doneCount,
    totalCount,
    onUpdate,
    onComplete,
    onDeleteClick,
    onShareClick,
    onLeaveClick,
    onSaveAsTemplate,
    pageActions,
    onEditBannerClick,
    onEditClick,
    onTogglePin,
    onImportClick,
    onExport,
    onReread,
    nextAction,
}) => {
    const fileBacked = isTodoMdProject(project);
    // A repository project takes its name from the slug.
    const nameLocked = Boolean(todoMdRepoSlug(project.source_path));
    const [statusOpen, setStatusOpen] = useState(false);
    const statusRef = useRef<HTMLDivElement>(null);

    // The name and description edit in place: click to edit, Enter (or
    // Cmd/Ctrl+Enter for the description) or leaving the field saves, Esc
    // puts the saved value back.
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(project.name);
    const nameRef = useRef<HTMLInputElement>(null);
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState(
        project.description || ''
    );
    const descriptionRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!editingName) setNameDraft(project.name);
    }, [project.name, editingName]);

    useEffect(() => {
        if (!editingDescription) setDescriptionDraft(project.description || '');
    }, [project.description, editingDescription]);

    useEffect(() => {
        if (editingName) nameRef.current?.select();
    }, [editingName]);

    useEffect(() => {
        if (!editingDescription) return;
        const el = descriptionRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, [editingDescription]);

    useEffect(() => {
        if (!statusOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (statusRef.current && !statusRef.current.contains(target)) {
                setStatusOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, [statusOpen]);

    const saveName = async () => {
        const next = nameDraft.trim();
        setEditingName(false);
        if (!next || next.length > MAX_NAME_LENGTH || next === project.name) {
            setNameDraft(project.name);
            return;
        }
        try {
            await onUpdate({ name: next });
        } catch {
            setNameDraft(project.name);
        }
    };

    const saveDescription = async () => {
        const next = descriptionDraft.trim();
        setEditingDescription(false);
        if (next === (project.description || '')) {
            setDescriptionDraft(project.description || '');
            return;
        }
        try {
            await onUpdate({ description: next });
        } catch {
            setDescriptionDraft(project.description || '');
        }
    };

    const changeStatus = async (status: ProjectStatus) => {
        setStatusOpen(false);
        if (status === project.status) return;
        // Completing goes through the file, task by task.
        if (fileBacked && status === 'done') return;
        if (status === 'done' && onComplete) {
            onComplete();
            return;
        }
        await onUpdate({ status }).catch(() => undefined);
    };

    // The project's own start, or the day it was created when none is set.
    const startDate = project.start_date
        ? new Date(`${project.start_date}T${project.start_time || '00:00'}:00`)
        : project.created_at
          ? new Date(project.created_at)
          : null;
    const startsLater = !!startDate && startDate.getTime() > Date.now();
    const isDone = project.status === 'done';
    const completedDate =
        isDone && project.completed_at ? new Date(project.completed_at) : null;
    // Once done, the due date countdown stops mattering
    const dueDate =
        !isDone && project.due_date_at ? new Date(project.due_date_at) : null;
    const today = new Date();
    const daysLeft = dueDate ? differenceInCalendarDays(dueDate, today) : null;
    // How much of the time between start and due date has passed, so the
    // progress bar can show whether tasks keep up with the calendar.
    const timeUsed =
        startDate && dueDate && dueDate > startDate
            ? Math.min(
                  100,
                  Math.max(
                      0,
                      Math.round(
                          ((today.getTime() - startDate.getTime()) /
                              (dueDate.getTime() - startDate.getTime())) *
                              100
                      )
                  )
              )
            : null;

    const dueText =
        daysLeft === null
            ? null
            : daysLeft > 0
              ? t('project.daysToDue', '{{count}} days to due date', {
                    count: daysLeft,
                })
              : daysLeft === 0
                ? t('projectItem.dueToday', 'Due today')
                : t('project.dueOn', 'Due {{date}}', {
                      date: dueDate
                          ? format(dueDate, 'PP', {
                                locale: getCurrentLocale(),
                            })
                          : '',
                  });

    const tint = project.color || '#3b82f6';
    // Pinning and sharing are rare: menu only.
    const menu: MenuEntry[] = [
        ...(onTogglePin
            ? [
                  {
                      key: 'pin',
                      label: project.pin_to_sidebar
                          ? t('project.pinned', 'Pinned')
                          : t('project.pin', 'Pin'),
                      onSelect: onTogglePin,
                  },
              ]
            : []),
        {
            key: 'share',
            label: t('projectItem.share', 'Share'),
            onSelect: onShareClick,
        },
        ...(onEditClick
            ? [
                  {
                      key: 'edit',
                      label: t('common.edit', 'Edit'),
                      onSelect: onEditClick,
                      testId: 'project-edit',
                  },
              ]
            : []),
        ...(pageActions ?? []).map((action) => ({
            key: action.key,
            label: action.label,
            onSelect: action.onSelect,
        })),
        ...(onSaveAsTemplate
            ? [
                  {
                      key: 'template',
                      label: t(
                          'projectItem.saveAsTemplate',
                          'Save as Template'
                      ),
                      onSelect: onSaveAsTemplate,
                  },
              ]
            : []),
        ...(onImportClick
            ? [
                  {
                      key: 'import',
                      label: t(
                          'spreadsheet.menu.import',
                          'Import from spreadsheet…'
                      ),
                      onSelect: onImportClick,
                  },
              ]
            : []),
        ...(onExport
            ? [
                  {
                      key: 'export-xlsx',
                      label: t(
                          'spreadsheet.menu.exportExcel',
                          'Export to Excel'
                      ),
                      onSelect: () => onExport('xlsx'),
                  },
                  {
                      key: 'export-csv',
                      label: t('spreadsheet.menu.exportCsv', 'Export to CSV'),
                      onSelect: () => onExport('csv'),
                  },
              ]
            : []),
        ...(onLeaveClick && project.can_leave
            ? [
                  {
                      key: 'leave',
                      label: t('shares.leave.action', 'Leave'),
                      danger: true,
                      onSelect: onLeaveClick,
                      testId: 'project-leave',
                  },
              ]
            : []),
        ...(!fileBacked
            ? [
                  {
                      key: 'delete',
                      label: t('common.delete', 'Delete'),
                      danger: true,
                      onSelect: onDeleteClick,
                  },
              ]
            : []),
    ];

    return (
        <div className="mb-6 space-y-3">
            <div className={`space-y-3 pt-6 sm:space-y-4 ${PAGE_GUTTER}`}>
                {project.image_url && (
                    <div
                        className="h-28 overflow-hidden rounded-2xl sm:h-44"
                        data-testid="project-banner"
                    >
                        <img
                            src={getAssetPath(project.image_url)}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    </div>
                )}
                <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-start">
                    <button
                        type="button"
                        onClick={onEditBannerClick}
                        disabled={!onEditBannerClick}
                        className="group relative h-10 w-10 sm:h-14 sm:w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-4 ring-white dark:bg-gray-800 dark:ring-gray-900"
                        title={t('project.projectImage', 'Project image')}
                        aria-label={t('project.projectImage', 'Project image')}
                    >
                        <span
                            className="flex h-full w-full items-center justify-center"
                            style={{
                                backgroundColor: `color-mix(in srgb, ${tint} 18%, transparent)`,
                                color: tint,
                            }}
                        >
                            <EntityIcon
                                icon={project.icon}
                                className="h-7 w-7"
                                fallback={<FolderIcon className="h-7 w-7" />}
                            />
                        </span>
                        {onEditBannerClick && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <CameraIcon className="h-5 w-5" />
                            </span>
                        )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                            <div className="relative" ref={statusRef}>
                                <button
                                    type="button"
                                    onClick={() => setStatusOpen((v) => !v)}
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-opacity hover:opacity-80 ${getProjectStatusTint(project.status || 'not_started')}`}
                                    aria-haspopup="menu"
                                    aria-expanded={statusOpen}
                                    data-testid="project-status-trigger"
                                >
                                    {t(
                                        `projectStatus.${project.status || 'not_started'}`
                                    )}
                                    <ChevronDownIcon className="h-3 w-3" />
                                </button>
                                {statusOpen && (
                                    <div
                                        role="menu"
                                        className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md bg-white py-1 shadow-lg dark:bg-gray-800"
                                    >
                                        {PROJECT_STATUSES.map((status) => (
                                            <button
                                                key={status}
                                                type="button"
                                                role="menuitem"
                                                onClick={() =>
                                                    changeStatus(status)
                                                }
                                                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                                    status === project.status
                                                        ? 'text-gray-900 dark:text-gray-100'
                                                        : 'text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <span
                                                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${getProjectStatusTint(status)}`}
                                                >
                                                    {t(
                                                        `projectStatus.${status}`
                                                    )}
                                                </span>
                                                {status === project.status && (
                                                    <CheckIcon className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* A past due date reads like any other date. */}
                            {dueText && <span>{dueText}</span>}
                            {completedDate && (
                                <span data-testid="project-completed-on">
                                    {t(
                                        'project.completedOn',
                                        'Completed {{date}}',
                                        {
                                            date: format(completedDate, 'PP', {
                                                locale: getCurrentLocale(),
                                            }),
                                        }
                                    )}
                                </span>
                            )}
                            {/* A start already behind says nothing new; only a coming one shows. */}
                            {startDate && startsLater && (
                                <>
                                    {(dueText || completedDate) && (
                                        <span>·</span>
                                    )}
                                    <span>
                                        {t(
                                            'project.startsOn',
                                            'Starts {{date}}',
                                            {
                                                date: format(startDate, 'PP', {
                                                    locale: getCurrentLocale(),
                                                }),
                                            }
                                        )}
                                    </span>
                                </>
                            )}
                        </div>
                        {editingName ? (
                            <input
                                ref={nameRef}
                                type="text"
                                value={nameDraft}
                                maxLength={MAX_NAME_LENGTH}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onBlur={saveName}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        saveName();
                                    } else if (e.key === 'Escape') {
                                        setNameDraft(project.name);
                                        setEditingName(false);
                                    }
                                }}
                                className="-mx-1 w-full rounded-md bg-surface-high/70 px-1 text-headline font-extrabold leading-tight tracking-tight text-surface-on outline-none ring-2 ring-primary/40"
                                aria-label={t('project.name', 'Project Name')}
                                data-testid="project-name-input"
                            />
                        ) : (
                            <h1
                                onClick={() => {
                                    if (!nameLocked) setEditingName(true);
                                }}
                                title={
                                    nameLocked
                                        ? t(
                                              'todoMd.badgeTitle',
                                              'From a TODO.md file. Read-only here: edit the file instead.'
                                          )
                                        : t(
                                              'project.clickToEdit',
                                              'Click to edit'
                                          )
                                }
                                className="-mx-1 line-clamp-2 cursor-text rounded-md px-1 text-headline font-extrabold leading-tight tracking-tight text-surface-on transition-colors hover:bg-surface-high/60"
                                data-testid="project-name"
                            >
                                {project.name}
                            </h1>
                        )}
                        {fileBacked && (
                            <TodoMdProjectNote
                                path={project.source_path || ''}
                                onReread={onReread}
                            />
                        )}
                        {editingDescription ? (
                            <textarea
                                ref={descriptionRef}
                                value={descriptionDraft}
                                rows={Math.min(
                                    8,
                                    Math.max(
                                        2,
                                        descriptionDraft.split('\n').length
                                    )
                                )}
                                onChange={(e) =>
                                    setDescriptionDraft(e.target.value)
                                }
                                onBlur={saveDescription}
                                onKeyDown={(e) => {
                                    if (
                                        (e.metaKey || e.ctrlKey) &&
                                        e.key === 'Enter'
                                    ) {
                                        e.preventDefault();
                                        saveDescription();
                                    } else if (e.key === 'Escape') {
                                        setDescriptionDraft(
                                            project.description || ''
                                        );
                                        setEditingDescription(false);
                                    }
                                }}
                                placeholder={t(
                                    'forms.projectDescriptionPlaceholder',
                                    'Enter project description (optional)'
                                )}
                                className="-mx-1 block w-full max-w-3xl resize-none rounded-md bg-white/70 px-1 py-0.5 text-sm leading-relaxed text-gray-700 outline-none ring-2 ring-blue-500/40 dark:bg-gray-800/70 dark:text-gray-300"
                                aria-label={t(
                                    'forms.description',
                                    'Description'
                                )}
                                data-testid="project-description-input"
                            />
                        ) : (
                            <p
                                onClick={() => setEditingDescription(true)}
                                title={t(
                                    'project.clickToEdit',
                                    'Click to edit'
                                )}
                                className={`-mx-1 max-w-3xl cursor-text whitespace-pre-wrap rounded-md px-1 py-0.5 text-sm leading-relaxed transition-colors hover:bg-white/60 dark:hover:bg-gray-800/60 ${
                                    project.description
                                        ? 'text-gray-600 dark:text-gray-300'
                                        : 'text-gray-500 dark:text-gray-400'
                                }`}
                                data-testid="project-description"
                            >
                                {project.description ||
                                    t(
                                        'project.addDescription',
                                        'Add a description'
                                    )}
                            </p>
                        )}
                        {!editingDescription && (
                            <LinkPreviews
                                texts={[project.description]}
                                className="max-w-3xl"
                            />
                        )}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        {isDone ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={
                                    <ArrowUturnLeftIcon className="h-4 w-4" />
                                }
                                onClick={() => changeStatus('in_progress')}
                                data-testid="project-reopen"
                            >
                                {t('projects.reopen', 'Reopen')}
                            </Button>
                        ) : fileBacked ? null : (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={
                                    <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                }
                                onClick={() => changeStatus('done')}
                                data-testid="project-mark-complete"
                            >
                                {t('project.markComplete', 'Complete')}
                            </Button>
                        )}
                        <Menu
                            entries={menu}
                            testId="project-actions-menu"
                            trigger={(triggerProps) => (
                                <IconButton
                                    {...triggerProps}
                                    label={t(
                                        'project.moreOptions',
                                        'More options'
                                    )}
                                >
                                    <EllipsisHorizontalIcon />
                                </IconButton>
                            )}
                        />
                    </div>
                </div>

                {nextAction && !isDone && (
                    <p
                        className="truncate text-body-m text-surface-on"
                        data-testid="project-next-action"
                    >
                        {t('project.nextActionLine', 'Next action: {{name}}', {
                            name: nextAction.name,
                        })}
                    </p>
                )}

                {/* Before a first task is done (and with no dates to compare)
                    the bar would only say 0 %. */}
                {(doneCount > 0 || timeUsed !== null) && (
                    <div
                        title={
                            timeUsed !== null
                                ? t(
                                      'project.progressHint',
                                      'Bar: tasks done. Line: time passed between start and due date.'
                                  )
                                : undefined
                        }
                    >
                        <p className="text-body-m tabular-nums text-surface-on-variant">
                            {t(
                                'project.progressSummary',
                                'Project progress · {{done}} of {{total}} tasks done',
                                {
                                    done: doneCount,
                                    total: totalCount,
                                }
                            )}
                            {timeUsed !== null &&
                                ` · ${t('project.timeUsed', '{{percent}}% of time used', { percent: timeUsed })}`}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectHero;
