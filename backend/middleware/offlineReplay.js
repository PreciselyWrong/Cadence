'use strict';

const hlc = require('../modules/sync/hlc');
const { runWithOfflineWrite } = require('../modules/sync/context');
const { isValidUid } = require('../utils/uid');

const CLOCK_HEADER = 'X-Cadence-Offline-Clock';
const UID_HEADER = 'X-Cadence-Create-Uid';

// The REST paths a POST creates a synced row on, and that row's entity.
const CREATES = {
    task: 'task',
    note: 'note',
    project: 'project',
    inbox: 'inbox_item',
    areas: 'area',
    tag: 'tag',
    goals: 'goal',
};

function createdEntity(req) {
    if (req.method !== 'POST') return null;
    const parts = req.path.split('/').filter(Boolean);
    if (parts[0] === 'v1') parts.shift();
    return parts.length === 1 ? (CREATES[parts[0]] ?? null) : null;
}

// A write the web UI made offline and sends once the server is back
// (public/sw.js). The sync hooks stamp its fields with the clock of when it
// was made instead of the server's, so a field changed elsewhere since then
// keeps its newer value and the offline one is recorded as a conflict, as
// for a device push (docs/fork/WEB-OFFLINE.md). Mount after requireAuth.
function offlineReplay(req, res, next) {
    const clock = req.get(CLOCK_HEADER);
    const createUid = req.get(UID_HEADER);
    if (clock === undefined && createUid === undefined) return next();

    if (clock !== undefined && !hlc.isAcceptable(clock)) {
        return res.status(400).json({ error: 'invalid_offline_clock' });
    }
    const entity = createdEntity(req);
    if (createUid !== undefined && (!entity || !isValidUid(createUid))) {
        return res.status(400).json({ error: 'invalid_create_uid' });
    }

    return runWithOfflineWrite(
        {
            opId: clock ? `web:${clock}` : null,
            clock: clock ?? null,
            createUid: createUid ? { entity, uid: createUid } : null,
        },
        next
    );
}

module.exports = offlineReplay;
