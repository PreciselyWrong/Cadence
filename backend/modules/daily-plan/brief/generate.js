'use strict';

// Builds and stores a day's brief (docs/39-daily-brief.md). Writes only the
// brief columns of the day's row: never a task, an event or a mail.
const { logger } = require('../../../services/logService');
const { getSafeTimezone } = require('../../../utils/timezone-utils');
const dailyPlanService = require('../service');
const { runRequest } = require('../../agents');
const briefRepository = require('./repository');
const { getBriefSettings } = require('./service');
const { collectInput } = require('./collect');
const { buildBrief } = require('./build');
const { writeBrief } = require('./writer');

// Mail replies still running, so tests and shutdown can wait for them.
const pendingReplies = new Set();

const withSource = (sources, source) => [
    ...sources.filter((item) => item.id !== source.id),
    source,
];

const isMailPending = (brief) =>
    brief.sources.some(
        (source) => source.id === 'mail' && source.status === 'pending'
    );

// Fills the replies of one version. A version that was replaced meanwhile
// (Regenerate) is left alone: saveBriefIfVersion checks it in the same write.
async function saveRepliesOutcome({ planId, version, change }) {
    const row = await briefRepository.findPlanRowById(planId);
    if (!row?.brief || row.brief_version !== version) return;
    await briefRepository.saveBriefIfVersion(planId, version, {
        brief: change(row.brief),
        brief_status: 'ready',
    });
}

// Asks the mail agent for the replies while the brief is already shown. On
// success only replies, counters.replies and the mail source change.
function startRepliesRequest({ user, planId, planDate, version, settings }) {
    const idempotencyKey = `brief:${user.id}:${planDate}:v${version}:replies`;
    const job = (async () => {
        try {
            const { data } = await runRequest(
                user,
                'replies_list',
                {
                    accounts: settings.mail.accounts,
                    excludedAccounts: settings.mail.excludedAccounts,
                    windowDays: settings.mail.replyWindowDays,
                },
                { idempotencyKey }
            );
            await saveRepliesOutcome({
                planId,
                version,
                change: (brief) => ({
                    ...brief,
                    replies: data.replies,
                    counters: {
                        ...brief.counters,
                        replies: data.replies.length,
                    },
                    sources: withSource(brief.sources, {
                        id: 'mail',
                        status: 'read',
                        detail: null,
                    }),
                }),
            });
        } catch (error) {
            const code = error.code || 'failed';
            logger.error(
                { code, userId: user.id, version },
                'Daily brief mail replies unavailable'
            );
            await saveRepliesOutcome({
                planId,
                version,
                change: (brief) => ({
                    ...brief,
                    sources: withSource(brief.sources, {
                        id: 'mail',
                        status: 'unavailable',
                        detail: code,
                    }),
                }),
            });
        }
    })();
    pendingReplies.add(job);
    job.finally(() => pendingReplies.delete(job));
}

async function settlePendingReplies() {
    await Promise.allSettled([...pendingReplies]);
}

async function recordFailure(user, row, error) {
    logger.error(
        { code: error.code || error.name, userId: user.id },
        'Daily brief generation failed'
    );
    // The previous good brief, if any, stays as it was.
    await briefRepository.saveBrief(row.id, { brief_status: 'failed' });
}

// reason 'job': a day that already has a brief (of any status) is returned
// unchanged. reason 'manual': a new version, always (Regenerate).
async function generateBrief(
    user,
    date,
    { reason = 'manual', now = new Date() } = {}
) {
    const timezone = getSafeTimezone(user.timezone);
    const planDate = dailyPlanService.resolvePlanDate(date, timezone);
    const row = await briefRepository.ensurePlanRow(user.id, planDate);
    // A freshly created row has no brief_status yet: falsy means no brief.
    if (reason === 'job' && row.brief_status) return row;

    try {
        const settings = await getBriefSettings(user);
        const input = await collectInput(user, settings, {
            today: planDate,
            now,
        });
        const built = buildBrief(input, settings);
        const tasksByUid = new Map(input.tasks.map((task) => [task.uid, task]));
        const written = await writeBrief({
            userId: user.id,
            brief: built,
            tasksByUid,
            settings,
        });
        const brief = {
            ...written.brief,
            sources: withSource(written.brief.sources, written.llm),
        };

        const version = (row.brief_version ?? 0) + 1;
        const pending = isMailPending(brief);
        await briefRepository.saveBrief(row.id, {
            brief,
            brief_version: version,
            brief_status: pending ? 'partial' : 'ready',
            brief_generated_at: now,
        });

        if (pending) {
            startRepliesRequest({
                user,
                planId: row.id,
                planDate,
                version,
                settings,
            });
        }
    } catch (error) {
        await recordFailure(user, row, error);
    }
    return briefRepository.findPlanRowById(row.id);
}

module.exports = { generateBrief, settlePendingReplies };
