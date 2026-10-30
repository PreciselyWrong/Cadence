import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { Project } from '../../entities/Project';
import { searchUniversal } from '../../utils/searchService';
import { fetchHabits } from '../../utils/habitsService';
import { openCapture } from '../../utils/captureUi';
import {
    normalizeText,
    PaletteItem,
    pushRecentId,
    rankPaletteItems,
    readRecentIds,
} from '../../utils/commandPalette';
import { searchDestination, SearchTarget } from '../../utils/searchNavigation';
import {
    buildCommands,
    PaletteTaskActions,
    PaletteTarget,
    projectPickerItems,
} from './paletteCommands';

interface CommandPaletteProps {
    target: PaletteTarget | null;
    startStep: 'root' | 'project';
    projects: Project[];
    actions: PaletteTaskActions;
    onClose: () => void;
    onOpenHelp: () => void;
    onToggleTheme: () => void;
    onCreateProject: () => void;
    onCreateNote: () => void;
    onCreateHabit: () => void;
    onOpenTask: (uid: string) => void;
}

interface RecentEntity {
    id: string;
    title: string;
    subtitle?: string;
    type: SearchTarget['type'];
    uid: string;
}

const RECENT_ENTITIES_KEY = 'cadence:palette:recent-entities';
const MAX_RECENT_ENTITIES = 5;
const SEARCH_DEBOUNCE_MS = 200;

const readRecentEntities = (): RecentEntity[] => {
    try {
        const parsed = JSON.parse(
            window.localStorage.getItem(RECENT_ENTITIES_KEY) ?? '[]'
        );
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const pushRecentEntity = (entity: RecentEntity) => {
    try {
        const next = [
            entity,
            ...readRecentEntities().filter((x) => x.id !== entity.id),
        ].slice(0, MAX_RECENT_ENTITIES);
        window.localStorage.setItem(RECENT_ENTITIES_KEY, JSON.stringify(next));
    } catch {
        // Recents are a convenience.
    }
};

const GROUP_LABELS: Record<string, { key: string; fallback: string }> = {
    recent: { key: 'commandCenter.groups.recent', fallback: 'Recent' },
    task: { key: 'commandCenter.groups.task', fallback: 'This task' },
    create: { key: 'commandCenter.groups.create', fallback: 'Create' },
    go: { key: 'commandCenter.groups.go', fallback: 'Go to' },
    commands: { key: 'commandCenter.groups.commands', fallback: 'Commands' },
    projects: { key: 'commandCenter.groups.projects', fallback: 'Projects' },
    tasks: { key: 'commandCenter.groups.tasks', fallback: 'Tasks' },
    notes: { key: 'commandCenter.groups.notes', fallback: 'Notes' },
    habits: { key: 'commandCenter.groups.habits', fallback: 'Habits' },
};

const Keys: React.FC<{ keys?: string[] }> = ({ keys }) =>
    keys && keys.length > 0 ? (
        <span className="flex items-center gap-1 flex-shrink-0">
            {keys.map((key, index) => (
                <kbd
                    key={`${key}-${index}`}
                    className="min-w-[1.25rem] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-[11px] font-mono text-gray-500 dark:text-gray-300 text-center"
                >
                    {key}
                </kbd>
            ))}
        </span>
    ) : null;

const CommandPalette: React.FC<CommandPaletteProps> = ({
    target,
    startStep,
    projects,
    actions,
    onClose,
    onOpenHelp,
    onToggleTheme,
    onCreateProject,
    onCreateNote,
    onCreateHabit,
    onOpenTask,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [step, setStep] = useState<'root' | 'project'>(startStep);
    const [active, setActive] = useState(0);
    const [entities, setEntities] = useState<PaletteItem[]>([]);
    const [habits, setHabits] = useState<Array<{ uid: string; name: string }>>(
        []
    );
    const [recentIds] = useState(readRecentIds);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, [step]);

    useEffect(() => {
        let cancelled = false;
        fetchHabits()
            .then((list) => {
                if (cancelled) return;
                setHabits(
                    list
                        .filter((habit) => habit.uid)
                        .map((habit) => ({
                            uid: habit.uid as string,
                            name: habit.name,
                        }))
                );
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const openEntity = (
        type: SearchTarget['type'],
        uid: string,
        name: string,
        subtitle?: string
    ) => {
        pushRecentEntity({
            id: `${type}:${uid}`,
            title: name,
            subtitle,
            type,
            uid,
        });
        const destination = searchDestination({ type, uid, name });
        if (destination?.kind === 'task') onOpenTask(destination.uid);
        else if (destination?.kind === 'path') navigate(destination.path);
    };

    useEffect(() => {
        const text = query.trim();
        if (step !== 'root' || !text) {
            setEntities([]);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            searchUniversal({
                query: text,
                filters: ['Task', 'Project', 'Note'],
                limit: 12,
            })
                .then((response) => {
                    if (cancelled) return;
                    setEntities(
                        response.results
                            .filter((result) => result.uid)
                            .map((result) => {
                                const name = result.name || result.title || '';
                                const group =
                                    result.type === 'Task'
                                        ? 'tasks'
                                        : result.type === 'Project'
                                          ? 'projects'
                                          : 'notes';
                                return {
                                    id: `${result.type}:${result.uid}`,
                                    title: name,
                                    group,
                                    prematched: true,
                                    run: () =>
                                        openEntity(
                                            result.type,
                                            result.uid as string,
                                            name
                                        ),
                                } as PaletteItem;
                            })
                    );
                })
                .catch(() => {
                    if (!cancelled) setEntities([]);
                });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // openEntity only closes over stable props.
    }, [query, step]);

    const items = useMemo(() => {
        if (step === 'project' && target) {
            return rankPaletteItems(
                projectPickerItems(t, projects, (projectId) => {
                    void actions.moveToProject(target.uid, projectId);
                }),
                query,
                {}
            );
        }
        const commands = buildCommands({
            t,
            navigate,
            target,
            actions,
            openCapture: (kind) => openCapture(kind),
            openSearch: () =>
                window.dispatchEvent(new Event('openUniversalSearch')),
            openHelp: onOpenHelp,
            toggleTheme: onToggleTheme,
            createProject: onCreateProject,
            createNote: onCreateNote,
            createHabit: onCreateHabit,
            openTask: onOpenTask,
            pickProject: () => {
                setStep('project');
                setQuery('');
            },
        });
        const needle = normalizeText(query);
        const habitItems: PaletteItem[] = needle
            ? habits
                  .filter((habit) => normalizeText(habit.name).includes(needle))
                  .slice(0, 5)
                  .map((habit) => ({
                      id: `Habit:${habit.uid}`,
                      title: habit.name,
                      group: 'habits' as const,
                      prematched: true,
                      run: () => openEntity('Habit', habit.uid, habit.name),
                  }))
            : [];
        const recents: PaletteItem[] = needle
            ? []
            : readRecentEntities().map((entity) => ({
                  id: entity.id,
                  title: entity.title,
                  subtitle: entity.subtitle,
                  group: 'recent' as const,
                  run: () => openEntity(entity.type, entity.uid, entity.title),
              }));
        const ranked = rankPaletteItems(
            [...commands, ...entities, ...habitItems],
            query,
            { recentIds }
        );
        return needle ? ranked : [...recents, ...ranked];
    }, [
        step,
        query,
        target,
        projects,
        entities,
        habits,
        actions,
        recentIds,
        t,
    ]);

    useEffect(() => {
        setActive(0);
    }, [query, step]);

    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>('[data-active="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [active, items]);

    const run = (item: PaletteItem | undefined) => {
        if (!item) return;
        if (/^(create|go|cmd):/.test(item.id)) pushRecentId(item.id);
        // Moving to a project continues in the same palette
        if (item.id !== 'task:project') onClose();
        item.run();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) =>
                items.length ? (index + 1) % items.length : 0
            );
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) =>
                items.length ? (index - 1 + items.length) % items.length : 0
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(items[active]);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            if (step === 'project' && startStep === 'root') {
                setStep('root');
                setQuery('');
            } else {
                onClose();
            }
        } else if (event.key === 'Backspace' && !query && step === 'project') {
            event.preventDefault();
            setStep('root');
        } else if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onClose();
        }
    };

    const showHeadings = !query.trim() && step === 'root';
    const placeholder =
        step === 'project'
            ? t('commandCenter.pickProject', 'Move to which project?')
            : t('commandCenter.placeholder', 'Type a command or search...');

    return (
        <div
            className="fixed inset-0 z-[10200] flex items-start justify-center pt-[12vh] px-3"
            data-testid="command-palette"
        >
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-gray-900/30 dark:bg-black/60"
                onMouseDown={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('commandCenter.title', 'Command palette')}
                className="relative w-full max-w-[640px] rounded-xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden"
            >
                <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-700">
                    <MagnifyingGlassIcon
                        className="h-5 w-5 text-gray-400 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <input
                        ref={inputRef}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="command-palette-list"
                        aria-activedescendant={
                            items[active] ? `palette-item-${active}` : undefined
                        }
                        aria-label={placeholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        className="flex-1 h-12 bg-transparent border-0 outline-none focus:ring-0 text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-400"
                    />
                    {target?.name && step === 'root' && (
                        <span className="max-w-[10rem] truncate text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {target.name}
                        </span>
                    )}
                </div>
                <div
                    ref={listRef}
                    id="command-palette-list"
                    role="listbox"
                    className="max-h-[50vh] overflow-y-auto py-1"
                >
                    {items.length === 0 && (
                        <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            {t('commandCenter.empty', 'No results')}
                        </p>
                    )}
                    {items.map((item, index) => {
                        const previous = items[index - 1];
                        const heading =
                            showHeadings &&
                            (!previous || previous.group !== item.group)
                                ? GROUP_LABELS[item.group]
                                : null;
                        const isActive = index === active;
                        return (
                            <React.Fragment key={`${item.id}-${index}`}>
                                {heading && (
                                    <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t(heading.key, heading.fallback)}
                                    </div>
                                )}
                                <div
                                    id={`palette-item-${index}`}
                                    role="option"
                                    aria-selected={isActive}
                                    data-active={isActive}
                                    onMouseMove={() => setActive(index)}
                                    onClick={() => run(item)}
                                    className={`mx-1 flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ${
                                        isActive
                                            ? 'bg-blue-50 dark:bg-blue-900/30'
                                            : ''
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-sm text-gray-900 dark:text-gray-100">
                                            {item.title}
                                        </div>
                                        {item.subtitle && (
                                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                {item.subtitle}
                                            </div>
                                        )}
                                    </div>
                                    {!showHeadings &&
                                        GROUP_LABELS[item.group] && (
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
                                                {t(
                                                    GROUP_LABELS[item.group]
                                                        .key,
                                                    GROUP_LABELS[item.group]
                                                        .fallback
                                                )}
                                            </span>
                                        )}
                                    <Keys keys={item.shortcut} />
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
                <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>
                        {t(
                            'commandCenter.hintNav',
                            'Up and Down to move, Enter to run, Esc to close'
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
