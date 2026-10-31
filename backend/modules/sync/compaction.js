'use strict';

const cron = require('node-cron');
const { Op, fn, col, literal } = require('sequelize');

// The journal only grows: every write adds a row. Compaction keeps, for each
// row of each entity, its latest entry, and drops the older entries once they
// are past the retention, since a device pulling later gets the full row from
// the latest entry anyway. Tombstones are the latest entry of a deleted row:
// they are kept for the retention, then dropped too. A device that had not
// pulled a dropped tombstone could never learn of the delete, so a pull from
// below the highest dropped tombstone of its user answers `reset_required`
// and the device takes a new snapshot.
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const JOB_NAME = 'sync-journal-compaction';
// Daily, at a quiet hour.
const CRON_EXPRESSION = '30 3 * * *';

const models = () => require('../../models');
const watermarkKey = (userId) => `sync_journal_purged_through:${userId}`;

function retentionDays() {
    const raw = (process.env.CADENCE_SYNC_JOURNAL_RETENTION_DAYS || '').trim();
    const days = /^\d+$/.test(raw) ? Number(raw) : 0;
    return days > 0 ? days : DEFAULT_RETENTION_DAYS;
}

// Highest tombstone id dropped from this user's journal, 0 when none was.
async function purgedThrough(userId) {
    const setting = await models().Setting.findOne({
        where: { key: watermarkKey(userId) },
    });
    return setting ? Number(setting.value) : 0;
}

async function raiseWatermark(userId, through) {
    if (through <= (await purgedThrough(userId))) return;
    await models().Setting.upsert({
        key: watermarkKey(userId),
        value: String(through),
    });
}

// A later entry for the same row makes this one useless to every device.
const SUPERSEDED = literal(
    'EXISTS (SELECT 1 FROM sync_changes later' +
        ' WHERE later.user_id = sync_changes.user_id' +
        ' AND later.entity = sync_changes.entity' +
        ' AND later.uid = sync_changes.uid' +
        ' AND later.id > sync_changes.id)'
);

async function compactJournal({
    now = new Date(),
    retentionDays: days = retentionDays(),
} = {}) {
    const { SyncChange } = models();
    const cutoff = new Date(now.getTime() - days * DAY_MS);

    const superseded = await SyncChange.destroy({
        where: { created_at: { [Op.lt]: cutoff }, [Op.and]: [SUPERSEDED] },
    });

    const expired = await SyncChange.findAll({
        attributes: ['user_id', [fn('MAX', col('id')), 'through']],
        where: { op: 'delete', created_at: { [Op.lt]: cutoff } },
        group: ['user_id'],
        raw: true,
    });
    let tombstones = 0;
    for (const { user_id: userId, through } of expired) {
        // Raised before the delete: a pull in between must already reset.
        await raiseWatermark(userId, Number(through));
        tombstones += await SyncChange.destroy({
            where: {
                user_id: userId,
                op: 'delete',
                created_at: { [Op.lt]: cutoff },
                id: { [Op.lte]: Number(through) },
            },
        });
    }

    return { removed: superseded + tombstones, superseded, tombstones };
}

let job = null;

async function runScheduledCompaction() {
    const { withJobLock } = require('../../services/jobLock');
    const { logError, logInfo } = require('../../services/logService');
    try {
        const outcome = await withJobLock(JOB_NAME, () => compactJournal());
        if (outcome.ran) {
            logInfo(
                `Sync journal compacted: ${outcome.result.removed} entries removed`
            );
        }
    } catch (error) {
        logError(error, 'Sync journal compaction failed');
    }
}

function initialize() {
    const { getConfig } = require('../../config/config');
    const config = getConfig();
    if (job || config.environment === 'test' || config.disableScheduler) {
        return false;
    }
    job = cron.schedule(CRON_EXPRESSION, runScheduledCompaction, {
        scheduled: false,
        timezone: 'UTC',
    });
    job.start();
    return true;
}

function stop() {
    if (job) job.stop();
    job = null;
}

module.exports = {
    compactJournal,
    retentionDays,
    purgedThrough,
    initialize,
    stop,
    CRON_EXPRESSION,
};
