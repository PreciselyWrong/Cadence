import React, { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
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
import SidebarMiniMonth from './Sidebar/SidebarMiniMonth';
import SidebarNav from './Sidebar/SidebarNav';
import SidebarNotes from './Sidebar/SidebarNotes';
import SidebarHabits from './Sidebar/SidebarHabits';
import SidebarProjects from './Sidebar/SidebarProjects';
import SidebarTags from './Sidebar/SidebarTags';
import SidebarGoals from './Sidebar/SidebarGoals';
import SidebarGoalsPanel from './Sidebar/SidebarGoalsPanel';
import SidebarHabitsPanel from './Sidebar/SidebarHabitsPanel';
import SidebarViews from './Sidebar/SidebarViews';
import SidebarPeople from './Sidebar/SidebarPeople';
import SidebarBoards from './Sidebar/SidebarBoards';
import SidebarInsights from './Sidebar/SidebarInsights';
import SidebarAdmin from './Sidebar/SidebarAdmin';
import SidebarBookmarks from './Sidebar/SidebarBookmarks';
import SidebarResizeHandle from './Sidebar/SidebarResizeHandle';
import SidebarPanelIcon from './Sidebar/SidebarPanelIcon';
import SidebarRail from './Sidebar/SidebarRail';
import SidebarRailMinimal, {
    panelRailIdFor,
} from './Sidebar/SidebarRailMinimal';
import SidebarSmartLists from './Sidebar/SidebarSmartLists';
import { useIsMinimal } from '../hooks/useUiDensity';
import { canOpenAccess } from '../entities/Role';
import { KeyboardShortcutsConfig } from '../utils/keyboardShortcutsService';
import { useStore } from '../store/useStore';
import type { SidebarVisibleSections } from './Profile/types';
import { sidebarPercentToRem } from '../utils/sidebarWidth';
import type { SidebarSectionId } from '../utils/sidebarLayout';
import {
    RAIL_PANEL_KIND,
    type PanelId,
    type RailId,
} from '../utils/minimalSidebar';

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
// Navy in light mode, charcoal in dark mode: the frame around the content
// and the sidebar share it (`.sidebar-island` in tailwind.css).
export const SIDEBAR_CANVAS = 'bg-sidebar';

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
    // Minimal: which blocks the open panel shows, in which order.
    const panel = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.panel
    );
    const panelShows = (key: PanelId) =>
        panel.some((block) => block.key === key && block.visible);
    // The panel follows the route: Notes, Goals and Habits show their own
    // blocks (Profile > Sidebar); every other route shows the tasks panel.
    const panelsSettings = useStore(
        (state) => state.userSettingsStore.sidebarMinimal.panels
    );
    const railPanelId = panelRailIdFor(location.pathname);
    const sectionPanelKind = railPanelId
        ? RAIL_PANEL_KIND[railPanelId]
        : undefined;

    // With the tasks panel open, the minimal rail skips the entries the panel
    // already lists (smart lists at the top, Areas among the sections).
    const railIdsListedInPanel = (): RailId[] => {
        if (sectionPanelKind) return [];
        const ids: RailId[] = [];
        if (panelShows('smartLists')) {
            for (const item of smartLists) {
                if (!item.visible) continue;
                if (item.key === 'today') ids.push(item.key);
            }
        }
        if (panelShows('areas')) ids.push('areas');
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

    // The Goals and Habits panels list their items in full (open by default);
    // the Dense sections above stay compact.
    const sectionPanelElements: Record<string, JSX.Element> = {
        ...sectionElements,
        goals: (
            <SidebarGoalsPanel
                handleNavClick={handleNavClick}
                location={location}
                openGoalModal={openGoalModal}
            />
        ),
        habits: (
            <SidebarHabitsPanel
                handleNavClick={handleNavClick}
                location={location}
                openNewHabit={openNewHabit}
            />
        ),
    };

    // One block of the open minimal panel (order and visibility in
    // Profile > Sidebar).
    const minimalBlock = (key: PanelId): React.ReactNode => {
        switch (key) {
            case 'favorites':
                return (
                    <div className="mb-2 empty:hidden">
                        {sectionElements.favorites}
                    </div>
                );
            case 'miniMonth':
                return (
                    <div className="mb-3 hidden sm:block">
                        <SidebarMiniMonth />
                    </div>
                );
            case 'smartLists':
                return (
                    <div className="mb-[22px]">
                        <SidebarSmartLists
                            handleNavClick={handleNavClick}
                            location={location}
                        />
                    </div>
                );
            default:
                return <div className="mb-[6px]">{sectionElements[key]}</div>;
        }
    };

    const footer = (
        <>
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
        </>
    );

    return (
        <>
            {isSidebarOpen && (
                <div
                    aria-hidden="true"
                    data-testid="sidebar-scrim"
                    className="sm:hidden fixed inset-0 z-[39] bg-black/50"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
            <div
                className={`fixed top-0 left-0 ${isSidebarOpen ? 'w-[85vw] max-w-[22rem] sm:max-w-none sm:w-sidebar' : 'w-0 invisible sm:w-rail sm:visible'} h-screen overflow-hidden dark sidebar-island text-surface-on transition-width duration-300 ease-in-out z-40`}
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
                    <div
                        className={
                            isMinimal ? 'flex flex-col h-full' : 'contents'
                        }
                    >
                        {/* Minimal: rail and panel side by side, the footer
                            below both so its line runs the full width */}
                        <div
                            className={
                                isMinimal ? 'flex flex-1 min-h-0' : 'contents'
                            }
                        >
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
                                <div className="relative h-14 mt-2 flex-shrink-0 flex items-center justify-center px-5">
                                    <Link
                                        to="/"
                                        className="flex items-center no-underline"
                                    >
                                        <img
                                            src={getAssetPath(
                                                'wordmark-dark.svg'
                                            )}
                                            alt="Cadence"
                                            className="h-[22px] w-auto"
                                        />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => setIsSidebarOpen(false)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-600 hover:text-gray-700 hover:bg-gray-300/50 dark:text-gray-300 dark:hover:text-gray-200 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                        aria-label={t(
                                            'navbar.collapseSidebar',
                                            'Collapse Sidebar'
                                        )}
                                        data-testid="sidebar-collapse"
                                    >
                                        <XMarkIcon className="h-6 w-6 sm:hidden" />
                                        <SidebarPanelIcon className="hidden sm:block h-5 w-5" />
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-1 pb-4">
                                    {isMinimal && sectionPanelKind ? (
                                        panelsSettings[sectionPanelKind]
                                            .filter((block) => block.visible)
                                            .map((block) => (
                                                <React.Fragment key={block.key}>
                                                    {block.key ===
                                                    'favorites' ? (
                                                        <div className="mb-2 empty:hidden">
                                                            {
                                                                sectionElements.favorites
                                                            }
                                                        </div>
                                                    ) : (
                                                        <div className="mb-[6px]">
                                                            {
                                                                sectionPanelElements[
                                                                    block.key
                                                                ]
                                                            }
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            ))
                                    ) : isMinimal ? (
                                        panel
                                            .filter((block) => block.visible)
                                            .map((block) => (
                                                <React.Fragment key={block.key}>
                                                    {minimalBlock(block.key)}
                                                </React.Fragment>
                                            ))
                                    ) : (
                                        <>
                                            {/* Pinned items at the very top, as tiles (TickTick) */}
                                            {isSectionVisible('favorites') && (
                                                <div className="mb-2 empty:hidden">
                                                    {sectionElements.favorites}
                                                </div>
                                            )}
                                            <div className="mb-[22px]">
                                                <SidebarNav
                                                    handleNavClick={
                                                        handleNavClick
                                                    }
                                                    location={location}
                                                    isDarkMode={isDarkMode}
                                                    openTaskModal={
                                                        openTaskModal
                                                    }
                                                />
                                            </div>
                                            {sectionOrder.map((id) => {
                                                if (
                                                    !isSectionVisible(
                                                        id as SidebarSectionId
                                                    )
                                                ) {
                                                    return null;
                                                }
                                                if (id === 'favorites')
                                                    return null;
                                                if (
                                                    id === 'habits' &&
                                                    !habitsEnabled
                                                )
                                                    return null;
                                                return (
                                                    <div
                                                        key={id}
                                                        className="mb-[6px]"
                                                    >
                                                        {
                                                            sectionElements[
                                                                id as SidebarSectionId
                                                            ]
                                                        }
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
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

                                {!isMinimal && footer}
                            </div>
                        </div>
                        {isMinimal && footer}
                    </div>
                )}
            </div>
        </>
    );
};

export default Sidebar;
