import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAssetPath } from '../config/paths';
import { Area } from '../entities/Area';
import { Note } from '../entities/Note';
import { Tag } from '../entities/Tag';
import { Person } from '../entities/Person';
import SidebarAreas from './Sidebar/SidebarAreas';
import SidebarFooter from './Sidebar/SidebarFooter';
import SidebarTrialCard from './Billing/SidebarTrialCard';
import SidebarNav from './Sidebar/SidebarNav';
import SidebarNotes from './Sidebar/SidebarNotes';
import SidebarHabits from './Sidebar/SidebarHabits';
import SidebarProjects from './Sidebar/SidebarProjects';
import SidebarTags from './Sidebar/SidebarTags';
import SidebarGoals from './Sidebar/SidebarGoals';
import SidebarViews from './Sidebar/SidebarViews';
import SidebarPeople from './Sidebar/SidebarPeople';
import SidebarBoards from './Sidebar/SidebarBoards';
import SidebarInsights from './Sidebar/SidebarInsights';
import SidebarAdmin from './Sidebar/SidebarAdmin';
import SidebarBookmarks from './Sidebar/SidebarBookmarks';
import SidebarResizeHandle from './Sidebar/SidebarResizeHandle';
import SidebarPanelIcon from './Sidebar/SidebarPanelIcon';
import SidebarRail from './Sidebar/SidebarRail';
import SidebarRailMinimal from './Sidebar/SidebarRailMinimal';
import SidebarSmartLists from './Sidebar/SidebarSmartLists';
import { useIsMinimal } from '../hooks/useUiDensity';
import { canOpenAccess } from '../entities/Role';
import { KeyboardShortcutsConfig } from '../utils/keyboardShortcutsService';
import { useStore } from '../store/useStore';
import type { SidebarVisibleSections } from './Profile/types';
import { sidebarPercentToRem } from '../utils/sidebarWidth';
import type { SidebarSectionId } from '../utils/sidebarLayout';
import type { RailId } from '../utils/minimalSidebar';

interface SidebarProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
    currentUser: {
        email: string;
        is_admin?: boolean;
        role?: string;
        avatar_image?: string;
    };
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    openTaskModal: () => void;
    openProjectModal: () => void;
    onCreateNote: () => void;
    openAreaModal: (area: Area | null) => void;
    openGoalModal: () => void;
    openTagModal: (tag: Tag | null) => void;
    openPersonModal: (person: Person | null) => void;
    openNewHabit: () => void;
    notes: Note[];
    areas: Area[];
    tags: Tag[];
    keyboardShortcuts?: KeyboardShortcutsConfig | null;
}

// The sidebar sits on the app canvas; the page is a panel beside it.
export const SIDEBAR_CANVAS = 'bg-gray-200 dark:bg-gray-900';

// Minimal keeps only these lists in the panel; the rest live in the icon rail.
const MINIMAL_LIST_SECTIONS: SidebarSectionId[] = [
    'favorites',
    'projects',
    'areas',
    'tags',
];

const Sidebar: React.FC<SidebarProps> = ({
    isSidebarOpen,
    setIsSidebarOpen,
    currentUser,
    isDarkMode,
    toggleDarkMode,
    openTaskModal,
    openProjectModal,
    onCreateNote,
    openAreaModal,
    openGoalModal,
    openTagModal,
    openPersonModal,
    openNewHabit,
    notes,
    areas,
    tags,
    keyboardShortcuts,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const habitsEnabled = useStore(
        (state) => state.userSettingsStore.habitsEnabled
    );
    const visibleSections = useStore(
        (state) => state.userSettingsStore.sidebarVisibleSections
    );
    const widthPercent = useStore(
        (state) => state.userSettingsStore.sidebarWidthPercent
    );

    useEffect(() => {
        document.documentElement.style.setProperty(
            '--sidebar-width',
            `${sidebarPercentToRem(widthPercent)}rem`
        );
    }, [widthPercent]);

    const sectionOrder = useStore(
        (state) => state.userSettingsStore.sidebarSectionOrder
    );
    const isMinimal = useIsMinimal();
    const smartLists = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.smartLists
    );
    const isSectionVisible = (key: keyof SidebarVisibleSections) =>
        visibleSections[key] !== false;

    // With the panel open, the minimal rail skips the entries the panel
    // already lists (smart lists at the top, Areas among the sections).
    const railIdsListedInPanel = (): RailId[] => {
        const ids: RailId[] = [];
        for (const item of smartLists) {
            if (!item.visible) continue;
            if (item.key === 'today' || item.key === 'inbox') {
                ids.push(item.key);
            }
        }
        if (
            sectionOrder.includes('areas') &&
            MINIMAL_LIST_SECTIONS.includes('areas') &&
            isSectionVisible('areas')
        ) {
            ids.push('areas');
        }
        return ids;
    };

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const toggleDropdown = () => {
        setIsDropdownOpen(!isDropdownOpen);
    };

    const handleNavClick = (path: string, title: string) => {
        navigate(path, { state: { title } });
        if (window.innerWidth < 1024) {
            setIsSidebarOpen(false);
        }
    };

    // The Minimal layout is edited in the Profile sidebar tab.
    const openSidebarSettings = () =>
        handleNavClick('/profile?section=sidebar', 'Profile');

    const sectionElements: Record<SidebarSectionId, JSX.Element> = {
        favorites: (
            <SidebarBookmarks
                handleNavClick={handleNavClick}
                location={location}
            />
        ),
        projects: (
            <SidebarProjects
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={isDarkMode}
                openProjectModal={openProjectModal}
            />
        ),
        areas: (
            <SidebarAreas
                handleNavClick={handleNavClick}
                areas={areas}
                location={location}
                isDarkMode={isDarkMode}
                openAreaModal={openAreaModal}
            />
        ),
        goals: (
            <SidebarGoals
                handleNavClick={handleNavClick}
                location={location}
                openGoalModal={openGoalModal}
            />
        ),
        notes: (
            <SidebarNotes
                handleNavClick={handleNavClick}
                onCreateNote={onCreateNote}
                notes={notes}
                location={location}
                isDarkMode={isDarkMode}
            />
        ),
        tags: (
            <SidebarTags
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={isDarkMode}
                openTagModal={openTagModal}
                tags={tags}
            />
        ),
        people: (
            <SidebarPeople
                handleNavClick={handleNavClick}
                location={location}
                openPersonModal={openPersonModal}
            />
        ),
        habits: (
            <SidebarHabits
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={isDarkMode}
                openNewHabit={openNewHabit}
            />
        ),
        views: (
            <SidebarViews
                handleNavClick={handleNavClick}
                location={location}
                isDarkMode={isDarkMode}
            />
        ),
        boards: (
            <SidebarBoards
                handleNavClick={handleNavClick}
                location={location}
            />
        ),
        insights: (
            <SidebarInsights
                handleNavClick={handleNavClick}
                location={location}
            />
        ),
    };

    return (
        <div
            className={`fixed top-0 left-0 ${isSidebarOpen ? 'w-full sm:w-sidebar' : 'w-0 invisible sm:w-rail sm:visible'} h-screen overflow-hidden ${SIDEBAR_CANVAS} text-gray-900 dark:text-white transition-width duration-300 ease-in-out z-40`}
        >
            {/* Collapsed on tablet and desktop: an icon rail */}
            {!isSidebarOpen && (
                <div className="hidden sm:block h-full">
                    {isMinimal ? (
                        <SidebarRailMinimal
                            handleNavClick={handleNavClick}
                            location={location}
                            canOpenAccess={canOpenAccess(currentUser)}
                            onExpand={() => setIsSidebarOpen(true)}
                            onCustomize={openSidebarSettings}
                        />
                    ) : (
                        <SidebarRail
                            handleNavClick={handleNavClick}
                            location={location}
                            isDarkMode={isDarkMode}
                            openTaskModal={openTaskModal}
                            onExpand={() => setIsSidebarOpen(true)}
                        />
                    )}
                </div>
            )}
            {isSidebarOpen && (
                <div className={isMinimal ? 'flex h-full' : 'contents'}>
                    {isMinimal && (
                        <SidebarRailMinimal
                            handleNavClick={handleNavClick}
                            location={location}
                            canOpenAccess={canOpenAccess(currentUser)}
                            onCustomize={openSidebarSettings}
                            hiddenIds={railIdsListedInPanel()}
                        />
                    )}
                    <div
                        className={
                            isMinimal
                                ? 'flex flex-col h-full min-w-0 flex-1'
                                : 'flex flex-col h-full'
                        }
                    >
                        <SidebarResizeHandle />
                        <div className="h-14 mt-2 flex-shrink-0 flex items-center justify-between pl-5 pr-3">
                            <Link
                                to="/"
                                className="flex items-center no-underline"
                            >
                                <img
                                    src={getAssetPath(
                                        isDarkMode
                                            ? 'wide-logo-light.png'
                                            : 'wide-logo-dark.png'
                                    )}
                                    alt="Cadence"
                                    className="h-8 w-auto"
                                />
                            </Link>
                            <button
                                type="button"
                                onClick={() => setIsSidebarOpen(false)}
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-300/50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                aria-label="Collapse Sidebar"
                                data-testid="sidebar-collapse"
                            >
                                <SidebarPanelIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-3 pb-4">
                            {/* Sidebar Contents */}
                            <div className="mb-[22px]">
                                {isMinimal ? (
                                    <SidebarSmartLists
                                        handleNavClick={handleNavClick}
                                        location={location}
                                    />
                                ) : (
                                    <SidebarNav
                                        handleNavClick={handleNavClick}
                                        location={location}
                                        isDarkMode={isDarkMode}
                                        openTaskModal={openTaskModal}
                                    />
                                )}
                            </div>
                            {sectionOrder.map((id) => {
                                if (!isSectionVisible(id as SidebarSectionId)) {
                                    return null;
                                }
                                if (id === 'habits' && !habitsEnabled)
                                    return null;
                                if (
                                    isMinimal &&
                                    !MINIMAL_LIST_SECTIONS.includes(
                                        id as SidebarSectionId
                                    )
                                ) {
                                    return null;
                                }
                                return (
                                    <div key={id} className="mb-[6px]">
                                        {
                                            sectionElements[
                                                id as SidebarSectionId
                                            ]
                                        }
                                    </div>
                                );
                            })}
                            {!isMinimal && (
                                <div className="mb-[6px]">
                                    <SidebarAdmin
                                        handleNavClick={handleNavClick}
                                        location={location}
                                        currentUser={currentUser}
                                    />
                                </div>
                            )}
                        </div>

                        {isMinimal && (
                            <div className="px-2.5 pb-1">
                                <button
                                    type="button"
                                    onClick={openSidebarSettings}
                                    data-testid="sidebar-customize"
                                    className="w-full text-left px-[10px] h-[30px] rounded-[8px] text-[13px] text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[oklch(24%_0.015_250)]"
                                >
                                    {t(
                                        'sidebar.customize',
                                        'Customize sidebar'
                                    )}
                                </button>
                            </div>
                        )}

                        <SidebarTrialCard />
                        <SidebarFooter
                            currentUser={currentUser}
                            isDarkMode={isDarkMode}
                            toggleDarkMode={toggleDarkMode}
                            isSidebarOpen={isSidebarOpen}
                            setIsSidebarOpen={setIsSidebarOpen}
                            isDropdownOpen={isDropdownOpen}
                            toggleDropdown={toggleDropdown}
                            openTaskModal={openTaskModal}
                            openProjectModal={openProjectModal}
                            onCreateNote={onCreateNote}
                            openAreaModal={openAreaModal}
                            openTagModal={openTagModal}
                            keyboardShortcuts={keyboardShortcuts}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
