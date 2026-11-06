const {
    shouldSendInAppNotification,
    shouldSendPushNotification,
    deliverySources,
    getDefaultNotificationPreferences,
    ensureNotificationPreferences,
    NOTIFICATION_TYPE_MAPPING,
} = require('../../../utils/notificationPreferences');

describe('notificationPreferences utils', () => {
    describe('getDefaultNotificationPreferences', () => {
        it('should return default preferences with all in-app enabled', () => {
            const defaults = getDefaultNotificationPreferences();

            expect(defaults).toEqual({
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
                taskReminders: {
                    inApp: true,
                    email: false,
                    push: false,
                    telegram: false,
                    apprise: false,
                    desktop: true,
                },
                habitReminders: {
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
            });
        });

        it('should return a new object each time', () => {
            const defaults1 = getDefaultNotificationPreferences();
            const defaults2 = getDefaultNotificationPreferences();

            expect(defaults1).not.toBe(defaults2);
            expect(defaults1).toEqual(defaults2);
        });
    });

    describe('shouldSendInAppNotification', () => {
        it('should return true when user has no preferences set', () => {
            const user = { notification_preferences: null };

            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                true
            );
            expect(shouldSendInAppNotification(user, 'task_overdue')).toBe(
                true
            );
            expect(shouldSendInAppNotification(user, 'project_due_soon')).toBe(
                true
            );
            expect(shouldSendInAppNotification(user, 'project_overdue')).toBe(
                true
            );
        });

        it('should return true when user object is null', () => {
            expect(shouldSendInAppNotification(null, 'task_due_soon')).toBe(
                true
            );
        });

        it('should return true when notification type is enabled', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { inApp: true, email: false, push: false },
                    overdueTasks: { inApp: true, email: false, push: false },
                },
            };

            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                true
            );
            expect(shouldSendInAppNotification(user, 'task_overdue')).toBe(
                true
            );
        });

        it('should return false when notification type is disabled', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { inApp: false, email: false, push: false },
                    overdueTasks: { inApp: false, email: false, push: false },
                },
            };

            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                false
            );
            expect(shouldSendInAppNotification(user, 'task_overdue')).toBe(
                false
            );
        });

        it('should map backend notification types correctly', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { inApp: false, email: false, push: false },
                    overdueTasks: { inApp: true, email: false, push: false },
                    dueProjects: { inApp: false, email: false, push: false },
                    overdueProjects: { inApp: true, email: false, push: false },
                },
            };

            // task_due_soon maps to dueTasks (disabled)
            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                false
            );

            // task_overdue maps to overdueTasks (enabled)
            expect(shouldSendInAppNotification(user, 'task_overdue')).toBe(
                true
            );

            // project_due_soon maps to dueProjects (disabled)
            expect(shouldSendInAppNotification(user, 'project_due_soon')).toBe(
                false
            );

            // project_overdue maps to overdueProjects (enabled)
            expect(shouldSendInAppNotification(user, 'project_overdue')).toBe(
                true
            );
        });

        it('should handle deferUntil type directly', () => {
            const user = {
                notification_preferences: {
                    deferUntil: { inApp: false, email: false, push: false },
                },
            };

            expect(shouldSendInAppNotification(user, 'deferUntil')).toBe(false);
        });

        it('should default to true for unknown notification types', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { inApp: true, email: false, push: false },
                },
            };

            // Unknown type should default to enabled
            expect(shouldSendInAppNotification(user, 'unknown_type')).toBe(
                true
            );
        });

        it('should handle partial preferences object', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { inApp: false, email: false, push: false },
                    // overdueTasks not defined
                },
            };

            // Defined type should respect setting
            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                false
            );

            // Undefined type should default to enabled
            expect(shouldSendInAppNotification(user, 'task_overdue')).toBe(
                true
            );
        });

        it('should handle missing inApp property', () => {
            const user = {
                notification_preferences: {
                    dueTasks: { email: false, push: false },
                },
            };

            // Missing inApp should default to true
            expect(shouldSendInAppNotification(user, 'task_due_soon')).toBe(
                true
            );
        });
    });

    describe('NOTIFICATION_TYPE_MAPPING', () => {
        it('should have correct mappings', () => {
            expect(NOTIFICATION_TYPE_MAPPING).toEqual({
                task_due_soon: 'dueTasks',
                task_overdue: 'overdueTasks',
                project_due_soon: 'dueProjects',
                project_overdue: 'overdueProjects',
                task_assigned: 'taskAssigned',
                task_reminder: 'taskReminders',
                habit_reminder: 'habitReminders',
                comment_added: 'comments',
                mention: 'comments',
            });
        });
    });

    describe('ensureNotificationPreferences', () => {
        it('should return default preferences when input is null', () => {
            const result = ensureNotificationPreferences(null);
            const defaults = getDefaultNotificationPreferences();

            expect(result).toEqual(defaults);
        });

        it('should return default preferences when input is undefined', () => {
            const result = ensureNotificationPreferences(undefined);
            const defaults = getDefaultNotificationPreferences();

            expect(result).toEqual(defaults);
        });

        it('should return default preferences when input is not an object', () => {
            expect(ensureNotificationPreferences('string')).toEqual(
                getDefaultNotificationPreferences()
            );
            expect(ensureNotificationPreferences(123)).toEqual(
                getDefaultNotificationPreferences()
            );
            expect(ensureNotificationPreferences(true)).toEqual(
                getDefaultNotificationPreferences()
            );
        });

        it('should preserve existing preferences and merge with defaults', () => {
            const input = {
                dueTasks: {
                    inApp: false,
                    email: true,
                    push: false,
                    telegram: true,
                    apprise: false,
                },
                overdueTasks: {
                    inApp: true,
                    email: false,
                    push: false,
                    telegram: false,
                    apprise: false,
                },
            };

            const result = ensureNotificationPreferences(input);

            // Existing preferences should be preserved
            expect(result.dueTasks).toEqual({
                ...input.dueTasks,
                desktop: true,
            });
            expect(result.overdueTasks).toEqual({
                ...input.overdueTasks,
                desktop: false,
            });

            // Missing preferences should be added with defaults
            expect(result.dueProjects).toEqual({
                inApp: true,
                email: false,
                push: false,
                telegram: false,
                apprise: false,
                desktop: true,
            });
            expect(result.overdueProjects).toEqual({
                inApp: true,
                email: false,
                push: false,
                telegram: false,
                apprise: false,
                desktop: false,
            });
            expect(result.deferUntil).toEqual({
                inApp: true,
                email: false,
                push: false,
                telegram: false,
                apprise: false,
                desktop: true,
            });
        });

        it('should add missing channels to existing preference types', () => {
            const input = {
                dueTasks: { inApp: false, email: true },
                overdueTasks: { inApp: true },
            };

            const result = ensureNotificationPreferences(input);

            // Should add missing push and telegram channels
            expect(result.dueTasks).toEqual({
                inApp: false,
                email: true,
                push: false,
                telegram: false,
                apprise: false,
                desktop: true,
            });
            expect(result.overdueTasks).toEqual({
                inApp: true,
                email: false,
                push: false,
                telegram: false,
                apprise: false,
                desktop: false,
            });
        });

        it('should handle completely valid preferences without modification', () => {
            const input = {
                dueTasks: {
                    inApp: false,
                    email: true,
                    push: false,
                    telegram: true,
                    apprise: false,
                    desktop: false,
                },
                overdueTasks: {
                    inApp: true,
                    email: false,
                    push: true,
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
                    desktop: false,
                },
                overdueProjects: {
                    inApp: false,
                    email: false,
                    push: false,
                    telegram: false,
                    apprise: false,
                    desktop: false,
                },
                deferUntil: {
                    inApp: true,
                    email: true,
                    push: false,
                    telegram: true,
                    apprise: false,
                    desktop: false,
                },
                taskAssigned: {
                    inApp: false,
                    email: true,
                    push: false,
                    telegram: false,
                    apprise: false,
                    desktop: false,
                },
                taskReminders: {
                    inApp: false,
                    email: false,
                    push: false,
                    telegram: true,
                    apprise: false,
                    desktop: false,
                },
                habitReminders: {
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
                    push: true,
                    telegram: false,
                    apprise: false,
                    desktop: false,
                },
            };

            const result = ensureNotificationPreferences(input);

            expect(result).toEqual(input);
        });

        it('should replace invalid preference type objects with defaults', () => {
            const input = {
                dueTasks: 'invalid',
                overdueTasks: {
                    inApp: true,
                    email: false,
                    push: false,
                    telegram: false,
                    apprise: false,
                },
            };

            const result = ensureNotificationPreferences(input);

            // Invalid type should be replaced with default
            expect(result.dueTasks).toEqual({
                inApp: true,
                email: false,
                push: false,
                telegram: false,
                apprise: false,
                desktop: true,
            });

            // Valid type should be preserved
            expect(result.overdueTasks).toEqual({
                ...input.overdueTasks,
                desktop: false,
            });
        });
    });

    describe('shouldSendPushNotification', () => {
        const withPrefs = (prefs) => ({ notification_preferences: prefs });

        it('is off without preferences', () => {
            expect(shouldSendPushNotification(null, 'task_due_soon')).toBe(
                false
            );
            expect(
                shouldSendPushNotification(withPrefs(null), 'task_due_soon')
            ).toBe(false);
        });

        it('follows the push flag of the mapped preference key', () => {
            const user = withPrefs({
                dueTasks: { inApp: true, push: true },
                overdueTasks: { inApp: true, push: false },
                comments: { inApp: true, push: true },
            });
            expect(shouldSendPushNotification(user, 'task_due_soon')).toBe(
                true
            );
            expect(shouldSendPushNotification(user, 'task_overdue')).toBe(
                false
            );
            expect(shouldSendPushNotification(user, 'mention')).toBe(true);
            expect(shouldSendPushNotification(user, 'comment_added')).toBe(
                true
            );
            expect(shouldSendPushNotification(user, 'deferUntil')).toBe(false);
        });
    });

    describe('deliverySources', () => {
        it('lists every extra channel the user turned on', () => {
            const user = {
                notification_preferences: {
                    taskAssigned: { inApp: true, telegram: true, push: true },
                    dueTasks: { inApp: true, telegram: false, push: true },
                },
            };
            expect(deliverySources(user, 'task_assigned')).toEqual([
                'telegram',
                'push',
            ]);
            expect(deliverySources(user, 'task_due_soon')).toEqual([
                'push',
                'desktop',
            ]);
            expect(deliverySources(user, 'project_overdue')).toEqual([]);
        });
    });
});

describe('desktop channel', () => {
    const {
        shouldSendDesktopNotification,
        reminderSources,
        deliverySources,
        ensureNotificationPreferences,
    } = require('../../../utils/notificationPreferences');

    it('rings on the desktop by default for reminders, due soon and deferred tasks only', () => {
        const user = { notification_preferences: null };
        expect(shouldSendDesktopNotification(user, 'task_due_soon')).toBe(true);
        expect(shouldSendDesktopNotification(user, 'deferUntil')).toBe(true);
        expect(shouldSendDesktopNotification(user, 'task_reminder')).toBe(true);
        expect(shouldSendDesktopNotification(user, 'comment_added')).toBe(
            false
        );
    });

    it('keeps task reminders off the desktop when the user turns them off', () => {
        const off = {
            notification_preferences: { taskReminders: { desktop: false } },
        };
        expect(shouldSendDesktopNotification(off, 'task_reminder')).toBe(false);
        expect(reminderSources(off, 'task_reminder')).not.toContain('desktop');
    });

    it('honours an explicit off for due soon', () => {
        const off = {
            notification_preferences: { dueTasks: { desktop: false } },
        };
        expect(shouldSendDesktopNotification(off, 'task_due_soon')).toBe(false);
        expect(deliverySources(off, 'task_due_soon')).not.toContain('desktop');
    });

    it('fills desktop from defaults for stored preferences that predate it', () => {
        const result = ensureNotificationPreferences({
            dueTasks: { inApp: true },
            taskReminders: { inApp: true },
        });
        expect(result.dueTasks.desktop).toBe(true);
        expect(result.taskReminders.desktop).toBe(true);
        expect(result.habitReminders).toEqual({
            inApp: true,
            email: false,
            push: false,
            telegram: false,
            apprise: false,
            desktop: false,
        });
    });

    it('maps habit reminders to their own key, in-app only by default', () => {
        expect(NOTIFICATION_TYPE_MAPPING.habit_reminder).toBe('habitReminders');
        const user = { notification_preferences: {} };
        expect(shouldSendInAppNotification(user, 'habit_reminder')).toBe(true);
        expect(deliverySources(user, 'habit_reminder')).toEqual([]);
    });
});
