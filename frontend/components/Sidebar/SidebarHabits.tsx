import React from 'react';
import { Location } from 'react-router-dom';
import { FireIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

interface SidebarHabitsProps {
    handleNavClick: (path: string, title: string, icon: JSX.Element) => void;
    location: Location;
    isDarkMode: boolean;
    openNewHabit: () => void;
}

const SidebarHabits: React.FC<SidebarHabitsProps> = ({
    handleNavClick,
    location,
}) => {
    const { t } = useTranslation();
    const isActiveHabit = (path: string) => {
        return location.pathname.startsWith(path)
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
            : 'text-gray-500 dark:text-gray-300';
    };

    return (
        <>
            <ul className="flex flex-col">
                <li
                    className={`group flex items-center rounded-[8px] px-[10px] py-[4px] text-[12px] tracking-[0.01em] font-semibold uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white ${isActiveHabit(
                        '/habits'
                    )}`}
                    onClick={() =>
                        handleNavClick(
                            '/habits',
                            'Habits',
                            <FireIcon className="h-5 w-5 mr-2" />
                        )
                    }
                >
                    <FireIcon className="h-[14px] w-[14px] mr-[6px] shrink-0" />
                    {t('sidebar.habits', 'Habits')}
                </li>
            </ul>
        </>
    );
};

export default SidebarHabits;
