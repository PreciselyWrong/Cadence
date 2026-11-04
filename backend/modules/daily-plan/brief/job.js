'use strict';

// The scheduled run (taskScheduler "daily_brief", every 5 minutes): builds
// the brief of each user whose time has come and who has no brief yet today
// (docs/39-daily-brief.md, "A brief is never rewritten by the job").
const moment = require('moment-timezone');
const { logger } = require('../../../services/logService');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const { briefSettingsFromUiSettings } = require('./settings');
const briefRepository = require('./repository');
const { generateBrief } = require('./generate');
const decisions = require('./decisions');
const contexts = require('./contexts');
const { purgeBriefAudio } = require('./audio');

// Due when the local clock has reached the chosen time on an active day.
function isDue(settings, local) {
    if (!settings.days.includes(local.day())) return false;
    return local.format('HH:mm') >= settings.time;
}

async function generateForUser(user, now) {
    const settings = briefSettingsFromUiSettings(user.ui_settings);
    if (!settings.enabled) return false;

    const local = moment.tz(now, getSafeTimezone(user.timezone));
    if (!isDue(settings, local)) return false;

    const today = local.format('YYYY-MM-DD');
    const row = await briefRepository.findBriefRow(user.id, today);
    if (row?.brief_status) return false;

    await generateBrief(user, today, { reason: 'job', now });
    return true;
}

// Returns how many briefs were generated. One user's failure is logged
// without any content and does not stop the others.
async function generateDueBriefs({ now = new Date() } = {}) {
    const users = await briefRepository.findAllUsersForBriefJob();
    let generated = 0;
    for (const user of users) {
        try {
            if (await generateForUser(user, now)) generated += 1;
        } catch (error) {
            logger.error(
                { code: error.code || error.name, userId: user.id },
                'Daily brief job failed for a user'
            );
        }
    }
    return { generated };
}

// Daily purge (taskScheduler "brief_purge"): decisions past their retention,
// contexts whose lifetime is over (docs/39-daily-brief.md, Memory) and brief
// audio past retention.retention.audioDays (docs/39-daily-brief.md, Audio).
async function purgeBriefMemory({ now = new Date() } = {}) {
    const contextsResult = await contexts.purgeContexts(now);
    const decisionsResult = await decisions.purgeDecisions(now);
    const audioResult = await purgeBriefAudio({ now });
    return {
        contexts: contextsResult.deleted,
        decisions: decisionsResult.deleted,
        audio: audioResult.deleted,
    };
}

module.exports = { generateDueBriefs, purgeBriefMemory, isDue };
