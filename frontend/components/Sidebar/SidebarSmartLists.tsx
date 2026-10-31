import React, { useEffect, useState } from 'react';
import { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CalendarDaysIcon,
    InboxIcon,
    SunIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store/useStore';
import { loadInboxItemsToStore } from '../../utils/inboxService';
import {
    fetchSmartTaskCounts,
    SmartTaskCounts,
} from '../../utils/tasksService';
import {
    DROP_HIGHLIGHT_CLASS,
    dropTargetAttrs,
    useDropHover,
} from './sidebarDrop';

// A task dropped on Today or Tomorrow becomes due that day.
const DAY_TARGETS = new Set(['today', 'tomorrow']);

interface SidebarSmartListsProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
}

// The four lists that open at the top of the minimal sidebar, each with the
// number of open tasks it holds.
const SidebarSmartLists: React.FC<SidebarSmartListsProps> = ({
    handleNavClick,
    location,
}) => {
    const { t } = useTranslation();
    const [counts, setCounts] = useState<SmartTaskCounts | null>(null);
    const inboxCount = useStore((state) => state.inboxStore.pagination.total);
    // Which lists show, in what order, and which show a count badge.
    const config = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.smartLists
    );
    // Counts are only fetched when a visible badge needs one (Inbox has its
    // own count in the store).
    const needsCounts = config.some(
        (item) => item.visible && item.showCount && item.key !== 'inbox'
    );

    useEffect(() => {
        loadInboxItemsToStore(false).catch(console.error);
    }, []);

    // Refetch on every navigation so a task finished on another page is
    // reflected once the user moves on.
    useEffect(() => {
        if (!needsCounts) return;
        let cancelled = false;
        fetchSmartTaskCounts()
            .then((result) => {
                if (!cancelled) setCounts(result);
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [location.pathname, location.search, needsCounts]);

    const allRows = [
        {
            id: 'today',
            path: '/today',
            title: t('sidebar.today', 'Today'),
            icon: <SunIcon className="h-[16px] w-[16px]" />,
            count: counts?.today,
            isActive: location.pathname.startsWith('/today'),
        },
        {
            id: 'tomorrow',
            path: '/tasks?type=tomorrow',
            title: t('sidebar.tomorrow', 'Tomorrow'),
            icon: <CalendarDaysIcon className="h-[16px] w-[16px]" />,
            count: counts?.tomorrow,
            isActive:
                location.pathname === '/tasks' &&
                location.search.includes('type=tomorrow'),
        },
        {
            id: 'next7',
            path: '/upcoming?status=active',
            title: t('sidebar.next7Days', 'Next 7 days'),
            icon: <CalendarDaysIcon className="h-[16px] w-[16px]" />,
            count: counts?.next7,
            isActive: location.pathname === '/upcoming',
        },
        {
            id: 'inbox',
            path: '/inbox',
            title: t('sidebar.inbox', 'Inbox'),
            icon: <InboxIcon className="h-[16px] w-[16px]" />,
            count: inboxCount,
            isActive: location.pathname === '/inbox',
        },
    ];

    const isDropHover = useDropHover();

    const rowById = new Map(allRows.map((row) => [row.id, row]));
    const rows = config
        .filter((item) => item.visible && rowById.has(item.key))
        .map((item) => ({
            ...rowById.get(item.key)!,
            showCount: item.showCount,
        }));

    return (
        <ul className="flex flex-col gap-px" aria-label="Smart lists">
            {rows.map((row) => (
                <li key={row.id}>
                    <button
                        type="button"
                        onClick={() =>
                            handleNavClick(row.path, row.title, row.icon)
                        }
                        data-testid={`sidebar-smart-${row.id}`}
                        {...(DAY_TARGETS.has(row.id)
                            ? dropTargetAttrs('day', row.id)
                            : {})}
                        aria-current={row.isActive ? 'page' : undefined}
                        className={`w-full flex items-center gap-[8px] px-[10px] h-[34px] rounded-[8px] text-[14px] transition-colors duration-150 ${
                            row.isActive
                                ? 'bg-gray-200/70 dark:bg-gray-700 text-gray-900 dark:text-[oklch(90%_0.01_250)] font-medium'
                                : 'text-gray-700 dark:text-[oklch(75%_0.006_95)] hover:bg-gray-100 dark:hover:bg-gray-800'
                        } ${
                            isDropHover('day', row.id)
                                ? DROP_HIGHLIGHT_CLASS
                                : ''
                        }`}
                    >
                        <span
                            className={`flex-shrink-0 ${
                                row.isActive
                                    ? 'text-blue-600 dark:text-blue-300'
                                    : 'text-gray-600 dark:text-gray-300'
                            }`}
                        >
                            {row.icon}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-left">
                            {row.title}
                        </span>
                        {row.showCount && row.count !== undefined && (
                            <span className="text-[12px] tabular-nums text-gray-500 dark:text-gray-300">
                                {row.count > 99 ? '99+' : row.count}
                            </span>
                        )}
                    </button>
                </li>
            ))}
        </ul>
    );
};

export default SidebarSmartLists;
