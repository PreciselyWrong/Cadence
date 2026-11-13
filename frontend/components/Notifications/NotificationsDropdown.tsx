import React, { useState, useRef, useEffect } from 'react';
import {
    BellIcon,
    CheckIcon,
    XMarkIcon,
    InformationCircleIcon,
    ExclamationTriangleIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiPath } from '../../config/paths';
import { fetchWithCsrf } from '../../utils/csrfService';
import {
    InvitationId,
    acceptInvitation,
    declineInvitation,
} from '../../utils/sharesService';
import { useStore } from '../../store/useStore';
import { openTaskPanel } from '../../store/taskPanelStore';
import { safeOpenPath } from '../../utils/agentMessagesService';
import { setProposalParam } from '../Proposals/proposalLinks';

// Direct share invitations carry a numeric id; ones that came through a group
// carry a string such as "g12".
const isInvitationId = (value: unknown): value is InvitationId =>
    typeof value === 'number' || (typeof value === 'string' && value !== '');

interface Notification {
    id: number;
    uid: string;
    type?: string;
    title: string;
    message: string;
    level: 'info' | 'warning' | 'error' | 'success';
    source: string;
    read_at: string | null;
    created_at: string;
    data?: {
        taskUid?: string;
        taskUids?: string[];
        count?: number;
        projectUid?: string;
        invitationId?: InvitationId;
        resourceType?: string;
        resourceUid?: string;
        [key: string]: any;
    };
}

interface NotificationsDropdownProps {
    isDarkMode: boolean;
}

// Colours come from the design tokens (light and dark), so the prop that
// used to pick them is no longer read.
const NotificationsDropdown: React.FC<NotificationsDropdownProps> = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const loadProjects = useStore((state) => state.projectsStore.loadProjects);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchUnreadCount = async () => {
        try {
            const response = await fetch(
                getApiPath('notifications/unread-count'),
                {
                    credentials: 'include',
                }
            );
            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.count || 0);
            }
        } catch (error) {
            console.error('Error fetching unread count:', error);
        }
    };

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const response = await fetch(
                getApiPath('notifications?limit=20&includeRead=true'),
                {
                    credentials: 'include',
                }
            );
            if (response.ok) {
                const data = await response.json();
                setNotifications(data.notifications || []);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    const handleToggle = () => {
        setIsOpen(!isOpen);
    };

    const handleMarkAsRead = async (uid: string) => {
        try {
            const response = await fetchWithCsrf(
                getApiPath(`notifications/${uid}/read`),
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (response.ok) {
                const data = await response.json();
                const updatedNotification: Notification | undefined =
                    data.notification;
                if (updatedNotification) {
                    setNotifications((prev) =>
                        prev.map((n) =>
                            n.uid === uid
                                ? {
                                      ...n,
                                      read_at: updatedNotification.read_at,
                                  }
                                : n
                        )
                    );
                }
                fetchUnreadCount();
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            const response = await fetchWithCsrf(
                getApiPath('notifications/mark-all-read'),
                {
                    method: 'POST',
                    credentials: 'include',
                }
            );

            if (response.ok) {
                const now = new Date().toISOString();
                setNotifications((prev) =>
                    prev.map((n) => ({ ...n, read_at: now }))
                );
                setUnreadCount(0);
            }
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    };

    const handleDelete = async (uid: string) => {
        try {
            const response = await fetchWithCsrf(
                getApiPath(`notifications/${uid}`),
                {
                    method: 'DELETE',
                    credentials: 'include',
                }
            );
            if (response.ok) {
                setNotifications((prev) => prev.filter((n) => n.uid !== uid));
                fetchUnreadCount();
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    const [answeredInvitations, setAnsweredInvitations] = useState<
        Record<string, 'accepted' | 'declined'>
    >({});

    const isPendingInvitation = (notification: Notification) =>
        notification.type === 'share_invitation' &&
        isInvitationId(notification.data?.invitationId) &&
        !answeredInvitations[notification.uid];

    const handleInvitation = async (
        notification: Notification,
        answer: 'accept' | 'decline'
    ) => {
        const invitationId = notification.data?.invitationId;
        if (!isInvitationId(invitationId)) return;
        try {
            if (answer === 'accept') {
                await acceptInvitation(invitationId);
            } else {
                await declineInvitation(invitationId);
            }
            setAnsweredInvitations((prev) => ({
                ...prev,
                [notification.uid]:
                    answer === 'accept' ? 'accepted' : 'declined',
            }));
            // May have gained (or, on decline of the last one, not) a
            // collaborator; let the app re-read has_collaborators.
            window.dispatchEvent(new CustomEvent('collaboratorsChanged'));
            if (!notification.read_at) {
                handleMarkAsRead(notification.uid);
            }
            if (
                answer === 'accept' &&
                notification.data?.resourceType &&
                notification.data?.resourceUid
            ) {
                const { resourceType, resourceUid } = notification.data;
                await loadProjects();
                setIsOpen(false);
                if (resourceType === 'project') {
                    navigate(`/project/${resourceUid}`);
                } else if (resourceType === 'area' || resourceType === 'goal') {
                    // The area/goal container is not listed for collaborators;
                    // its shared projects show up on the Projects page.
                    navigate('/projects');
                }
            }
        } catch (error) {
            console.error('Error answering share invitation:', error);
        }
    };

    // A message from an agent wears the agents' sparkle; the rest, its level.
    const getIcon = (notification: Notification) => {
        const base = 'h-5 w-5 flex-shrink-0';
        if (notification.data?.pluginId) {
            return (
                <SparklesIcon
                    className={`${base} text-primary`}
                    aria-hidden="true"
                />
            );
        }
        switch (notification.level) {
            case 'success':
                return (
                    <CheckCircleIcon
                        className={`${base} text-success`}
                        aria-hidden="true"
                    />
                );
            case 'warning':
                return (
                    <ExclamationTriangleIcon
                        className={`${base} text-warning`}
                        aria-hidden="true"
                    />
                );
            case 'error':
                return (
                    <ExclamationCircleIcon
                        className={`${base} text-danger`}
                        aria-hidden="true"
                    />
                );
            default:
                return (
                    <InformationCircleIcon
                        className={`${base} text-primary`}
                        aria-hidden="true"
                    />
                );
        }
    };

    const agentPath = (notification: Notification) =>
        notification.data?.pluginId
            ? safeOpenPath(notification.data?.openPath)
            : null;

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return t('notifications.justNow', 'Just now');
        if (minutes < 60)
            return t('notifications.minutesAgo', '{{count}} min ago', {
                count: minutes,
            });
        if (hours < 24)
            return t('notifications.hoursAgo', '{{count}}h ago', {
                count: hours,
            });
        if (days < 7)
            return t('notifications.daysAgo', '{{count}}d ago', {
                count: days,
            });
        return date.toLocaleDateString();
    };

    const handleNotificationClick = (notification: Notification) => {
        const proposalUid = notification.data?.proposal_uid;
        if (notification.type === 'proposal' && proposalUid) {
            setIsOpen(false);
            if (!notification.read_at) handleMarkAsRead(notification.uid);
            // A week opens its sheet over the page; a review is worked in the
            // Review page's quick review; a career proposal is its own page.
            if (notification.data?.kind === 'review') {
                navigate('/review');
            } else if (notification.data?.kind === 'career') {
                navigate('/career');
            } else {
                setProposalParam(navigate, location, proposalUid);
            }
        } else if (
            notification.type === 'task_assigned' &&
            (notification.data?.count ?? 1) > 1
        ) {
            setIsOpen(false);
            navigate('/tasks?assigned_to=me&status=active');
        } else if (notification.data?.taskUid) {
            setIsOpen(false);
            openTaskPanel(notification.data.taskUid);
        } else if (notification.data?.projectUid) {
            setIsOpen(false);
            navigate(`/project/${notification.data.projectUid}`);
        } else {
            const path = agentPath(notification);
            if (!path) return;
            setIsOpen(false);
            if (!notification.read_at) handleMarkAsRead(notification.uid);
            navigate(path);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={handleToggle}
                className="relative flex h-[44px] w-[44px] items-center justify-center rounded-full hover:bg-surface-high sm:h-10 sm:w-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={t('profile.notifications')}
            >
                <BellIcon className="h-6 w-6 text-surface-on-variant" />
                {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-danger text-danger-on text-[12px] tabular-nums rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-medium">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-surface-card text-surface-on shadow-lg ring-1 ring-outline-variant">
                    <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                        <h3 className="text-title-m">
                            {t('notifications.title', 'Notifications')}
                        </h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="rounded-lg px-2 py-1 text-label-m font-semibold text-primary hover:bg-primary/10 max-sm:min-h-[44px]"
                            >
                                {t(
                                    'notifications.markAllRead',
                                    'Mark all as read'
                                )}
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center">
                                <p className="text-body-m text-surface-on-variant">
                                    {t('notifications.loading', 'Loading...')}
                                </p>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-4 text-center">
                                <p className="text-body-m text-surface-on-variant">
                                    {t(
                                        'notifications.noNotifications',
                                        'No notifications yet'
                                    )}
                                </p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.uid}
                                    className={`border-b border-outline-variant px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-high ${
                                        !notification.read_at
                                            ? 'bg-primary-container/40'
                                            : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {getIcon(notification)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between">
                                                <div
                                                    className={`flex-1 ${
                                                        notification.data
                                                            ?.taskUid ||
                                                        notification.data
                                                            ?.projectUid ||
                                                        agentPath(notification)
                                                            ? 'cursor-pointer'
                                                            : ''
                                                    }`}
                                                    onClick={() =>
                                                        handleNotificationClick(
                                                            notification
                                                        )
                                                    }
                                                >
                                                    {notification.data
                                                        ?.pluginId && (
                                                        <p className="text-label-m font-semibold text-primary">
                                                            {notification.data
                                                                .agentLabel ||
                                                                t(
                                                                    'agentBanner.agent',
                                                                    'Agent'
                                                                )}
                                                        </p>
                                                    )}
                                                    <p className="text-body-m font-semibold">
                                                        {notification.title}
                                                    </p>
                                                    {notification.message && (
                                                        <p className="mt-0.5 text-body-m text-surface-on-variant">
                                                            {
                                                                notification.message
                                                            }
                                                        </p>
                                                    )}
                                                    <p className="mt-1 text-label-m tabular-nums text-surface-on-variant">
                                                        {formatTimestamp(
                                                            notification.created_at
                                                        )}
                                                    </p>
                                                    {isPendingInvitation(
                                                        notification
                                                    ) && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <button
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    handleInvitation(
                                                                        notification,
                                                                        'accept'
                                                                    );
                                                                }}
                                                                className="rounded-lg bg-primary px-2.5 py-1 text-label-m font-semibold text-primary-on hover:bg-primary/90 max-sm:min-h-[44px]"
                                                            >
                                                                {t(
                                                                    'shares.acceptInvitation',
                                                                    'Accept'
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    handleInvitation(
                                                                        notification,
                                                                        'decline'
                                                                    );
                                                                }}
                                                                className="rounded-lg px-2.5 py-1 text-label-m ring-1 ring-inset ring-outline-variant hover:bg-surface-high max-sm:min-h-[44px]"
                                                            >
                                                                {t(
                                                                    'shares.declineInvitation',
                                                                    'Decline'
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {answeredInvitations[
                                                        notification.uid
                                                    ] && (
                                                        <p className="mt-2 text-label-m text-surface-on-variant">
                                                            {answeredInvitations[
                                                                notification.uid
                                                            ] === 'accepted'
                                                                ? t(
                                                                      'shares.invitationAccepted',
                                                                      'Invitation accepted'
                                                                  )
                                                                : t(
                                                                      'shares.invitationDeclined',
                                                                      'Invitation declined'
                                                                  )}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="ml-2 flex items-center gap-0.5">
                                                    {!notification.read_at && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMarkAsRead(
                                                                    notification.uid
                                                                );
                                                            }}
                                                            className="flex items-center justify-center rounded-lg p-1.5 hover:bg-surface-highest max-sm:min-h-[44px] max-sm:min-w-[44px]"
                                                            title={t(
                                                                'notifications.markAsRead',
                                                                'Mark as read'
                                                            )}
                                                            aria-label={t(
                                                                'notifications.markAsRead',
                                                                'Mark as read'
                                                            )}
                                                        >
                                                            <CheckIcon className="h-4 w-4 text-surface-on-variant" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(
                                                                notification.uid
                                                            );
                                                        }}
                                                        className="flex items-center justify-center rounded-lg p-1.5 hover:bg-surface-highest max-sm:min-h-[44px] max-sm:min-w-[44px]"
                                                        title={t(
                                                            'notifications.delete',
                                                            'Delete'
                                                        )}
                                                        aria-label={t(
                                                            'notifications.delete',
                                                            'Delete'
                                                        )}
                                                    >
                                                        <XMarkIcon className="h-4 w-4 text-surface-on-variant" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsDropdown;
