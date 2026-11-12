import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import Button from '../Shared/ui/Button';
import {
    CalendarSpan,
    DEFAULT_VIEW_OPTIONS,
    GroupBy,
    NO_FILTERS,
    PlanMode,
    PlanViewOptions,
    SortBy,
} from './viewOptions';
import { countActiveFilters } from './filters';

export interface FilterProject {
    id: number | string;
    name: string;
    color?: string;
}

interface ViewMenuProps {
    options: PlanViewOptions;
    onChange: (next: PlanViewOptions) => void;
    /** False hides the Horizons layout (its data is not ready yet). */
    horizonsAvailable?: boolean;
    /** Projects offered by the Filter section. */
    projects?: FilterProject[];
    /** Tag names offered by the Filter section. */
    tags?: string[];
}

const PRIORITY_FILTERS = ['high', 'medium', 'low'] as const;

const GROUPS: GroupBy[] = ['none', 'project', 'priority', 'tag'];
const SORTS: SortBy[] = ['plan', 'time', 'priority', 'name', 'project'];
const SPANS: CalendarSpan[] = [1, 3, 7];

interface SegmentProps<T extends string | number> {
    label: string;
    value: T;
    choices: { value: T; label: string; disabled?: boolean }[];
    onSelect: (value: T) => void;
    disabled?: boolean;
}

// A row of toggle buttons: one choice is pressed at a time.
const Segmented = <T extends string | number>({
    label,
    value,
    choices,
    onSelect,
    disabled = false,
}: SegmentProps<T>) => (
    <div role="group" aria-label={label} className="flex gap-1">
        {choices.map((choice) => {
            const pressed = choice.value === value;
            return (
                <button
                    key={String(choice.value)}
                    type="button"
                    aria-pressed={pressed}
                    disabled={disabled || choice.disabled}
                    onClick={() => onSelect(choice.value)}
                    className={`inline-flex h-8 flex-1 items-center justify-center rounded-lg px-2 text-body-m transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40 ${
                        pressed
                            ? 'bg-primary-container text-primary-on-container'
                            : 'text-surface-on-variant ring-1 ring-inset ring-outline-variant hover:bg-surface-high hover:text-surface-on'
                    }`}
                >
                    {choice.label}
                </button>
            );
        })}
    </div>
);

const selectClass =
    'h-9 w-full rounded-lg bg-surface-high py-0 pl-2 pr-8 text-body-m leading-normal text-surface-on ring-1 ring-inset ring-outline-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

const rowClass = 'flex flex-col gap-1.5';

/**
 * "Display" popover of the Plan page: layout, grouping, sorting and what is
 * shown. Choices are applied at once; Escape or a click outside closes it.
 */
const ViewMenu: React.FC<ViewMenuProps> = ({
    options,
    onChange,
    horizonsAvailable = true,
    projects = [],
    tags = [],
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const activeFilters = countActiveFilters(options.filters);
    const priorityNames: Record<(typeof PRIORITY_FILTERS)[number], string> = {
        high: t('upcoming.filterHigh', 'High'),
        medium: t('upcoming.filterMedium', 'Medium'),
        low: t('upcoming.filterLow', 'Low'),
    };
    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const groupId = useId();
    const sortId = useId();

    const update = (patch: Partial<PlanViewOptions>) =>
        onChange({ ...options, ...patch });

    const updateFilters = (patch: Partial<PlanViewOptions['filters']>) =>
        update({ filters: { ...options.filters, ...patch } });

    const close = useCallback((restoreFocus: boolean) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event: MouseEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) {
                close(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close(true);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, close]);

    useEffect(() => {
        if (!open) return;
        panelRef.current
            ?.querySelector<HTMLElement>('button, select, input')
            ?.focus();
    }, [open]);

    const modeChoices: {
        value: PlanMode;
        label: string;
        disabled?: boolean;
    }[] = [
        { value: 'days', label: t('upcoming.days', 'Days') },
        {
            value: 'horizons',
            label: t('upcoming.horizons', 'Horizons'),
            disabled: !horizonsAvailable,
        },
    ];

    const spanChoices = SPANS.map((span) => ({
        value: span,
        label: String(span),
    }));

    return (
        <div ref={wrapperRef} className="relative inline-block">
            <Button
                ref={triggerRef}
                variant="ghost"
                size="sm"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() => setOpen((value) => !value)}
                icon={
                    <AdjustmentsHorizontalIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                    />
                }
            >
                {t('upcoming.view', 'Display')}
                {activeFilters > 0 && (
                    <span
                        aria-hidden="true"
                        className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-container px-1 text-[11px] font-medium text-primary-on-container"
                    >
                        {activeFilters}
                    </span>
                )}
            </Button>
            {open && (
                <div
                    ref={panelRef}
                    id={panelId}
                    role="dialog"
                    aria-label={t('upcoming.view', 'Display')}
                    className="absolute right-0 top-full z-50 mt-1 flex max-h-[70vh] w-72 flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-4 text-surface-on shadow-lg ring-1 ring-outline-variant/70"
                >
                    <div className={rowClass}>
                        <span className="text-label-m text-surface-on-variant">
                            {t('upcoming.layout', 'Layout')}
                        </span>
                        <Segmented<PlanMode>
                            label={t('upcoming.layout', 'Layout')}
                            value={options.mode}
                            choices={modeChoices}
                            onSelect={(mode) => update({ mode })}
                        />
                    </div>

                    <div className={rowClass}>
                        <label
                            htmlFor={groupId}
                            className="text-label-m text-surface-on-variant"
                        >
                            {t('upcoming.groupBy', 'Group by')}
                        </label>
                        <select
                            id={groupId}
                            className={selectClass}
                            value={options.groupBy}
                            onChange={(event) =>
                                update({
                                    groupBy: event.target.value as GroupBy,
                                })
                            }
                        >
                            {GROUPS.map((group) => (
                                <option key={group} value={group}>
                                    {t(
                                        `upcoming.group.${group}`,
                                        labelFor(group)
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={rowClass}>
                        <label
                            htmlFor={sortId}
                            className="text-label-m text-surface-on-variant"
                        >
                            {t('upcoming.sortBy', 'Sort by')}
                        </label>
                        <select
                            id={sortId}
                            className={selectClass}
                            value={options.sortBy}
                            onChange={(event) =>
                                update({ sortBy: event.target.value as SortBy })
                            }
                        >
                            {SORTS.map((sort) => (
                                <option key={sort} value={sort}>
                                    {t(
                                        `upcoming.sort.${sort}`,
                                        sortLabelFor(sort)
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Toggle
                            label={t(
                                'upcoming.showCompleted',
                                'Completed tasks'
                            )}
                            checked={options.showCompleted}
                            onChange={(showCompleted) =>
                                update({ showCompleted })
                            }
                        />
                        <Toggle
                            label={t('upcoming.showInbox', 'Inbox column')}
                            checked={options.showInbox}
                            onChange={(showInbox) => update({ showInbox })}
                        />
                        <Toggle
                            label={t('upcoming.showCalendar', 'Show calendar')}
                            checked={options.showCalendar}
                            onChange={(showCalendar) =>
                                update({ showCalendar })
                            }
                        />
                    </div>

                    <div className={rowClass}>
                        <span className="text-label-m text-surface-on-variant">
                            {t('upcoming.calendarSpan', 'Calendar days')}
                        </span>
                        <Segmented<CalendarSpan>
                            label={t('upcoming.calendarSpan', 'Calendar days')}
                            value={options.calendarSpan}
                            choices={spanChoices}
                            disabled={!options.showCalendar}
                            onSelect={(calendarSpan) =>
                                update({ calendarSpan })
                            }
                        />
                    </div>

                    <div className="flex flex-col gap-3 border-t border-outline-variant/60 pt-4">
                        <div className="flex items-center justify-between">
                            <span className="text-label-m text-surface-on-variant">
                                {t('upcoming.filter', 'Filter')}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={activeFilters === 0}
                                onClick={() =>
                                    update({ filters: { ...NO_FILTERS } })
                                }
                            >
                                {t('upcoming.clearFilters', 'Clear filters')}
                            </Button>
                        </div>

                        {projects.length > 0 && (
                            <ChipGroup
                                label={t('upcoming.filterProjects', 'Projects')}
                            >
                                {projects.map((project) => {
                                    const id = String(project.id);
                                    return (
                                        <Chip
                                            key={id}
                                            label={project.name}
                                            pressed={options.filters.projectIds.includes(
                                                id
                                            )}
                                            leading={
                                                project.color ? (
                                                    <span
                                                        aria-hidden="true"
                                                        className="h-2 w-2 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                project.color,
                                                        }}
                                                    />
                                                ) : undefined
                                            }
                                            onToggle={() =>
                                                updateFilters({
                                                    projectIds: toggled(
                                                        options.filters
                                                            .projectIds,
                                                        id
                                                    ),
                                                })
                                            }
                                        />
                                    );
                                })}
                            </ChipGroup>
                        )}

                        {tags.length > 0 && (
                            <ChipGroup label={t('upcoming.filterTags', 'Tags')}>
                                {tags.map((tag) => (
                                    <Chip
                                        key={tag}
                                        label={`#${tag}`}
                                        pressed={options.filters.tagNames.includes(
                                            tag
                                        )}
                                        onToggle={() =>
                                            updateFilters({
                                                tagNames: toggled(
                                                    options.filters.tagNames,
                                                    tag
                                                ),
                                            })
                                        }
                                    />
                                ))}
                            </ChipGroup>
                        )}

                        <ChipGroup
                            label={t('upcoming.filterPriority', 'Priority')}
                        >
                            {PRIORITY_FILTERS.map((level) => (
                                <Chip
                                    key={level}
                                    label={priorityNames[level]}
                                    pressed={options.filters.priorities.includes(
                                        level
                                    )}
                                    onToggle={() =>
                                        updateFilters({
                                            priorities: toggled(
                                                options.filters.priorities,
                                                level
                                            ),
                                        })
                                    }
                                />
                            ))}
                        </ChipGroup>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                onChange({ ...DEFAULT_VIEW_OPTIONS })
                            }
                        >
                            {t('upcoming.reset', 'Reset')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

// The list without value when it is in it, else with value added at the end.
const toggled = (list: string[], value: string): string[] =>
    list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value];

interface ChipGroupProps {
    label: string;
    children: React.ReactNode;
}

// A wrapping row of multi-select chips.
const ChipGroup: React.FC<ChipGroupProps> = ({ label, children }) => (
    <div className="flex flex-col gap-1.5">
        <span className="text-label-m text-surface-on-variant">{label}</span>
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
            {children}
        </div>
    </div>
);

interface ChipProps {
    label: string;
    pressed: boolean;
    onToggle: () => void;
    leading?: React.ReactNode;
}

const Chip: React.FC<ChipProps> = ({ label, pressed, onToggle, leading }) => (
    <button
        type="button"
        aria-pressed={pressed}
        onClick={onToggle}
        className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-body-m transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            pressed
                ? 'bg-primary-container text-primary-on-container'
                : 'text-surface-on-variant ring-1 ring-inset ring-outline-variant hover:bg-surface-high hover:text-surface-on'
        }`}
    >
        {leading}
        <span className="truncate">{label}</span>
    </button>
);

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange }) => (
    <label className="flex min-h-[32px] cursor-pointer items-center justify-between gap-3 text-body-m text-surface-on">
        <span>{label}</span>
        <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
        />
    </label>
);

// English fallbacks, used only when the translation is missing.
const labelFor = (group: GroupBy): string =>
    ({ none: 'None', project: 'Project', priority: 'Priority', tag: 'Tag' })[
        group
    ];

const sortLabelFor = (sort: SortBy): string =>
    ({
        plan: 'Plan order',
        time: 'Time',
        priority: 'Priority',
        name: 'Name',
        project: 'Project',
    })[sort];

export default ViewMenu;
