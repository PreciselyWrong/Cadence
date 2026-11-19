'use strict';

// An agent notice whose work is done, on this client or another, no longer
// waits for the user: it is marked read, which also clears it on the phone
// (`notification_read`). Done means no mail or decision card left pending,
// or a proposal no longer open (applied, replaced, dismissed). A plugin
// message has no work behind it: only reading it settles it.
const { Op } = require('sequelize');
const {
    Notification,
    MailItem,
    AgentDecision,
    Proposal,
} = require('../../models');

const OPEN_PROPOSAL = ['pending', 'ready'];

const proposalUidOf = (notification) => {
    const data = notification.data;
    if (data && typeof data === 'object') return data.proposal_uid ?? null;
    try {
        return JSON.parse(data)?.proposal_uid ?? null;
    } catch {
        return null;
    }
};

async function settledByCount(model, userId, notices) {
    if (notices.length === 0) return [];
    const pending = await model.count({
        where: { user_id: userId, status: 'pending' },
    });
    return pending === 0 ? notices : [];
}

async function settledProposals(userId, notices) {
    const uids = [...new Set(notices.map(proposalUidOf).filter(Boolean))];
    if (uids.length === 0) return [];
    const closed = await Proposal.findAll({
        attributes: ['uid'],
        where: {
            user_id: userId,
            uid: { [Op.in]: uids },
            status: { [Op.notIn]: OPEN_PROPOSAL },
        },
    });
    const done = new Set(closed.map((row) => row.uid));
    return notices.filter((n) => done.has(proposalUidOf(n)));
}

async function settleAgentNotifications(userId) {
    const unread = await Notification.findAll({
        where: {
            user_id: userId,
            read_at: null,
            dismissed_at: null,
            type: { [Op.in]: ['mail_ready', 'decisions_ready', 'proposal'] },
        },
    });
    const ofType = (type) => unread.filter((n) => n.type === type);
    const settled = [
        ...(await settledByCount(MailItem, userId, ofType('mail_ready'))),
        ...(await settledByCount(
            AgentDecision,
            userId,
            ofType('decisions_ready')
        )),
        ...(await settledProposals(userId, ofType('proposal'))),
    ];
    for (const notification of settled) await notification.markAsRead();
}

module.exports = { settleAgentNotifications };
