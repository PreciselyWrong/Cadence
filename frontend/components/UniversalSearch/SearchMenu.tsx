import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookmarkIcon } from '@heroicons/react/24/outline';
import FilterBadge from './FilterBadge';
import SearchResults, { SearchNavigation } from './SearchResults';
import { useToast } from '../Shared/ToastContext';
import { getApiPath } from '../../config/paths';
import { getCsrfToken } from '../../utils/csrfService';

interface SearchMenuProps {
    navRef: React.MutableRefObject<SearchNavigation | null>;
    searchQuery: string;
    selectedFilters: string[];
    onFilterToggle: (filter: string) => void;
    onClose: () => void;
}

const filterTypes = [
    {
        value: 'Task',
        labelKey: 'search.entityTypes.task',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    },
    {
        value: 'Project',
        labelKey: 'search.entityTypes.project',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    },
    {
        value: 'Area',
        labelKey: 'search.entityTypes.area',
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    },
    {
        value: 'Note',
        labelKey: 'search.entityTypes.note',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    },
];

const priorityOptions = [
    { value: 'high', labelKey: 'priority.high' },
    { value: 'medium', labelKey: 'priority.medium' },
    { value: 'low', labelKey: 'priority.low' },
];

const statusOptions = [
    { value: 'not_started', labelKey: 'task.status.notStarted' },
    { value: 'planned', labelKey: 'task.status.planned' },
    { value: 'in_progress', labelKey: 'task.status.inProgress' },
    { value: 'waiting', labelKey: 'task.status.waiting' },
    { value: 'done', labelKey: 'task.status.done' },
    { value: 'cancelled', labelKey: 'task.status.cancelled' },
];

const dueOptions = [
    { value: 'today', labelKey: 'dateIndicators.today' },
    { value: 'tomorrow', labelKey: 'dateIndicators.tomorrow' },
    { value: 'next_week', labelKey: 'dateIndicators.nextWeek' },
    { value: 'next_month', labelKey: 'dateIndicators.nextMonth' },
];

const deferOptions = [
    { value: 'today', labelKey: 'dateIndicators.today' },
    { value: 'tomorrow', labelKey: 'dateIndicators.tomorrow' },
    { value: 'next_week', labelKey: 'dateIndicators.nextWeek' },
    { value: 'next_month', labelKey: 'dateIndicators.nextMonth' },
];

const extrasOptions = [
    { value: 'recurring', labelKey: 'search.extrasFilter.isRecurring' },
    { value: 'not_recurring', labelKey: 'search.extrasFilter.isNotRecurring' },
    { value: 'overdue', labelKey: 'search.extrasFilter.isOverdue' },
    { value: 'has_content', labelKey: 'search.extrasFilter.hasContent' },
    { value: 'no_content', labelKey: 'search.extrasFilter.hasNoContent' },
    { value: 'deferred', labelKey: 'search.extrasFilter.isDeferred' },
    { value: 'not_deferred', labelKey: 'search.extrasFilter.isNotDeferred' },
    { value: 'has_tags', labelKey: 'search.extrasFilter.hasTags' },
    { value: 'no_tags', labelKey: 'search.extrasFilter.hasNoTags' },
    { value: 'no_due_date', labelKey: 'search.extrasFilter.hasNoDueDate' },
    {
        value: 'assigned_to_project',
        labelKey: 'search.extrasFilter.isAssignedToProject',
    },
    { value: 'no_project', labelKey: 'search.extrasFilter.hasNoProject' },
];

// Each extra and its opposite can't both apply, so picking one drops the other
const oppositeExtras: Record<string, string> = {
    recurring: 'not_recurring',
    not_recurring: 'recurring',
    has_content: 'no_content',
    no_content: 'has_content',
    deferred: 'not_deferred',
    not_deferred: 'deferred',
    has_tags: 'no_tags',
    no_tags: 'has_tags',
    assigned_to_project: 'no_project',
    no_project: 'assigned_to_project',
};

const SearchMenu: React.FC<SearchMenuProps> = ({
    navRef,
    searchQuery,
    selectedFilters,
    onFilterToggle,
    onClose,
}) => {
    const { t } = useTranslation();
    const { showSuccessToast, showErrorToast } = useToast();
    const [selectedPriority, setSelectedPriority] = useState<string | null>(
        null
    );
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [selectedDue, setSelectedDue] = useState<string | null>(null);
    const [selectedDefer, setSelectedDefer] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<
        Array<{ id: number; name: string }>
    >([]);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [viewName, setViewName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [counts, setCounts] = useState<Record<string, number>>({});

    // Fetch available tags
    useEffect(() => {
        const fetchTags = async () => {
            try {
                const response = await fetch(getApiPath('tags'), {
                    credentials: 'include',
                });
                if (response.ok) {
                    const tags = await response.json();
                    setAvailableTags(tags);
                }
            } catch (error) {
                console.error('Error fetching tags:', error);
            }
        };
        fetchTags();
    }, []);

    const handlePriorityToggle = (priority: string) => {
        setSelectedPriority(selectedPriority === priority ? null : priority);
    };

    const handleStatusToggle = (status: string) => {
        setSelectedStatus(selectedStatus === status ? null : status);
    };

    const handleDueToggle = (due: string) => {
        setSelectedDue(selectedDue === due ? null : due);
    };

    const handleDeferToggle = (defer: string) => {
        setSelectedDefer(selectedDefer === defer ? null : defer);
    };

    const handleTagToggle = (tagName: string) => {
        setSelectedTags((prev) =>
            prev.includes(tagName)
                ? prev.filter((t) => t !== tagName)
                : [...prev, tagName]
        );
        // A tag and "no tags" contradict each other, so picking a tag drops it
        setSelectedExtras((prev) => prev.filter((e) => e !== 'no_tags'));
    };

    const handleExtrasToggle = (extra: string) => {
        const isSelecting = !selectedExtras.includes(extra);
        setSelectedExtras((prev) =>
            prev.includes(extra)
                ? prev.filter((e) => e !== extra)
                : [...prev.filter((e) => e !== oppositeExtras[extra]), extra]
        );
        if (isSelecting && extra === 'no_tags') {
            setSelectedTags([]);
        }
    };

    const handleSaveView = async () => {
        if (!viewName.trim()) {
            setSaveError(t('search.viewNameRequired'));
            return;
        }

        setIsSaving(true);
        setSaveError('');

        try {
            const response = await fetch(getApiPath('views'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': await getCsrfToken(),
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: viewName.trim(),
                    search_query: searchQuery || null,
                    filters: selectedFilters,
                    priority: selectedPriority || null,
                    task_status: selectedStatus || null,
                    due: selectedDue || null,
                    defer: selectedDefer || null,
                    tags: selectedTags.length > 0 ? selectedTags : null,
                    extras: selectedExtras.length > 0 ? selectedExtras : null,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save view');
            }

            const savedView = await response.json();

            // Reset form
            setViewName('');
            setShowSaveForm(false);
            setSaveError('');

            // Show success toast with link to the view
            showSuccessToast(
                <div className="flex items-center gap-2">
                    <span>View saved successfully!</span>
                    <Link
                        to={`/views/${savedView.uid}`}
                        className="underline font-semibold hover:text-green-100"
                        onClick={onClose}
                    >
                        View now
                    </Link>
                </div>
            );

            // Notify sidebar to refresh
            window.dispatchEvent(new CustomEvent('viewUpdated'));
        } catch (err) {
            setSaveError(t('search.failedToSave'));
            showErrorToast('Failed to save view. Please try again.');
            console.error('Error saving view:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelSave = () => {
        setShowSaveForm(false);
        setViewName('');
        setSaveError('');
    };

    const hasActiveFilters =
        selectedFilters.length > 0 ||
        searchQuery.trim() ||
        selectedPriority ||
        selectedStatus ||
        selectedDue ||
        selectedDefer ||
        selectedTags.length > 0 ||
        selectedExtras.length > 0;

    const group = (
        label: string,
        children: React.ReactNode,
        testId?: string
    ) => (
        <div
            className="flex flex-wrap items-center gap-1.5"
            data-testid={testId}
        >
            <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300 mr-0.5">
                {label}
            </span>
            {children}
        </div>
    );

    return (
        <div
            className="fixed left-1/2 transform -translate-x-1/2 top-32 md:top-20 w-[95vw] md:w-[90vw] max-w-full md:max-w-4xl h-[75vh] md:h-[80vh] max-h-[600px] md:max-h-[700px] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col"
            onMouseDown={(e) => {
                // Prevent input blur on mobile when clicking inside the search menu
                e.preventDefault();
            }}
            onTouchStart={(e) => {
                // Prevent input blur on mobile when touching inside the search menu
                e.preventDefault();
            }}
        >
            {/* Filter chips: always visible, no accordion */}
            <div
                className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2 overflow-y-auto max-h-[40vh]"
                data-testid="search-filters"
            >
                <div className="flex flex-wrap gap-2">
                    {filterTypes.map((filter) => {
                        const count = counts[filter.value];
                        const label =
                            count !== undefined
                                ? `${t(`search.groups.${filter.value}`)} ${count}`
                                : t(`search.groups.${filter.value}`);
                        return (
                            <FilterBadge
                                key={filter.value}
                                name={label}
                                color={filter.color}
                                isSelected={selectedFilters.includes(
                                    filter.value
                                )}
                                onToggle={() => onFilterToggle(filter.value)}
                            />
                        );
                    })}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {group(
                        t('search.priorityFilter'),
                        priorityOptions.map((option) => (
                            <FilterBadge
                                key={option.value}
                                name={t(option.labelKey)}
                                isSelected={selectedPriority === option.value}
                                onToggle={() =>
                                    handlePriorityToggle(option.value)
                                }
                            />
                        ))
                    )}
                    {group(
                        t('search.dueFilter'),
                        dueOptions.map((option) => (
                            <FilterBadge
                                key={option.value}
                                name={t(option.labelKey)}
                                isSelected={selectedDue === option.value}
                                onToggle={() => handleDueToggle(option.value)}
                            />
                        ))
                    )}
                </div>

                <div className="flex items-center gap-4 text-xs">
                    <button
                        type="button"
                        onClick={() => setShowMoreFilters((open) => !open)}
                        aria-expanded={showMoreFilters}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        {showMoreFilters
                            ? t('search.fewerFilters', 'Fewer filters')
                            : t('search.moreFilters', 'More filters')}
                    </button>
                    {hasActiveFilters && !showSaveForm && (
                        <button
                            type="button"
                            onClick={() => setShowSaveForm(true)}
                            className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <BookmarkIcon className="h-4 w-4" />
                            <span>{t('search.saveAsSmartView')}</span>
                        </button>
                    )}
                </div>

                {showMoreFilters && (
                    <div className="space-y-2 pt-1">
                        {group(
                            t('search.statusFilter'),
                            statusOptions.map((option) => (
                                <FilterBadge
                                    key={option.value}
                                    name={t(option.labelKey)}
                                    isSelected={selectedStatus === option.value}
                                    onToggle={() =>
                                        handleStatusToggle(option.value)
                                    }
                                />
                            ))
                        )}
                        {group(
                            t('search.deferUntilFilter'),
                            deferOptions.map((option) => (
                                <FilterBadge
                                    key={option.value}
                                    name={t(option.labelKey)}
                                    isSelected={selectedDefer === option.value}
                                    onToggle={() =>
                                        handleDeferToggle(option.value)
                                    }
                                />
                            ))
                        )}
                        {availableTags.length > 0 &&
                            group(
                                t('search.tagsFilter'),
                                availableTags.map((tag) => (
                                    <FilterBadge
                                        key={tag.id}
                                        name={tag.name}
                                        color="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200"
                                        isSelected={selectedTags.includes(
                                            tag.name
                                        )}
                                        onToggle={() =>
                                            handleTagToggle(tag.name)
                                        }
                                    />
                                ))
                            )}
                        {group(
                            t('search.extras'),
                            extrasOptions.map((option) => (
                                <FilterBadge
                                    key={option.value}
                                    name={t(option.labelKey)}
                                    color="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                                    isSelected={selectedExtras.includes(
                                        option.value
                                    )}
                                    onToggle={() =>
                                        handleExtrasToggle(option.value)
                                    }
                                />
                            ))
                        )}
                    </div>
                )}

                {showSaveForm && (
                    <div className="space-y-3 pt-2">
                        <div>
                            <label
                                htmlFor="viewName"
                                className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >
                                {t('search.viewName')}{' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="viewName"
                                value={viewName}
                                onChange={(e) => {
                                    setViewName(e.target.value);
                                    setSaveError('');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveView();
                                    } else if (e.key === 'Escape') {
                                        handleCancelSave();
                                    }
                                }}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={t('search.viewNamePlaceholder')}
                                autoFocus
                            />
                            {saveError && (
                                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    {saveError}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={handleCancelSave}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            >
                                {t('search.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveView}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-xs font-medium text-primary-on bg-primary hover:bg-primary/90 disabled:bg-blue-400 rounded-md transition-colors"
                            >
                                {isSaving
                                    ? t('search.saving')
                                    : t('search.saveView')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <SearchResults
                navRef={navRef}
                searchQuery={searchQuery}
                selectedFilters={selectedFilters}
                selectedPriority={selectedPriority}
                selectedStatus={selectedStatus}
                selectedDue={selectedDue}
                selectedDefer={selectedDefer}
                selectedTags={selectedTags}
                selectedExtras={selectedExtras}
                onCounts={setCounts}
                onClose={onClose}
            />

            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-[12px] text-gray-600 dark:text-gray-300">
                {t(
                    'search.hint',
                    'Up and Down to move, Enter to open, Esc to close'
                )}
            </div>
        </div>
    );
};

export default SearchMenu;
