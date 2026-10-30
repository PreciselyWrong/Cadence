import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleIcon,
    FolderIcon,
    RectangleStackIcon,
    DocumentTextIcon,
    TagIcon,
} from '@heroicons/react/24/outline';
import { searchUniversal } from '../../utils/searchService';
import { focusKey, focusScopeParams, useFocus } from '../../utils/focus';
import { openTaskPanel } from '../../store/taskPanelStore';
import { searchDestination } from '../../utils/searchNavigation';

// Lets the search field drive the list: arrows move, Enter opens.
export interface SearchNavigation {
    move: (delta: number) => void;
    activate: () => void;
}

interface SearchResultsProps {
    navRef: React.MutableRefObject<SearchNavigation | null>;
    onCounts: (counts: Record<string, number>) => void;
    searchQuery: string;
    selectedFilters: string[];
    selectedPriority: string | null;
    selectedStatus: string | null;
    selectedDue: string | null;
    selectedDefer: string | null;
    selectedTags: string[];
    selectedExtras: string[];
    onClose: () => void;
}

interface SearchResult {
    type: 'Task' | 'Project' | 'Area' | 'Note' | 'Tag';
    id: number;
    uid?: string;
    name: string;
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
}

const SearchResults: React.FC<SearchResultsProps> = ({
    navRef,
    onCounts,
    searchQuery,
    selectedFilters,
    selectedPriority,
    selectedStatus,
    selectedDue,
    selectedDefer,
    selectedTags,
    selectedExtras,
    onClose,
}) => {
    const { t } = useTranslation();
    const focus = useFocus();
    const focusId = focusKey(focus);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchResults = async () => {
            if (
                !searchQuery.trim() &&
                selectedFilters.length === 0 &&
                !selectedPriority &&
                !selectedStatus &&
                !selectedDue &&
                !selectedDefer &&
                selectedTags.length === 0 &&
                selectedExtras.length === 0
            ) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            try {
                const data = await searchUniversal({
                    query: searchQuery,
                    filters: selectedFilters,
                    priority: selectedPriority || undefined,
                    taskStatus: selectedStatus || undefined,
                    due: selectedDue || undefined,
                    defer: selectedDefer || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    extras:
                        selectedExtras.length > 0 ? selectedExtras : undefined,
                    scope: focusScopeParams(focus),
                });
                setResults(data.results);
            } catch (error) {
                console.error('Search failed:', error);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        };

        const debounceTimer = setTimeout(fetchResults, 300);
        return () => clearTimeout(debounceTimer);
    }, [
        searchQuery,
        selectedFilters,
        selectedPriority,
        selectedStatus,
        selectedDue,
        selectedDefer,
        selectedTags,
        selectedExtras,
        focusId,
    ]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'Task':
                return <CheckCircleIcon className="h-5 w-5 text-blue-500" />;
            case 'Project':
                return <FolderIcon className="h-5 w-5 text-purple-500" />;
            case 'Area':
                return (
                    <RectangleStackIcon className="h-5 w-5 text-green-500" />
                );
            case 'Note':
                return <DocumentTextIcon className="h-5 w-5 text-yellow-500" />;
            case 'Tag':
                return <TagIcon className="h-5 w-5 text-pink-500" />;
            default:
                return null;
        }
    };

    const handleResultClick = (result: SearchResult) => {
        // Close the dropdown before navigating
        onClose();

        // Also close mobile search bar if on mobile
        if (window.innerWidth < 768) {
            window.dispatchEvent(new CustomEvent('closeMobileSearch'));
        }

        const destination = searchDestination(result);
        if (destination?.kind === 'task') openTaskPanel(destination.uid);
        else if (destination?.kind === 'path') navigate(destination.path);
    };

    const TYPE_ORDER = ['Task', 'Project', 'Area', 'Note', 'Tag'];
    const grouped = useMemo(() => {
        const byType: Record<string, SearchResult[]> = {};
        for (const result of results) {
            (byType[result.type] ??= []).push(result);
        }
        return TYPE_ORDER.filter((type) => byType[type]).map((type) => ({
            type,
            items: byType[type],
        }));
    }, [results]);
    const flat = useMemo(
        () => grouped.flatMap((entry) => entry.items),
        [grouped]
    );

    const [active, setActive] = useState(0);
    useEffect(() => {
        setActive(0);
    }, [results]);

    useEffect(() => {
        onCounts(
            Object.fromEntries(
                grouped.map((entry) => [entry.type, entry.items.length])
            )
        );
    }, [grouped, onCounts]);

    const flatRef = useRef(flat);
    flatRef.current = flat;
    const activeRef = useRef(active);
    activeRef.current = active;
    const clickRef = useRef(handleResultClick);
    clickRef.current = handleResultClick;
    useEffect(() => {
        navRef.current = {
            move: (delta) =>
                setActive((index) => {
                    const total = flatRef.current.length;
                    return total ? (index + delta + total) % total : 0;
                }),
            activate: () => {
                const result = flatRef.current[activeRef.current];
                if (result) clickRef.current(result);
            },
        };
        return () => {
            navRef.current = null;
        };
    }, [navRef]);

    useEffect(() => {
        document
            .querySelector('[data-search-active="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [active, flat]);

    if (isLoading) {
        return (
            <div
                className="p-8 text-center text-gray-500 dark:text-gray-400"
                data-testid="search-loading"
            >
                <div className="animate-pulse">
                    {t('search.searching', 'Searching...')}
                </div>
            </div>
        );
    }

    if (
        !searchQuery.trim() &&
        selectedFilters.length === 0 &&
        !selectedPriority &&
        !selectedStatus &&
        !selectedDue &&
        selectedTags.length === 0
    ) {
        return (
            <div
                className="p-8 text-center text-gray-500 dark:text-gray-400"
                data-testid="search-empty"
            >
                <p className="text-sm">{t('search.startTyping')}</p>
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div
                className="p-8 text-center text-gray-500 dark:text-gray-400"
                data-testid="search-no-results"
            >
                <p className="text-sm">{t('search.noResults')}</p>
            </div>
        );
    }

    let rowIndex = -1;
    return (
        <div className="flex-1 overflow-y-auto" data-testid="search-results">
            {grouped.map(({ type, items }) => (
                <div
                    key={type}
                    className="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    data-testid={`search-results-${type.toLowerCase()}`}
                >
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs font-semibold text-gray-600 dark:text-gray-400">
                        {t(`search.groups.${type}`)}
                        <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-500">
                            {items.length}
                        </span>
                    </div>
                    <div>
                        {items.map((result) => {
                            rowIndex += 1;
                            const isActive = rowIndex === active;
                            const index = rowIndex;
                            return (
                                <button
                                    key={`${result.type}-${result.id}`}
                                    onClick={() => handleResultClick(result)}
                                    onMouseMove={() => setActive(index)}
                                    data-search-active={isActive}
                                    className={`w-full px-4 py-3 flex items-center transition-colors text-left ${
                                        isActive
                                            ? 'bg-blue-50 dark:bg-blue-900/30'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                    data-testid={`search-result-${result.type.toLowerCase()}-${result.id}`}
                                >
                                    <div className="flex-shrink-0">
                                        {getIcon(result.type)}
                                    </div>
                                    <div className="ml-3 flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {result.name || result.title}
                                        </p>
                                        {result.description && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                {result.description}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SearchResults;
