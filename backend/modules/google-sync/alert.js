'use strict';

// A failed Google sync warns the user in the app (bell on the web, Notifications
// and a system notification on Android, the Linux client): one unread warning
// while it keeps failing, marked read as soon as a run works again.
const { Notification } = require('../../models');
const { logError } = require('../../services/logService');

const KIND = 'google_sync';
const SETTINGS_PATH = '/profile?section=calendars';

const isAlert = (row) => row.data && row.data.kind === KIND;

async function openAlerts(userId) {
    const rows = await Notification.findAll({
        where: { user_id: userId, type: 'system', read_at: null },
    });
    return rows.filter((row) => !row.dismissed_at && isAlert(row));
}

function messageFor(revoked) {
    return revoked
        ? "L'accès Google a expiré. Reconnecte Google dans Réglages › Agendas sur le téléphone, ou sur le web dans Profil › Calendriers : en attendant, l'agenda et les tâches ne se synchronisent plus."
        : 'La dernière synchronisation avec Google a échoué ; elle sera retentée toute seule. Détail sur le web, dans Profil › Calendriers.';
}

async function warn(userId, { revoked }) {
    try {
        if ((await openAlerts(userId)).length > 0) return;
        await Notification.createNotification({
            userId,
            type: 'system',
            level: 'error',
            title: 'Synchronisation Google en échec',
            message: messageFor(revoked),
            // agent / agentLabel: its own group and name on the phone.
            data: {
                kind: KIND,
                openPath: SETTINGS_PATH,
                agent: KIND,
                agentLabel: 'Agenda Google',
            },
            sources: ['mobile', 'desktop'],
        });
    } catch (error) {
        logError('Could not create the Google sync alert:', error);
    }
}

async function clear(userId) {
    try {
        for (const row of await openAlerts(userId)) await row.markAsRead();
    } catch (error) {
        logError('Could not clear the Google sync alert:', error);
    }
}

module.exports = { warn, clear, KIND, SETTINGS_PATH };
