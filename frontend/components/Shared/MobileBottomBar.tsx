import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CalendarDaysIcon,
    ChartBarIcon,
    CheckCircleIcon,
    InboxIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import {
    CalendarDaysIcon as CalendarDaysSolid,
    ChartBarIcon as ChartBarSolid,
    CheckCircleIcon as CheckCircleSolid,
    InboxIcon as InboxSolid,
} from '@heroicons/react/24/solid';
import { openCapture } from '../../utils/captureUi';
import { useStore } from '../../store/useStore';
import HexagonIcon from './HexagonIcon';
import '../../styles/mobile-native.css';

type TabId = 'inbox' | 'tasks' | 'agenda' | 'habits' | 'review';

const TASK_PATHS =
    /^\/(today|tasks|upcoming|projects?|tags?|tasks?|areas?|views?|kanban|eisenhower|boards|goals?|notes?|people|person)(\/|$)/;

// Android's bottom pill bar: Boîte · Tâches · Agenda · Habitudes · Bilan.
export const activeTab = (pathname: string): TabId | null => {
    if (/^\/inbox(\/|$)/.test(pathname)) return 'inbox';
    if (/^\/calendar(\/|$)/.test(pathname)) return 'agenda';
    if (/^\/habits?(\/|$)/.test(pathname)) return 'habits';
    if (/^\/(review|insights)(\/|$)/.test(pathname)) return 'review';
    if (pathname === '/' || TASK_PATHS.test(pathname)) return 'tasks';
    return null;
};

// The floating add button only exists on Tâches and Boîte, like on Android.
export const fabTarget = (pathname: string): 'task' | 'inbox' | null => {
    if (/^\/inbox(\/|$)/.test(pathname)) return 'inbox';
    if (/^\/(today|tasks|upcoming)(\/|$)/.test(pathname) || pathname === '/') {
        return 'task';
    }
    return null;
};

interface Destination {
    id: TabId;
    to: string;
    label: string;
    icon: React.ReactNode;
    selectedIcon: React.ReactNode;
}

const MobileBottomBar: React.FC = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const habitsEnabled = useStore(
        (state) => state.userSettingsStore.habitsEnabled
    );
    const active = activeTab(pathname);
    const fab = fabTarget(pathname);
    const iconClass = 'h-6 w-6';

    const destinations: Destination[] = [
        {
            id: 'inbox',
            to: '/inbox',
            label: t('mobileNav.inbox', 'Inbox'),
            icon: <InboxIcon className={iconClass} />,
            selectedIcon: <InboxSolid className={iconClass} />,
        },
        {
            id: 'tasks',
            to: '/today',
            label: t('mobileNav.tasks', 'Tasks'),
            icon: <CheckCircleIcon className={iconClass} />,
            selectedIcon: <CheckCircleSolid className={iconClass} />,
        },
        {
            id: 'agenda',
            to: '/calendar',
            label: t('mobileNav.agenda', 'Agenda'),
            icon: <CalendarDaysIcon className={iconClass} />,
            selectedIcon: <CalendarDaysSolid className={iconClass} />,
        },
        ...(habitsEnabled
            ? [
                  {
                      id: 'habits' as const,
                      to: '/habits',
                      label: t('mobileNav.habits', 'Habits'),
                      icon: <HexagonIcon className={iconClass} />,
                      selectedIcon: (
                          <HexagonIcon className={iconClass} filled />
                      ),
                  },
              ]
            : []),
        {
            id: 'review',
            to: '/review',
            label: t('mobileNav.review', 'Review'),
            icon: <ChartBarIcon className={iconClass} />,
            selectedIcon: <ChartBarSolid className={iconClass} />,
        },
    ];

    return (
        <>
            {fab && (
                <button
                    type="button"
                    className="cdm-fab"
                    data-testid="mobile-fab"
                    aria-label={
                        fab === 'inbox'
                            ? t('navigation.quickInboxCapture', 'Quick capture')
                            : t('mobileNav.newTask', 'New task')
                    }
                    onClick={() => openCapture(fab)}
                >
                    <PlusIcon className="h-7 w-7" strokeWidth={2.2} />
                </button>
            )}
            <nav
                className="cdm-bar"
                aria-label={t('mobileNav.label', 'Main navigation')}
                data-testid="mobile-bottom-bar"
            >
                {destinations.map((destination) => {
                    const selected = destination.id === active;
                    return (
                        <a
                            key={destination.id}
                            href={destination.to}
                            className="cdm-item"
                            aria-current={selected ? 'page' : undefined}
                            onClick={(event) => {
                                if (
                                    event.metaKey ||
                                    event.ctrlKey ||
                                    event.shiftKey
                                ) {
                                    return;
                                }
                                event.preventDefault();
                                navigate(destination.to);
                            }}
                        >
                            {selected
                                ? destination.selectedIcon
                                : destination.icon}
                            <span>{destination.label}</span>
                        </a>
                    );
                })}
            </nav>
        </>
    );
};

export default MobileBottomBar;
