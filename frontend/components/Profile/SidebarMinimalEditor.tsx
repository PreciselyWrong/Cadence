import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { saveMinimalSidebarSettings } from '../../utils/sidebarSettingsService';
import {
    DEFAULT_MINIMAL_SIDEBAR,
    RAIL_PLACES,
    RailId,
    RailPlace,
    SectionBadgeId,
    SmartListId,
    moveItem,
} from '../../utils/minimalSidebar';

interface SidebarMinimalEditorProps {
    isAdmin: boolean;
}

// Labels for the editor only; the sidebar itself reads the same strings.
const SMART_LIST_LABELS: Record<SmartListId, [string, string]> = {
    today: ['sidebar.today', 'Today'],
    tomorrow: ['sidebar.tomorrow', 'Tomorrow'],
    next7: ['sidebar.next7Days', 'Next 7 days'],
    inbox: ['sidebar.inbox', 'Inbox'],
};

const RAIL_LABELS: Record<RailId, [string, string]> = {
    today: ['sidebar.today', 'Today'],
    inbox: ['sidebar.inbox', 'Inbox'],
    calendar: ['sidebar.calendar', 'Calendar'],
    notes: ['sidebar.notes', 'Notes'],
    habits: ['sidebar.habits', 'Habits'],
    views: ['sidebar.views', 'Views'],
    areas: ['sidebar.areas', 'Areas'],
    goals: ['sidebar.goals', 'Goals'],
    people: ['sidebar.people', 'People'],
    insights: ['sidebar.insights', 'Insights'],
    allTasks: ['sidebar.allTasks', 'All Tasks'],
    assignedToMe: ['sidebar.assignedToMe', 'Assigned to me'],
    everyone: ['sidebar.everyone', 'Everyone'],
    boards: ['sidebar.boards', 'Boards'],
    templates: ['navigation.templates', 'Templates'],
    access: ['admin.access.title', 'Access'],
};

const BADGE_LABELS: Record<
    Exclude<SectionBadgeId, 'favorites'>,
    [string, string]
> = {
    projects: ['sidebar.projects', 'Projects'],
    areas: ['sidebar.areas', 'Areas'],
    tags: ['sidebar.tags', 'Tags'],
};

const PLACE_LABELS: Record<RailPlace, [string, string]> = {
    rail: ['profile.sidebarPlaceRail', 'Icon rail'],
    more: ['profile.sidebarPlaceMore', 'More menu'],
    hidden: ['profile.sidebarPlaceHidden', 'Hidden'],
};

const buttonClass =
    'rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10';

// Edits the Minimal sidebar only: smart lists, icon rail placement and the
// count badges. Every change saves at once, through the profile endpoint.
const SidebarMinimalEditor: React.FC<SidebarMinimalEditorProps> = ({
    isAdmin,
}) => {
    const { t } = useTranslation();
    const settings = useStore(
        (state) => state.userSettingsStore.sidebarMinimal
    );

    const save = (patch: Parameters<typeof saveMinimalSidebarSettings>[0]) => {
        saveMinimalSidebarSettings(patch).catch(console.error);
    };

    const label = ([key, fallback]: [string, string]) => t(key, fallback);

    const smartLists = settings.smartLists;

    const updateSmartList = (
        index: number,
        change: Partial<{ visible: boolean; showCount: boolean }>
    ) => {
        save({
            smartLists: smartLists.map((item, i) =>
                i === index ? { ...item, ...change } : item
            ),
        });
    };

    const moveSmartList = (index: number, delta: -1 | 1) => {
        save({ smartLists: moveItem(smartLists, index, delta) });
    };

    const updateRailPlace = (index: number, place: RailPlace) => {
        save({
            rail: settings.rail.map((item, i) =>
                i === index ? { ...item, place } : item
            ),
        });
    };

    const moveRail = (index: number, delta: -1 | 1) => {
        save({ rail: moveItem(settings.rail, index, delta) });
    };

    const badgeKeys = Object.keys(BADGE_LABELS) as Exclude<
        SectionBadgeId,
        'favorites'
    >[];

    return (
        <div data-testid="sidebar-minimal-editor" className="space-y-6">
            <section>
                <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('profile.sidebarSmartListsTitle', 'Smart lists')}
                </h4>
                <ul className="space-y-1">
                    {smartLists.map((item, index) => {
                        const name = label(SMART_LIST_LABELS[item.key]);
                        return (
                            <li
                                key={item.key}
                                className="flex flex-wrap items-center gap-3 text-sm"
                            >
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={item.visible}
                                        aria-label={t(
                                            'profile.sidebarShowItem',
                                            'Show {{name}}',
                                            { name }
                                        )}
                                        onChange={(event) =>
                                            updateSmartList(index, {
                                                visible: event.target.checked,
                                            })
                                        }
                                    />
                                    <span>{name}</span>
                                </label>
                                <label className="flex items-center gap-2 text-gray-500">
                                    <input
                                        type="checkbox"
                                        checked={item.showCount}
                                        aria-label={t(
                                            'profile.sidebarShowCount',
                                            'Show count for {{name}}',
                                            { name }
                                        )}
                                        onChange={(event) =>
                                            updateSmartList(index, {
                                                showCount: event.target.checked,
                                            })
                                        }
                                    />
                                    <span>
                                        {t(
                                            'profile.sidebarCountBadge',
                                            'Count'
                                        )}
                                    </span>
                                </label>
                                <span className="ml-auto flex gap-1">
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        aria-label={t(
                                            'profile.sidebarMoveUp',
                                            'Move {{name}} up',
                                            { name }
                                        )}
                                        disabled={index === 0}
                                        onClick={() => moveSmartList(index, -1)}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        aria-label={t(
                                            'profile.sidebarMoveDown',
                                            'Move {{name}} down',
                                            { name }
                                        )}
                                        disabled={
                                            index === smartLists.length - 1
                                        }
                                        onClick={() => moveSmartList(index, 1)}
                                    >
                                        ↓
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section>
                <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('profile.sidebarRailTitle', 'Icon rail and More')}
                </h4>
                <ul className="space-y-1">
                    {settings.rail.map((item, index) => {
                        if (!isAdmin && item.key === 'access') return null;
                        const name = label(RAIL_LABELS[item.key]);
                        const isFirst = index === 0;
                        return (
                            <li
                                key={item.key}
                                className="flex flex-wrap items-center gap-3 text-sm"
                            >
                                <span className="min-w-[8rem]">{name}</span>
                                <select
                                    aria-label={t(
                                        'profile.sidebarPlace',
                                        'Place of {{name}}',
                                        { name }
                                    )}
                                    value={item.place}
                                    onChange={(event) =>
                                        updateRailPlace(
                                            index,
                                            event.target.value as RailPlace
                                        )
                                    }
                                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800"
                                >
                                    {RAIL_PLACES.map((place) => (
                                        <option key={place} value={place}>
                                            {label(PLACE_LABELS[place])}
                                        </option>
                                    ))}
                                </select>
                                <span className="ml-auto flex gap-1">
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        aria-label={t(
                                            'profile.sidebarMoveUp',
                                            'Move {{name}} up',
                                            { name }
                                        )}
                                        disabled={isFirst}
                                        onClick={() => moveRail(index, -1)}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        aria-label={t(
                                            'profile.sidebarMoveDown',
                                            'Move {{name}} down',
                                            { name }
                                        )}
                                        disabled={
                                            index === settings.rail.length - 1
                                        }
                                        onClick={() => moveRail(index, 1)}
                                    >
                                        ↓
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section>
                <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('profile.sidebarBadgesTitle', 'Count badges')}
                </h4>
                <ul className="space-y-1">
                    {badgeKeys.map((key) => {
                        const name = label(BADGE_LABELS[key]);
                        return (
                            <li key={key}>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={settings.sectionBadges[key]}
                                        aria-label={t(
                                            'profile.sidebarShowCount',
                                            'Show count for {{name}}',
                                            { name }
                                        )}
                                        onChange={(event) =>
                                            save({
                                                sectionBadges: {
                                                    ...settings.sectionBadges,
                                                    [key]: event.target.checked,
                                                },
                                            })
                                        }
                                    />
                                    <span>{name}</span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <div>
                <button
                    type="button"
                    onClick={() =>
                        save({
                            smartLists: DEFAULT_MINIMAL_SIDEBAR.smartLists,
                            rail: DEFAULT_MINIMAL_SIDEBAR.rail,
                            sectionBadges:
                                DEFAULT_MINIMAL_SIDEBAR.sectionBadges,
                        })
                    }
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/5"
                >
                    {t('profile.sidebarReset', 'Reset to default')}
                </button>
            </div>
        </div>
    );
};

export default SidebarMinimalEditor;
