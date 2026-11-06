'use strict';

const BaseRepository = require('../../shared/database/BaseRepository');
const { Notification, User } = require('../../models');

class NotificationsRepository extends BaseRepository {
    constructor() {
        super(Notification);
    }

    async findUiSettings(userId) {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'ui_settings'],
        });
        const value = user?.ui_settings;
        if (typeof value !== 'string') return value || {};
        try {
            return JSON.parse(value) || {};
        } catch {
            return {};
        }
    }

    async saveTimedReminders(userId, timedReminders) {
        const settings = await this.findUiSettings(userId);
        await User.update(
            { ui_settings: { ...settings, timedReminders } },
            { where: { id: userId } }
        );
    }

    async getUserNotifications(userId, options) {
        return Notification.getUserNotifications(userId, options);
    }

    async getUnreadCount(userId) {
        return Notification.getUnreadCount(userId);
    }

    async markAllAsRead(userId) {
        return Notification.markAllAsRead(userId);
    }

    async findByIdAndUser(id, userId, options = {}) {
        return this.model.findOne({
            where: { id, user_id: userId, ...options },
        });
    }

    async findByUidAndUser(uid, userId, options = {}) {
        return this.model.findOne({
            where: { uid, user_id: userId, ...options },
        });
    }
}

module.exports = new NotificationsRepository();
