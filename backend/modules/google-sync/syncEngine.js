'use strict';

const { GoogleAccount, User } = require('../../models');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { logError } = require('../../services/logService');
const { GoogleClient, GoogleAuthRevokedError } = require('./client');
const { syncCalendars } = require('./calendarsSync');
const { syncTasks } = require('./tasksSync');
const syncLog = require('./syncLog');

// One run per user at a time in this process.
const running = new Map();

async function runSync(account) {
    const user = await User.findByPk(account.user_id);
    if (!user) return;
    const ctx = {
        user,
        account,
        client: new GoogleClient(account),
        timezone: getSafeTimezone(user.timezone),
        log: syncLog.collector(),
    };
    try {
        if (account.sync_events) await syncCalendars(ctx, account);
        if (account.sync_tasks) await syncTasks(ctx, account);
        const skipped = ctx.itemErrors || [];
        await account.update({
            last_synced_at: new Date(),
            last_error: skipped.length
                ? `${skipped.length} item(s) could not sync: ${skipped[0]}`.slice(
                      0,
                      1000
                  )
                : null,
        });
    } catch (error) {
        const message =
            error instanceof GoogleAuthRevokedError
                ? error.message
                : `Google sync failed: ${error.message}`;
        logError(`Google sync for user ${account.user_id} failed:`, error);
        await account.update({ last_error: message.slice(0, 1000) });
        ctx.log('error', message);
        throw error;
    } finally {
        try {
            await syncLog.write(account.user_id, ctx.log.entries);
        } catch (error) {
            logError('Could not write the Google sync log:', error);
        }
    }
}

function syncUser(userId) {
    if (running.has(userId)) return running.get(userId);
    const promise = (async () => {
        const account = await GoogleAccount.findOne({
            where: { user_id: userId },
        });
        if (account) await runSync(account);
    })().finally(() => running.delete(userId));
    running.set(userId, promise);
    return promise;
}

async function syncAll() {
    const accounts = await GoogleAccount.findAll({ attributes: ['user_id'] });
    for (const { user_id: userId } of accounts) {
        try {
            await syncUser(userId);
        } catch {
            // Logged and saved on the account; the next user still syncs.
        }
    }
}

module.exports = { syncUser, syncAll };
