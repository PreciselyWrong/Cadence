import React, { useEffect, useRef, useState } from 'react';
import { Link, Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    BookOpenIcon,
    CalendarDaysIcon,
    AdjustmentsHorizontalIcon,
    ArrowPathRoundedSquareIcon,
    ChartBarIcon,
    EllipsisHorizontalIcon,
    FireIcon,
    FlagIcon,
    InboxIcon,
    ListBulletIcon,
    QueueListIcon,
    RectangleStackIcon,
    ShieldCheckIcon,
    Squares2X2Icon,
    SunIcon,
    UserGroupIcon,
    UserIcon,
    UsersIcon,
    ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import { getAssetPath } from '../../config/paths';
import { useStore } from '../../store/useStore';
import type { SidebarVisibleSections } from '../Profile/types';
import SidebarPanelIcon from './SidebarPanelIcon';
import type { RailPlace } from '../../utils/minimalSidebar';

type RailItemId =
    | 'today'
    | 'inbox'
    | 'calendar'
    | 'notes'
    | 'habits'
    | 'views'
    | 'areas'
    | 'goals'
    | 'people'
    | 'insights'
    | 'review'
    | 'allTasks'
    | 'assignedToMe'
    | 'everyone'
    | 'boards'
    | 'templates'
    | 'access';

interface RailItem {
    id: RailItemId;
    path: string;
    match: RegExp;
    titleKey: string;
    title: string;
    Icon: typeof SunIcon;
}

const RAIL_ITEMS: Record<RailItemId, RailItem> = {
    today: {
        id: 'today',
        path: '/today',
        match: /^\/today/,
        titleKey: 'sidebar.today',
        title: 'Today',
        Icon: SunIcon,
    },
    inbox: {
        id: 'inbox',
        path: '/inbox',
        match: /^\/inbox$/,
        titleKey: 'sidebar.inbox',
        title: 'Inbox',
        Icon: InboxIcon,
    },
    calendar: {
        id: 'calendar',
        path: '/calendar',
        match: /^\/calendar$/,
        titleKey: 'sidebar.calendar',
        title: 'Calendar',
        Icon: CalendarDaysIcon,
    },
    notes: {
        id: 'notes',
        path: '/notes',
        match: /^\/notes?(\/|$)/,
        titleKey: 'sidebar.notes',
        title: 'Notes',
        Icon: BookOpenIcon,
    },
    habits: {
        id: 'habits',
        path: '/habits',
        match: /^\/habits?(\/|$)/,
        titleKey: 'sidebar.habits',
        title: 'Habits',
        Icon: FireIcon,
    },
    views: {
        id: 'views',
        path: '/views',
        match: /^\/views(\/|$)/,
        titleKey: 'sidebar.views',
        title: 'Views',
        Icon: QueueListIcon,
    },
    areas: {
        id: 'areas',
        path: '/areas',
        match: /^\/areas?(\/|$)/,
        titleKey: 'sidebar.areas',
        title: 'Areas',
        Icon: Squares2X2Icon,
    },
    goals: {
        id: 'goals',
        path: '/goals',
        match: /^\/goals?(\/|$)/,
        titleKey: 'sidebar.goals',
        title: 'Goals',
        Icon: FlagIcon,
    },
    people: {
        id: 'people',
        path: '/people',
        match: /^\/(people|person)(\/|$)/,
        titleKey: 'sidebar.people',
        title: 'People',
        Icon: UserGroupIcon,
    },
    insights: {
        id: 'insights',
        path: '/insights/productivity',
        match: /^\/insights(\/|$)/,
        titleKey: 'sidebar.insights',
        title: 'Insights',
        Icon: ChartBarIcon,
    },
    review: {
        id: 'review',
        path: '/review',
        match: /^\/review(\/|$)/,
        titleKey: 'review.title',
        title: 'Review',
        Icon: ArrowPathRoundedSquareIcon,
    },
    allTasks: {
        id: 'allTasks',
        path: '/tasks?status=active',
        match: /^\/tasks$/,
        titleKey: 'sidebar.allTasks',
        title: 'All Tasks',
        Icon: ListBulletIcon,
    },
    assignedToMe: {
        id: 'assignedToMe',
        path: '/tasks?assigned_to=me&status=active',
        match: /^\/tasks$/,
        titleKey: 'sidebar.assignedToMe',
        title: 'Assigned to me',
        Icon: UserIcon,
    },
    everyone: {
        id: 'everyone',
        path: '/everyone',
        match: /^\/everyone(\/|$)/,
        titleKey: 'sidebar.everyone',
        title: 'Everyone',
        Icon: UsersIcon,
    },
    boards: {
        id: 'boards',
        path: '/boards/eisenhower',
        match: /^\/boards(\/|$)/,
        titleKey: 'sidebar.boards',
        title: 'Boards',
        Icon: ViewColumnsIcon,
    },
    templates: {
        id: 'templates',
        path: '/templates',
        match: /^\/templates(\/|$)/,
        titleKey: 'navigation.templates',
        title: 'Templates',
        Icon: RectangleStackIcon,
    },
    access: {
        id: 'access',
        path: '/admin/users',
        match: /^\/admin\/users(\/|$)/,
        titleKey: 'admin.access.title',
        title: 'Access',
        Icon: ShieldCheckIcon,
    },
};

interface SidebarRailMinimalProps {
    handleNavClick: (path: string, title: string) => void;
    location: Location;
    canOpenAccess: boolean;
    // Only the collapsed rail shows the button that reopens the panel.
    onExpand?: () => void;
    // Opens the Profile sidebar tab where the layout is edited.
    onCustomize?: () => void;
}

const SidebarRailMinimal: React.FC<SidebarRailMinimalProps> = ({
    handleNavClick,
    location,
    canOpenAccess,
    onExpand,
    onCustomize,
}) => {
    const { t } = useTranslation();
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);

    const calendarEnabled = useStore(
        (state) => state.userSettingsStore.calendarEnabled
    );
    const habitsEnabled = useStore(
        (state) => state.userSettingsStore.habitsEnabled
    );
    const hasCollaborators = useStore(
        (state) => state.userSettingsStore.hasCollaborators
    );
    const templatesFeatureEnabled = useStore(
        (state) => state.userSettingsStore.templatesEnabled
    );
    const visibleSections = useStore(
        (state) => state.userSettingsStore.sidebarVisibleSections
    );
    // Where each item sits: on the rail, in More, or hidden (saved in the
    // Profile sidebar tab; the defaults keep the primary icons on the rail).
    const railSettings = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.rail
    );

    useEffect(() => {
        if (!isMoreOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!moreRef.current?.contains(event.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [isMoreOpen]);

    const isVisible = (id: RailItemId): boolean => {
        const shown = (key: keyof SidebarVisibleSections) =>
            visibleSections[key] !== false;
        switch (id) {
            case 'calendar':
                return calendarEnabled && shown('calendar');
            case 'habits':
                return habitsEnabled && shown('habits');
            case 'everyone':
                return hasCollaborators && shown('everyone');
            case 'templates':
                return templatesFeatureEnabled && shown('templates');
            case 'access':
                return canOpenAccess && shown('access');
            default:
                return shown(id as keyof SidebarVisibleSections);
        }
    };

    const itemTitle = (item: RailItem) => t(item.titleKey, item.title);

    const isActive = (item: RailItem) =>
        item.id === 'assignedToMe'
            ? location.pathname === '/tasks' &&
              location.search.includes('assigned_to=me')
            : item.id === 'allTasks'
              ? location.pathname === '/tasks' &&
                !location.search.includes('assigned_to=me')
              : item.match.test(location.pathname);

    const activeClass =
        'bg-blue-50 text-blue-600 dark:bg-[oklch(27%_0.02_250)] dark:text-[oklch(68%_0.14_250)]';
    const inactiveClass =
        'text-gray-500 hover:bg-gray-100 dark:text-[oklch(65%_0.006_95)] dark:hover:bg-[oklch(24%_0.015_250)]';

    const openItem = (item: RailItem) => {
        setIsMoreOpen(false);
        handleNavClick(item.path, itemTitle(item));
    };

    const placed = (place: RailPlace) =>
        railSettings
            .filter((item) => item.place === place && isVisible(item.key))
            .map((item) => RAIL_ITEMS[item.key]);
    const primary = placed('rail');
    const overflow = placed('more');

    return (
        <div className="flex flex-col items-center h-full pt-4 pb-3 w-rail flex-shrink-0">
            <Link
                to="/"
                className="flex items-center justify-center h-10 w-10 mb-1"
                aria-label="Cadence"
            >
                <img
                    src={getAssetPath('icon-logo.png')}
                    alt="Cadence"
                    className="h-7 w-7 rounded-md"
                />
            </Link>
            {onExpand && (
                <button
                    type="button"
                    onClick={onExpand}
                    className="mb-3 p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label="Expand Sidebar"
                    title="Expand Sidebar"
                    data-testid="sidebar-rail-expand"
                >
                    <SidebarPanelIcon className="h-5 w-5" />
                </button>
            )}

            <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1">
                {primary.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => openItem(item)}
                        title={itemTitle(item)}
                        aria-label={itemTitle(item)}
                        aria-current={isActive(item) ? 'page' : undefined}
                        data-testid={`sidebar-rail-${item.id}`}
                        className={`flex items-center justify-center h-9 w-9 rounded-[8px] transition-colors duration-150 ${
                            isActive(item) ? activeClass : inactiveClass
                        }`}
                    >
                        <item.Icon className="h-[18px] w-[18px]" />
                    </button>
                ))}

                {(overflow.length > 0 || onCustomize) && (
                    <div ref={moreRef} className="relative mt-1">
                        <button
                            type="button"
                            onClick={() => setIsMoreOpen((open) => !open)}
                            title={t('sidebar.more', 'More')}
                            aria-label={t('sidebar.more', 'More')}
                            aria-expanded={isMoreOpen}
                            data-testid="sidebar-rail-more"
                            className={`flex items-center justify-center h-9 w-9 rounded-[8px] transition-colors duration-150 ${inactiveClass}`}
                        >
                            <EllipsisHorizontalIcon className="h-[18px] w-[18px]" />
                        </button>
                        {isMoreOpen && (
                            <ul className="absolute left-full top-0 ml-2 z-50 min-w-[170px] py-1 rounded-[10px] border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                                {overflow.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => openItem(item)}
                                            data-testid={`sidebar-rail-more-${item.id}`}
                                            className={`w-full flex items-center gap-[8px] px-[10px] h-[34px] text-[14px] text-left rounded-[6px] mx-0 ${
                                                isActive(item)
                                                    ? activeClass
                                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <item.Icon className="h-[16px] w-[16px] flex-shrink-0" />
                                            {itemTitle(item)}
                                        </button>
                                    </li>
                                ))}
                                {onCustomize && (
                                    <li className="mt-1 border-t border-gray-200 pt-1 dark:border-gray-700">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMoreOpen(false);
                                                onCustomize();
                                            }}
                                            data-testid="sidebar-rail-customize"
                                            className="w-full flex items-center gap-[8px] px-[10px] h-[34px] text-[14px] text-left rounded-[6px] text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                        >
                                            <AdjustmentsHorizontalIcon className="h-[16px] w-[16px] flex-shrink-0" />
                                            {t(
                                                'sidebar.customize',
                                                'Customize sidebar'
                                            )}
                                        </button>
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SidebarRailMinimal;
