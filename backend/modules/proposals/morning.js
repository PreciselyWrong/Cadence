'use strict';

// Morning overdue replan job (docs/47-proposals.md): runs every 15 minutes
// and prepares one week proposal per day for each user whose local clock has
// reached their chosen time, who has overdue open tasks, an agent listening,
// and no week proposal already pending or created today.
const {
    getSafeTimezone,
    getTodayBoundsInUTC,
} = require('../../utils/timezone-utils');
const { normalizeMorningReplan } = require('../daily-plan/planningSettings');
const dailyPlan = require('../daily-plan/service');
const { logError } = require('../../services/logService');
const repository = require('./repository');
const { agentAvailable, createProposal } = require('./service');
const { isMorningRunDue, shouldRunMorningReplan } = require('./core/morning');

async function runMorningReplan(now = new Date()) {
    const users = await repository.findAllUsers();
    let triggered = 0;

    for (const user of users) {
        try {
            const setting = normalizeMorningReplan(user.ui_settings?.planning);
            if (!isMorningRunDue({ now, timezone: user.timezone, setting })) {
                continue;
            }
            const agentListening = await agentAvailable(user);
            if (!agentListening) continue;

            const timezone = getSafeTimezone(user.timezone);
            const startOfTodayUtc = getTodayBoundsInUTC(timezone).start;
            const hasWeekProposalTodayOrPending =
                await repository.hasWeekProposalPendingOrToday(
                    user.id,
                    startOfTodayUtc
                );
            if (hasWeekProposalTodayOrPending) continue;

            const overdueTasks = await dailyPlan.getOverdueTasks(user);
            const hasOverdue = overdueTasks.length > 0;

            if (
                !shouldRunMorningReplan({
                    now,
                    timezone,
                    setting,
                    hasOverdue,
                    agentListening,
                    hasWeekProposalTodayOrPending,
                })
            ) {
                continue;
            }

            const { created } = await createProposal(user, {
                kind: 'week',
                trigger: 'morning',
            });
            if (created) triggered += 1;
        } catch (error) {
            logError(
                { error, userId: user.id },
                'Morning overdue replan failed'
            );
        }
    }

    return { triggered };
}

module.exports = { runMorningReplan };
