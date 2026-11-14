'use strict';

const BaseRepository = require('../../shared/database/BaseRepository');
const { Op } = require('sequelize');
const { Notification, User } = require('../../models');
const { AGENT_TYPES, isAgentNotification } = require('./core/agents');

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
        if (options.scope !== 'agents') {
            return Notification.getUserNotifications(userId, options);
        }
        const rows = await this.findAgentNotifications(userId, {
            unreadOnly: !options.includeRead,
        });
        return {
            notifications: rows.slice(
                options.offset,
                options.offset + options.limit
            ),
            total: rows.length,
        };
    }

    async getUnreadCount(userId, { scope } = {}) {
        if (scope !== 'agents') return Notification.getUnreadCount(userId);
        const rows = await this.findAgentNotifications(userId, {
            unreadOnly: true,
        });
        return rows.length;
    }

    // Plugin messages share the `system` type with tests, so the data is
    // read in code: no engine-specific JSON query.
    async findAgentNotifications(userId, { unreadOnly }) {
        const where = {
            user_id: userId,
            dismissed_at: null,
            type: { [Op.in]: AGENT_TYPES },
        };
        if (unreadOnly) where.read_at = null;
        const rows = await Notification.findAll({
            where,
            order: [
                ['created_at', 'DESC'],
                ['id', 'DESC'],
            ],
        });
        return rows.filter(isAgentNotification);
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
