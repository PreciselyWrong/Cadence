import React from 'react';
import { Location } from 'react-router-dom';
import { RectangleStackIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { canOpenAccess } from '../../entities/Role';

interface SidebarAdminProps {
    handleNavClick: (path: string, title: string) => void;
    location: Location;
    currentUser: { is_admin?: boolean; role?: string };
}

const SidebarAdmin: React.FC<SidebarAdminProps> = ({
    handleNavClick,
    location,
    currentUser,
}) => {
    const { t } = useTranslation();
    const templatesFeatureEnabled = useStore(
        (state) => state.userSettingsStore.templatesEnabled
    );
    const visibleSections = useStore(
        (state) => state.userSettingsStore.sidebarVisibleSections
    );
    const templatesEnabled =
        templatesFeatureEnabled && visibleSections.templates !== false;
    const accessVisible =
        canOpenAccess(currentUser) && visibleSections.access !== false;

    if (!templatesEnabled && !accessVisible) {
        return null;
    }

    const linkClass = (path: string) => {
        const isActive = location.pathname.startsWith(path);
        return `flex items-center rounded-[8px] px-[10px] py-[4px] text-[12px] tracking-[0.01em] font-semibold uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white ${
            isActive
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-300'
        }`;
    };

    return (
        <ul className="flex flex-col gap-1">
            {templatesEnabled && (
                <li
                    className={linkClass('/templates')}
                    onClick={() =>
                        handleNavClick(
                            '/templates',
                            t('navigation.templates', 'Templates')
                        )
                    }
                >
                    <RectangleStackIcon className="h-[14px] w-[14px] mr-[6px] shrink-0" />
                    {t('navigation.templates', 'Templates')}
                </li>
            )}
            {accessVisible && (
                <li
                    className={linkClass('/admin/users')}
                    onClick={() =>
                        handleNavClick(
                            '/admin/users',
                            t('admin.access.title', 'Access')
                        )
                    }
                >
                    <UsersIcon className="h-[14px] w-[14px] mr-[6px] shrink-0" />
                    {t('admin.access.title', 'Access')}
                </li>
            )}
        </ul>
    );
};

export default SidebarAdmin;
