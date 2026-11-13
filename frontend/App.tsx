import React, { useEffect, useRef, useState, Suspense, lazy } from 'react';
import {
    Routes,
    Route,
    Navigate,
    Outlet,
    useParams,
    useNavigate,
    useLocation,
} from 'react-router-dom';

const NoteRedirect: React.FC = () => {
    const { uidSlug } = useParams<{ uidSlug: string }>();
    const uid = uidSlug?.split('-')[0] || '';
    return <Navigate to={`/notes/${uid}`} replace />;
};
import { useTranslation } from 'react-i18next';
import { useToast } from './components/Shared/ToastContext';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/Auth/ForgotPassword';
import ResetPassword from './components/Auth/ResetPassword';
import SignInLink from './components/Auth/SignInLink';
import OIDCCallback from './components/Auth/OIDCCallback';
import NotFound from './components/Shared/NotFound';
import ProjectDetails from './components/Project/ProjectDetails';
import Projects from './components/Projects';
import AreaDetails from './components/Area/AreaDetails';
import Areas from './components/Areas';
import TagDetails from './components/Tag/TagDetails';
import Tags from './components/Tags';
import GoalDetails from './components/Goal/GoalDetails';
import Goals from './components/Goals';
import Views from './components/Views';
import ViewDetail from './components/ViewDetail';
import Notes from './components/Notes';
import Calendar from './components/Calendar';
import ProfileSettings from './components/Profile/ProfileSettings';
import About from './components/About';
import BackupRestore from './components/Backup/BackupRestore';
import Layout from './Layout';
import SubscriptionGate from './components/Billing/SubscriptionGate';
import DemoEntry from './components/DemoEntry';
import { usePluginMenuStore } from './store/pluginMenuStore';
const SubscriptionRequired = lazy(
    () => import('./components/Billing/SubscriptionRequired')
);
import { User } from './entities/User';
import { fetchRetryingOnRateLimit } from './utils/authUtils';
import { canOpenAccess } from './entities/Role';
import TodayView from './components/Today/TodayView';
import TaskDetails from './components/Task/TaskDetails';
import TaskLinkRedirect from './components/Task/TaskLinkRedirect';
import LoadingScreen from './components/Shared/LoadingScreen';
import InboxRoute from './components/Inbox/InboxRoute';
import Habits from './components/Habits/Habits';
import HabitDetails from './components/Habits/HabitDetails';
import EisenhowerMatrix from './components/Eisenhower/EisenhowerMatrix';
import KanbanBoard from './components/Kanban/KanbanBoard';
import ProductivityPage from './components/Insights/ProductivityPage';
import ReportsPage from './components/Insights/ReportsPage';
import SummaryPage from './components/Insights/SummaryPage';
import ReviewPage from './components/Review/ReviewPage';
import TriagePage from './components/Triage/TriagePage';
import PeopleList from './components/People/PeopleList';
import PersonDetails from './components/People/PersonDetails';
import EveryoneDashboard from './components/Everyone/EveryoneDashboard';
import GroupPage from './components/Groups/GroupPage';
import Templates from './components/Templates/Templates';
import { setCurrentUser as setUserInStorage } from './utils/userUtils';
import type { StarterResult } from './utils/onboardingService';
import { getApiPath, getLocalesPath } from './config/paths';
import { useStore } from './store/useStore';
import { applyUserFeatures } from './utils/userFeatures';
import { sanitizeFocus } from './utils/focus';
import { invalidateProfileCache } from './utils/profileService';
import { notifySwSession, notifySwClearCache } from './utils/swUtils';
import { resyncPush } from './utils/pushService';
import { resetSessionState } from './utils/sessionReset';
import { RecurringScopeDialogHost } from './components/Task/RecurringScopeDialog';
import {
    clearSharedText,
    hasPendingSharedText,
    takeSharedText,
} from './utils/shareTargetService';
import { openCapture } from './utils/captureUi';
const PublicNotePage = lazy(
    () => import('./components/PublicNote/PublicNotePage')
);
const BlogApp = lazy(() => import('./components/Blog/BlogApp'));
const Welcome = lazy(() => import('./components/Onboarding/Welcome'));
// Lazy load Tasks component to prevent issues with tags loading
const Tasks = lazy(() => import('./components/Tasks'));
const UpcomingRoute = lazy(() => import('./components/Upcoming/UpcomingRoute'));
const ProjectHistory = lazy(
    () => import('./components/Project/ProjectHistory')
);
// Declared at module scope: the users page switches tabs through the query
// string, and a lazy component created inside render would remount and
// re-suspend on every navigation.
const AdminUsersPage = lazy(() => import('./components/Admin/AdminUsersPage'));
const AdminMfaRequired = lazy(
    () => import('./components/Admin/AdminMfaRequired')
);
const PluginPage = lazy(() => import('./components/Plugins/PluginPage'));

// Waits before each automatic retry of the first user read while the server
// answers 429 and no user is known yet. After the last one, Retry is manual.
const BOOT_RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

const App: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { showErrorToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [serverBusy, setServerBusy] = useState(false);
    // Read by the fetch, which may outlive the render that started it.
    const currentUserRef = useRef<User | null>(null);
    const bootRetry = useRef<{ attempt: number; timer?: number }>({
        attempt: 0,
    });
    // The hosted superadmin sees a setup prompt instead of the admin panel
    // until two-factor sign-in is on.
    const adminElement = (element: React.ReactElement) =>
        currentUser?.admin_mfa_required ? <AdminMfaRequired /> : element;

    const scheduleBootRetry = () => {
        setServerBusy(true);
        const delay = BOOT_RETRY_DELAYS_MS[bootRetry.current.attempt];
        if (delay === undefined) return;
        bootRetry.current.attempt += 1;
        bootRetry.current.timer = window.setTimeout(() => {
            bootRetry.current.timer = undefined;
            void fetchCurrentUser();
        }, delay);
    };

    const retryBoot = () => {
        window.clearTimeout(bootRetry.current.timer);
        bootRetry.current = { attempt: 0 };
        void fetchCurrentUser();
    };

    const fetchCurrentUser = async () => {
        // A 429 with no user yet keeps the loading state: the app must not
        // fall through to the logged-out routes.
        let waitingForServer = false;
        try {
            const response = await fetchRetryingOnRateLimit(
                () =>
                    fetch(getApiPath('current_user'), {
                        credentials: 'include',
                        headers: {
                            Accept: 'application/json',
                        },
                    }),
                (retry) => {
                    if (retry === 1) {
                        showErrorToast(
                            t(
                                'auth.rateLimitedRetrying',
                                'Too many requests, retrying…'
                            )
                        );
                    }
                }
            );

            if (!response.ok) {
                // Still rate limited after the retries: the session is not
                // over, so keep the current user and say so.
                if (response.status === 429) {
                    if (currentUserRef.current) {
                        showErrorToast(
                            t(
                                'auth.rateLimitedGaveUp',
                                'Too many requests. Your session is still active; reload in a moment.'
                            )
                        );
                        return;
                    }
                    waitingForServer = true;
                    scheduleBootRetry();
                    return;
                }
                if (response.status === 401) {
                    invalidateProfileCache();
                    notifySwClearCache();
                    resetSessionState();
                    setCurrentUser(null);
                    return;
                }
                throw new Error(`Failed to fetch user: ${response.status}`);
            }

            const data = await response.json();
            if (data.user) {
                setCurrentUser(data.user);
                setUserInStorage(data.user);
                notifySwSession(data.user.id);
                resyncPush(data.user.uid);
                applyUserFeatures(data.user.features);
                useStore
                    .getState()
                    .userSettingsStore.setHasCollaborators(
                        data.user.has_collaborators === true
                    );
                useStore
                    .getState()
                    .userSettingsStore.setCapabilities(
                        data.user.capabilities ?? null
                    );
                useStore
                    .getState()
                    .userSettingsStore.setRole(data.user.role ?? null);
                useStore
                    .getState()
                    .userSettingsStore.setAiAssistantEnabled(
                        data.user.features?.ai_assistant_enabled === true
                    );
                useStore
                    .getState()
                    .userSettingsStore.setUiDensity(
                        data.user.ui_settings?.appearance?.density === 'dense'
                            ? 'dense'
                            : 'minimal'
                    );
                useStore
                    .getState()
                    .userSettingsStore.setSidebarVisibleSections(
                        data.user.sidebar_settings?.visibleSections ?? {}
                    );
                useStore.getState().userSettingsStore.setSidebarOrder({
                    linkOrder: data.user.sidebar_settings?.linkOrder,
                    sectionOrder: data.user.sidebar_settings?.sectionOrder,
                });
                useStore
                    .getState()
                    .userSettingsStore.setSidebarWidthPercent(
                        data.user.sidebar_settings?.widthPercent
                    );
                useStore
                    .getState()
                    .userSettingsStore.setFocus(
                        sanitizeFocus(data.user.ui_settings?.focus)
                    );
                useStore
                    .getState()
                    .userSettingsStore.setTaskRowFields(
                        data.user.ui_settings?.appearance?.rowFields ?? null
                    );
                useStore
                    .getState()
                    .userSettingsStore.setSidebarMinimal(
                        data.user.sidebar_settings
                    );
            } else {
                setCurrentUser(null);
                setUserInStorage(null);
            }
        } catch {
            setCurrentUser(null);
        } finally {
            if (!waitingForServer) setLoading(false);
        }
    };

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    useEffect(() => {
        // Fetch user on mount
        fetchCurrentUser();
        return () => window.clearTimeout(bootRetry.current.timer);
    }, []);

    // Listen for login events to update user state
    useEffect(() => {
        const handleUserLoggedIn = (event: CustomEvent) => {
            invalidateProfileCache();
            resetSessionState();
            const user = event.detail;
            setCurrentUser(user);
            setUserInStorage(user);
            // The login payload carries no feature flags or has_collaborators,
            // so re-read the full user; otherwise the sidebar (Calendar, the
            // "Everyone" dashboard, ...) stays wrong until a manual reload.
            fetchCurrentUser();
        };

        window.addEventListener(
            'userLoggedIn',
            handleUserLoggedIn as EventListener
        );
        return () =>
            window.removeEventListener(
                'userLoggedIn',
                handleUserLoggedIn as EventListener
            );
    }, []);

    // Accepting a share invitation or revoking a collaborator changes whether
    // the "Everyone" dashboard applies; re-read the user so its sidebar item
    // appears or disappears without a reload.
    useEffect(() => {
        const refresh = () => fetchCurrentUser();
        window.addEventListener('collaboratorsChanged', refresh);
        return () =>
            window.removeEventListener('collaboratorsChanged', refresh);
    }, []);

    // A share handed over while the session was expired lands on /login, so
    // send the user to the Inbox composer once they're authenticated again
    // Plugin entries in the sidebar: one load per sign-in.
    const isSignedIn = currentUser !== null;
    useEffect(() => {
        if (isSignedIn) void usePluginMenuStore.getState().load();
    }, [isSignedIn]);

    // A share from the OS sheet opens the capture box prefilled, once signed
    // in, so the user can still edit it or pick task, note or project.
    useEffect(() => {
        if (!currentUser || !hasPendingSharedText()) return;
        const text = takeSharedText();
        clearSharedText();
        if (text) openCapture('inbox', null, text);
    }, [currentUser]);

    // The welcome page is done with: Today opens.
    const finishWelcome = (result: StarterResult) => {
        const user = currentUser
            ? {
                  ...currentUser,
                  onboarded_at: result.onboarded_at,
                  onboarding_starter: result.onboarding_starter,
              }
            : null;
        if (user) setUserInStorage(user);
        setCurrentUser(user);
        navigate('/today', { replace: true });
    };

    useEffect(() => {
        if (i18n.isInitialized) {
            fetch(getLocalesPath(`${i18n.language}/translation.json`))
                .then((response) => {
                    return response.json();
                })
                .then((data) => {
                    i18n.addResourceBundle(
                        i18n.language,
                        'translation',
                        data,
                        true,
                        true
                    );
                })
                .catch((error) => {
                    console.error(
                        'Error manually fetching translation file:',
                        error
                    );
                });
        }
    }, [i18n.isInitialized]);

    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        const storedPreference = localStorage.getItem('isDarkMode');
        return storedPreference !== null
            ? storedPreference === 'true'
            : window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const toggleDarkMode = () => {
        const newValue = !isDarkMode;
        setIsDarkMode(newValue);
        localStorage.setItem('isDarkMode', JSON.stringify(newValue));
    };

    const setAppearance = (theme: 'light' | 'dark' | 'system') => {
        if (theme === 'system') {
            localStorage.removeItem('isDarkMode');
            setIsDarkMode(
                window.matchMedia('(prefers-color-scheme: dark)').matches
            );
        } else {
            const isDark = theme === 'dark';
            setIsDarkMode(isDark);
            localStorage.setItem('isDarkMode', JSON.stringify(isDark));
        }
    };

    useEffect(() => {
        const updateTheme = () => {
            document.documentElement.classList.toggle('dark', isDarkMode);
        };
        updateTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const mediaListener = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem('isDarkMode')) {
                setIsDarkMode(e.matches);
            }
        };
        mediaQuery.addEventListener('change', mediaListener);
        return () => mediaQuery.removeEventListener('change', mediaListener);
    }, [isDarkMode]);

    const LoadingComponent = () => (
        <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
            <div className="text-xl font-semibold text-gray-700 dark:text-gray-200">
                {i18n.t(
                    'common.loading',
                    'Loading application... Please wait.'
                )}
            </div>
        </div>
    );

    if (!i18n.isInitialized) {
        return <LoadingScreen fullScreen />;
    }

    if (loading) {
        return serverBusy ? (
            <div
                role="status"
                className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-4 text-center dark:bg-gray-900"
            >
                <p className="text-xl font-semibold text-gray-700 dark:text-gray-200">
                    {t('auth.serverBusyRetrying', 'Server busy, retrying…')}
                </p>
                <button
                    type="button"
                    onClick={retryBoot}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-on focus-visible:outline-2 focus-visible:outline-primary"
                >
                    {t('auth.serverBusyRetry', 'Retry')}
                </button>
            </div>
        ) : (
            <LoadingComponent />
        );
    }

    return (
        <Suspense fallback={<LoadingComponent />}>
            <RecurringScopeDialogHost />
            <Routes>
                {/* Reachable signed in or out: a browser that already has a
                    session can still open a member's link. */}
                <Route path="/sign-in-link" element={<SignInLink />} />
                {/* A shared note: readable by anyone with the link, signed in
                    or not, and outside the app layout (no sidebar). */}
                <Route
                    path="/public/notes/:token"
                    element={
                        <PublicNotePage
                            isSignedIn={!!currentUser}
                            isDarkMode={isDarkMode}
                            toggleDarkMode={toggleDarkMode}
                        />
                    }
                />
                {/* The blog, for anyone, signed in or not. On a blog host it
                    renders at the root instead (see index.tsx). */}
                <Route
                    path="/blog/*"
                    element={
                        <BlogApp
                            basePath="/blog"
                            isDarkMode={isDarkMode}
                            toggleDarkMode={toggleDarkMode}
                        />
                    }
                />
                {currentUser ? (
                    <>
                        <Route
                            path="/subscription/new"
                            element={<SubscriptionRequired />}
                        />
                        <Route path="/demo" element={<DemoEntry />} />
                        {/* The marketing site links here whether or not the
                            visitor is signed in, so these send an existing
                            session home instead of falling through to 404. */}
                        {['/login', '/register', '/forgot-password'].map(
                            (path) => (
                                <Route
                                    key={path}
                                    path={path}
                                    element={<Navigate to="/" replace />}
                                />
                            )
                        )}
                        <Route
                            path="/reset-password"
                            element={<ResetPassword />}
                        />
                        <Route
                            element={
                                <SubscriptionGate>
                                    <Layout
                                        currentUser={currentUser}
                                        setCurrentUser={setCurrentUser}
                                        isDarkMode={isDarkMode}
                                        toggleDarkMode={toggleDarkMode}
                                    >
                                        {currentUser.onboarding_starter ===
                                            null &&
                                        location.pathname !== '/welcome' ? (
                                            <Navigate to="/welcome" replace />
                                        ) : (
                                            <Outlet />
                                        )}
                                    </Layout>
                                </SubscriptionGate>
                            }
                        >
                            <Route
                                index
                                element={<Navigate to="/today" replace />}
                            />
                            <Route path="/today" element={<TodayView />} />
                            <Route
                                path="/welcome"
                                element={
                                    currentUser.onboarding_starter === null ? (
                                        <Suspense fallback={<LoadingScreen />}>
                                            <Welcome onDone={finishWelcome} />
                                        </Suspense>
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/today_legacy"
                                element={<Navigate to="/today" replace />}
                            />
                            <Route
                                path="/today/plan"
                                element={<Navigate to="/today" replace />}
                            />
                            <Route
                                path="/task/:uid"
                                element={<TaskLinkRedirect />}
                            />
                            <Route
                                path="/task/:uid/details"
                                element={<TaskDetails />}
                            />
                            <Route
                                path="/upcoming"
                                element={
                                    <Suspense
                                        fallback={
                                            <div className="p-4">
                                                {i18n.t(
                                                    'common.loading',
                                                    'Loading...'
                                                )}
                                            </div>
                                        }
                                    >
                                        <UpcomingRoute />
                                    </Suspense>
                                }
                            />
                            <Route
                                path="/tasks"
                                element={
                                    <Suspense
                                        fallback={
                                            <div className="p-4">
                                                {i18n.t(
                                                    'common.loading',
                                                    'Loading...'
                                                )}
                                            </div>
                                        }
                                    >
                                        <Tasks />
                                    </Suspense>
                                }
                            />
                            <Route
                                path="/eisenhower"
                                element={
                                    <Navigate to="/boards/eisenhower" replace />
                                }
                            />
                            <Route
                                path="/kanban"
                                element={
                                    <Navigate to="/boards/kanban" replace />
                                }
                            />
                            <Route
                                path="/boards/eisenhower"
                                element={<EisenhowerMatrix />}
                            />
                            <Route
                                path="/boards/kanban"
                                element={<KanbanBoard />}
                            />
                            <Route path="/triage" element={<TriagePage />} />
                            <Route
                                path="/insights/productivity"
                                element={<ProductivityPage />}
                            />
                            <Route
                                path="/insights/reports"
                                element={<ReportsPage />}
                            />
                            <Route
                                path="/insights/summary"
                                element={<SummaryPage />}
                            />
                            <Route path="/review" element={<ReviewPage />} />
                            <Route path="/inbox" element={<InboxRoute />} />
                            <Route path="/habits" element={<Habits />} />
                            <Route
                                path="/plugins/:id"
                                element={<PluginPage />}
                            />
                            <Route
                                path="/habit/new"
                                element={<Navigate to="/habits" replace />}
                            />
                            <Route
                                path="/habit/:uid"
                                element={<HabitDetails />}
                            />
                            <Route path="/templates" element={<Templates />} />
                            <Route path="/projects" element={<Projects />} />
                            <Route
                                path="/projects/completed"
                                element={<ProjectHistory />}
                            />
                            <Route
                                path="/project/:uidSlug"
                                element={<ProjectDetails />}
                            />
                            <Route path="/areas" element={<Areas />} />
                            <Route
                                path="/area/:uidSlug"
                                element={<AreaDetails />}
                            />
                            <Route path="/tags" element={<Tags />} />
                            <Route
                                path="/tag/:uidSlug"
                                element={<TagDetails />}
                            />
                            <Route path="/goals" element={<Goals />} />
                            <Route
                                path="/goal/new"
                                element={<Navigate to="/goals" replace />}
                            />
                            <Route
                                path="/goal/:uidSlug"
                                element={<GoalDetails />}
                            />
                            <Route path="/views" element={<Views />} />
                            <Route
                                path="/views/:uid"
                                element={<ViewDetail />}
                            />
                            <Route path="/notes" element={<Notes />} />
                            <Route path="/notes/:uid" element={<Notes />} />
                            <Route
                                path="/note/:uidSlug"
                                element={<NoteRedirect />}
                            />
                            <Route path="/calendar" element={<Calendar />} />
                            <Route
                                path="/profile"
                                element={
                                    <ProfileSettings
                                        currentUser={currentUser}
                                        isDarkMode={isDarkMode}
                                        toggleDarkMode={toggleDarkMode}
                                        setAppearance={setAppearance}
                                    />
                                }
                            />
                            <Route
                                path="/about"
                                element={<About isDarkMode={isDarkMode} />}
                            />
                            <Route
                                path="/backup"
                                element={
                                    <BackupRestore
                                        isAdmin={currentUser.is_admin === true}
                                        onImportSuccess={() => {
                                            // A restore brings back the profile
                                            // settings, so reload them (#1776)
                                            invalidateProfileCache();
                                            fetchCurrentUser();
                                        }}
                                    />
                                }
                            />
                            <Route path="/people" element={<PeopleList />} />
                            <Route
                                path="/person/:uid"
                                element={<PersonDetails />}
                            />
                            <Route
                                path="/everyone"
                                element={<EveryoneDashboard />}
                            />
                            <Route
                                path="/groups/:uid"
                                element={<GroupPage />}
                            />
                            <Route
                                path="/admin/billing"
                                element={
                                    currentUser?.is_admin === true ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                {React.createElement(
                                                    React.lazy(
                                                        () =>
                                                            import('./components/Admin/AdminBillingPage')
                                                    )
                                                )}
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin"
                                element={
                                    currentUser?.is_admin === true ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                {React.createElement(
                                                    React.lazy(
                                                        () =>
                                                            import('./components/Admin/AdminDashboardPage')
                                                    )
                                                )}
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin/ai-usage"
                                element={
                                    currentUser?.is_admin === true ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                {React.createElement(
                                                    React.lazy(
                                                        () =>
                                                            import('./components/Admin/AdminAiUsagePage')
                                                    )
                                                )}
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin/feedback"
                                element={
                                    currentUser?.is_admin === true ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                {React.createElement(
                                                    React.lazy(
                                                        () =>
                                                            import('./components/Admin/AdminFeedbackPage')
                                                    )
                                                )}
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin/waitlist"
                                element={
                                    currentUser?.is_admin === true ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                {React.createElement(
                                                    React.lazy(
                                                        () =>
                                                            import('./components/Admin/AdminWaitlistPage')
                                                    )
                                                )}
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin/users"
                                element={
                                    canOpenAccess(currentUser) ? (
                                        adminElement(
                                            <React.Suspense
                                                fallback={
                                                    <div className="p-4">
                                                        Loading...
                                                    </div>
                                                }
                                            >
                                                <AdminUsersPage />
                                            </React.Suspense>
                                        )
                                    ) : (
                                        <Navigate to="/today" replace />
                                    )
                                }
                            />
                            <Route
                                path="/admin/groups"
                                element={
                                    <Navigate
                                        to="/admin/users?tab=groups"
                                        replace
                                    />
                                }
                            />
                            <Route path="*" element={<NotFound />} />
                        </Route>
                    </>
                ) : (
                    <>
                        <Route path="/login" element={<Login />} />
                        <Route path="/demo" element={<DemoEntry />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                            path="/forgot-password"
                            element={<ForgotPassword />}
                        />
                        <Route
                            path="/reset-password"
                            element={<ResetPassword />}
                        />
                        <Route
                            path="/auth/callback/:provider"
                            element={<OIDCCallback />}
                        />
                        <Route
                            path="/"
                            element={<Navigate to="/login" replace />}
                        />
                        <Route
                            path="*"
                            element={<Navigate to="/login" replace />}
                        />
                    </>
                )}
            </Routes>
        </Suspense>
    );
};

export default App;
