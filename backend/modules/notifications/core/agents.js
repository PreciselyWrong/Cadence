'use strict';

// What an agent asks of the user: a proposal, mails to sort, or a plugin
// (Hermes) message. Reminders and due dates ring on the device and stay out
// of the bell and the phone's Notifications screen (docs/36-notifications.md).
const AGENT_TYPES = ['proposal', 'mail_ready', 'decisions_ready', 'system'];

function readData(data) {
    if (typeof data !== 'string') return data || null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

function isAgentNotification(notification) {
    if (notification.type === 'proposal') return true;
    if (notification.type === 'mail_ready') return true;
    if (notification.type === 'decisions_ready') return true;
    const pluginId = readData(notification.data)?.pluginId;
    return typeof pluginId === 'string' && pluginId !== '';
}

module.exports = { AGENT_TYPES, isAgentNotification };
