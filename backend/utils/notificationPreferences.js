/**
 * Utility functions for checking user notification preferences
 */

const { getConfig } = require('../config/config');

const DEFAULT_PREFERENCES = {
    dueTasks: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: true,
    },
    overdueTasks: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
    dueProjects: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: true,
    },
    overdueProjects: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
    deferUntil: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: true,
    },
    taskAssigned: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
    comments: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
    taskReminders: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
    // The phone rings habit reminders itself (one voice): the server row is
    // the in-app record, the other channels are opt-in.
    habitReminders: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
        apprise: false,
        desktop: false,
    },
};

/**
 * Mapping from backend notification types to preference keys
 */
const NOTIFICATION_TYPE_MAPPING = {
    task_due_soon: 'dueTasks',
    task_reminder: 'taskReminders',
    habit_reminder: 'habitReminders',
    task_overdue: 'overdueTasks',
    project_due_soon: 'dueProjects',
    project_overdue: 'overdueProjects',
    task_assigned: 'taskAssigned',
    comment_added: 'comments',
    mention: 'comments',
};

/**
 * Check if user has enabled in-app notifications for a specific type
 * @param {Object} user - User model instance with notification_preferences field
 * @param {string} notificationType - Backend notification type (e.g., 'task_due_soon', 'task_overdue')
 * @returns {boolean} - True if in-app notifications are enabled for this type
 */
function shouldSendInAppNotification(user, notificationType) {
    // If no user or no preferences set, default to enabled
    if (!user || !user.notification_preferences) {
        return true;
    }

    const prefs = user.notification_preferences;

    // Map notification type to preference key
    const prefKey =
        NOTIFICATION_TYPE_MAPPING[notificationType] || notificationType;

    // If notification type not configured, default to enabled
    if (!prefs[prefKey]) {
        return true;
    }

    // Check if in-app channel is enabled (default to true if not set)
    return prefs[prefKey].inApp !== false;
}

/**
 * Check if user has enabled Telegram notifications for a specific type
 * @param {Object} user - User model instance with notification_preferences field
 * @param {string} notificationType - Backend notification type (e.g., 'task_due_soon', 'task_overdue')
 * @returns {boolean} - True if Telegram notifications are enabled for this type
 */
function shouldSendTelegramNotification(user, notificationType) {
    if (getConfig().telegramEnabled !== true) return false;

    // If no user or no preferences set, default to disabled for Telegram
    if (!user || !user.notification_preferences) {
        return false;
    }

    const prefs = user.notification_preferences;

    // Map notification type to preference key
    const prefKey =
        NOTIFICATION_TYPE_MAPPING[notificationType] || notificationType;

    // If notification type not configured, default to disabled
    if (!prefs[prefKey]) {
        return false;
    }

    // Check if telegram channel is enabled (default to false if not set)
    return prefs[prefKey].telegram === true;
}

// Push is opt-in per type, like Telegram: off unless the user turned it on.
function shouldSendPushNotification(user, notificationType) {
    if (!user || !user.notification_preferences) {
        return false;
    }

    const prefs = user.notification_preferences;
    const prefKey =
        NOTIFICATION_TYPE_MAPPING[notificationType] || notificationType;

    if (!prefs[prefKey]) {
        return false;
    }

    return prefs[prefKey].push === true;
}

// Apprise is opt-in per type, like push.
function shouldSendAppriseNotification(user, notificationType) {
    if (!user || !user.notification_preferences) {
        return false;
    }

    const prefs = user.notification_preferences;
    const prefKey =
        NOTIFICATION_TYPE_MAPPING[notificationType] || notificationType;

    if (!prefs[prefKey]) {
        return false;
    }

    return prefs[prefKey].apprise === true;
}

// The desktop client shows the notification only when its type is on for
// "desktop". The phone owns task reminders, so those default to off; an
// explicit choice always wins.
function shouldSendDesktopNotification(user, notificationType) {
    const prefKey =
        NOTIFICATION_TYPE_MAPPING[notificationType] || notificationType;
    const explicit = user?.notification_preferences?.[prefKey]?.desktop;
    if (typeof explicit === 'boolean') return explicit;
    return DEFAULT_PREFERENCES[prefKey]?.desktop === true;
}

// Sources for reminders that Telegram delivers in its own batch: push,
// Apprise and the desktop client are handled per notification.
function reminderSources(user, notificationType) {
    const sources = [];
    if (shouldSendPushNotification(user, notificationType)) {
        sources.push('push');
    }
    if (shouldSendAppriseNotification(user, notificationType)) {
        sources.push('apprise');
    }
    if (shouldSendDesktopNotification(user, notificationType)) {
        sources.push('desktop');
    }
    return sources;
}

// The extra delivery channels to pass as `sources` to
// Notification.createNotification for one preference key.
function deliverySources(user, notificationType) {
    const sources = [];
    if (shouldSendTelegramNotification(user, notificationType)) {
        sources.push('telegram');
    }
    if (shouldSendPushNotification(user, notificationType)) {
        sources.push('push');
    }
    if (shouldSendAppriseNotification(user, notificationType)) {
        sources.push('apprise');
    }
    if (shouldSendDesktopNotification(user, notificationType)) {
        sources.push('desktop');
    }
    return sources;
}

/**
 * Get default notification preferences
 * @returns {Object} - Default preferences object
 */
function getDefaultNotificationPreferences() {
    return { ...DEFAULT_PREFERENCES };
}

/**
 * Ensure notification preferences are properly initialized
 * Returns default preferences if input is null/undefined, otherwise merges with defaults
 * @param {Object|null|undefined} preferences - Existing notification preferences
 * @returns {Object} - Valid notification preferences object with all required keys
 */
function ensureNotificationPreferences(preferences) {
    if (!preferences || typeof preferences !== 'object') {
        return getDefaultNotificationPreferences();
    }

    // Merge with defaults to ensure all keys exist
    const result = {};
    const defaults = getDefaultNotificationPreferences();

    for (const key of Object.keys(defaults)) {
        if (preferences[key] && typeof preferences[key] === 'object') {
            // Preserve existing preferences but ensure all channels exist
            result[key] = {
                inApp:
                    preferences[key].inApp !== undefined
                        ? preferences[key].inApp
                        : defaults[key].inApp,
                email:
                    preferences[key].email !== undefined
                        ? preferences[key].email
                        : defaults[key].email,
                push:
                    preferences[key].push !== undefined
                        ? preferences[key].push
                        : defaults[key].push,
                telegram:
                    preferences[key].telegram !== undefined
                        ? preferences[key].telegram
                        : defaults[key].telegram,
                apprise:
                    preferences[key].apprise !== undefined
                        ? preferences[key].apprise
                        : defaults[key].apprise,
                desktop:
                    preferences[key].desktop !== undefined
                        ? preferences[key].desktop
                        : defaults[key].desktop,
            };
        } else {
            // Missing preference type, use default
            result[key] = { ...defaults[key] };
        }
    }

    return result;
}

module.exports = {
    shouldSendInAppNotification,
    shouldSendTelegramNotification,
    shouldSendPushNotification,
    shouldSendAppriseNotification,
    shouldSendDesktopNotification,
    deliverySources,
    reminderSources,
    getDefaultNotificationPreferences,
    ensureNotificationPreferences,
    NOTIFICATION_TYPE_MAPPING,
};
