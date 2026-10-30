import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SidebarVisibleSections } from '../types';
import SidebarLayoutEditor, { SidebarOrderGroup } from '../SidebarLayoutEditor';
import SidebarMinimalEditor from '../SidebarMinimalEditor';
import { useIsMinimal } from '../../../hooks/useUiDensity';

interface SidebarTabProps {
    isActive: boolean;
    isAdmin?: boolean;
    visibleSections: SidebarVisibleSections;
    linkOrder: string[];
    sectionOrder: string[];
    onToggleSection: (key: keyof SidebarVisibleSections) => void;
    onReorder: (group: SidebarOrderGroup, order: string[]) => void;
}

const SidebarTab: React.FC<SidebarTabProps> = ({
    isActive,
    isAdmin = false,
    visibleSections,
    linkOrder,
    sectionOrder,
    onToggleSection,
    onReorder,
}) => {
    const { t } = useTranslation();
    const isMinimal = useIsMinimal();

    if (!isActive) return null;

    return (
        <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('profile.tabs.sidebar', 'Sidebar')}
            </h3>

            {isMinimal ? (
                <>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                        {t(
                            'profile.sidebarMinimalHint',
                            'These settings change the Minimal sidebar only. Dense keeps its own layout.'
                        )}
                    </p>
                    <SidebarMinimalEditor isAdmin={isAdmin} />
                </>
            ) : (
                <>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                        {t(
                            'profile.sidebarLayoutDescription',
                            'This is a preview of your sidebar. Use the switches to choose what appears, and drag the handles to change the order.'
                        )}
                    </p>

                    <SidebarLayoutEditor
                        visibleSections={visibleSections}
                        linkOrder={linkOrder}
                        sectionOrder={sectionOrder}
                        isAdmin={isAdmin}
                        onToggleSection={onToggleSection}
                        onReorder={onReorder}
                    />

                    <p className="mt-4 text-xs text-gray-600 dark:text-gray-300">
                        {t(
                            'profile.sidebarLayoutHint',
                            'Templates and Access stay at the bottom. Items marked as off in Features stay hidden until you turn the feature on.'
                        )}
                    </p>
                </>
            )}
        </div>
    );
};

export default SidebarTab;
