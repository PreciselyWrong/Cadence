'use strict';

const { Op } = require('sequelize');
const { AgentDecision } = require('../../models');

const findByKey = (userId, kind, key) =>
    AgentDecision.findOne({ where: { user_id: userId, kind, key } });

const findByUid = (userId, uid) =>
    AgentDecision.findOne({ where: { user_id: userId, uid } });

const createCard = (attrs) => AgentDecision.create(attrs);

const updateCard = (row, attrs) => row.update(attrs);

const updateWhere = (attrs, where) => AgentDecision.update(attrs, { where });

const purgeOlderThan = (userId, cutoff) =>
    AgentDecision.destroy({
        where: {
            user_id: userId,
            status: 'done',
            decided_at: { [Op.lt]: cutoff },
        },
    });

const findDue = (userId, now) =>
    AgentDecision.findAll({
        where: {
            user_id: userId,
            [Op.or]: [
                { status: 'pending' },
                { status: 'later', later_until: { [Op.lte]: now } },
            ],
        },
        order: [['created_at', 'DESC']],
    });

const countDue = (userId, now) =>
    AgentDecision.count({
        where: {
            user_id: userId,
            [Op.or]: [
                { status: 'pending' },
                { status: 'later', later_until: { [Op.lte]: now } },
            ],
        },
    });

const findForList = (userId, { kind, status, cutoff }) => {
    const where = { user_id: userId };
    if (kind) where.kind = kind;
    if (status) {
        where.status = status;
        if (status === 'done') {
            where.decided_at = { [Op.gte]: cutoff };
        }
    } else {
        where[Op.or] = [
            { status: { [Op.ne]: 'done' } },
            { status: 'done', decided_at: { [Op.gte]: cutoff } },
        ];
    }
    return AgentDecision.findAll({
        where,
        order: [['created_at', 'DESC']],
    });
};

module.exports = {
    findByKey,
    findByUid,
    createCard,
    updateCard,
    updateWhere,
    purgeOlderThan,
    findDue,
    countDue,
    findForList,
};
