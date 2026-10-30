'use strict';

const { GoogleCalendar, GoogleEvent, GoogleTaskLink } = require('../../models');

// Same rule as eventsService.isWritable (which requires this module).
const isWritable = (calendar) =>
    ['owner', 'writer'].includes(calendar.access_role);
const {
    hash,
    localEventProjection,
    remoteEventProjection,
    toGoogleEvent,
    fromGoogleEvent,
    storedEventFields,
} = require('./mapping');
const local = require('./localTasks');
const { guard } = require('./guard');

// A first sync (or one after Google drops the sync token) starts here.
const FULL_SYNC_PAST_DAYS = 90;
const TUDUDI_CALENDAR_NAME = 'Cadence';

const fullSyncFrom = () =>
    new Date(Date.now() - FULL_SYNC_PAST_DAYS * 86400000).toISOString();

// Lists changes since the stored sync token; a 410 means the token expired
// and everything is fetched again.
async function fetchChanges(client, calendar, onReset) {
    try {
        return await client.listEvents(calendar.google_id, {
            syncToken: calendar.sync_token || undefined,
            timeMin: calendar.sync_token ? undefined : fullSyncFrom(),
        });
    } catch (error) {
        if (error.status !== 410 || !calendar.sync_token) throw error;
        await onReset();
        await calendar.update({ sync_token: null });
        return client.listEvents(calendar.google_id, {
            timeMin: fullSyncFrom(),
        });
    }
}

// The secondary calendar that holds dated tasks; made on the first sync and
// again if the user deletes it on Google.
async function ensureTududiCalendar(ctx, account) {
    const { client, timezone } = ctx;
    if (account.tududi_calendar_id) {
        try {
            await client.getCalendar(account.tududi_calendar_id);
            return account.tududi_calendar_id;
        } catch (error) {
            if (error.status !== 404 && error.status !== 410) throw error;
            await GoogleTaskLink.destroy({
                where: { user_id: ctx.user.id, kind: 'event' },
            });
        }
    }
    const created = await client.createCalendar(TUDUDI_CALENDAR_NAME, timezone);
    await account.update({ tududi_calendar_id: created.id });
    return created.id;
}

async function syncCalendarList(ctx, account) {
    const { client, user } = ctx;
    const items = await client.listCalendars();
    const rows = await GoogleCalendar.findAll({ where: { user_id: user.id } });
    const byGoogleId = new Map(rows.map((row) => [row.google_id, row]));
    const seen = new Set();

    for (const item of items) {
        if (item.deleted) continue;
        seen.add(item.id);
        const fields = {
            summary: (item.summaryOverride || item.summary || item.id).slice(
                0,
                255
            ),
            color: item.backgroundColor || null,
            access_role: item.accessRole || 'reader',
            is_primary: Boolean(item.primary),
            is_tududi: item.id === account.tududi_calendar_id,
        };
        const row = byGoogleId.get(item.id);
        if (row) {
            await row.update(fields);
        } else {
            byGoogleId.set(
                item.id,
                await GoogleCalendar.create({
                    user_id: user.id,
                    google_id: item.id,
                    // Hidden in Google stays hidden here at first.
                    show_on_calendar: !item.hidden && item.selected !== false,
                    ...fields,
                })
            );
        }
    }

    for (const row of rows) {
        if (seen.has(row.google_id)) continue;
        await GoogleEvent.destroy({ where: { google_calendar_id: row.id } });
        await row.destroy();
        byGoogleId.delete(row.google_id);
    }
    return [...byGoogleId.values()];
}

// Other calendars are copied locally so Calendar, Today and the planner
// read them without calling Google.
async function syncCalendarEvents(ctx, calendar) {
    const { items, nextSyncToken } = await fetchChanges(
        ctx.client,
        calendar,
        () =>
            GoogleEvent.destroy({ where: { google_calendar_id: calendar.id } })
    );
    ctx.pullFailed = false;
    for (const event of items) {
        await guard(ctx, 'pull', () =>
            storeEvent(ctx.user.id, calendar, event)
        );
    }
    if (nextSyncToken && !ctx.pullFailed) {
        await calendar.update({ sync_token: nextSyncToken });
    }
}

async function storeEvent(userId, calendar, event) {
    const where = { google_calendar_id: calendar.id, event_id: event.id };
    if (event.status === 'cancelled') {
        await GoogleEvent.destroy({ where });
        return null;
    }
    if (!event.start) return null;
    const fields = storedEventFields(event);
    const row = await GoogleEvent.findOne({ where });
    if (row) return row.update(fields);
    return GoogleEvent.create({ ...where, user_id: userId, ...fields });
}

// Dated, open tasks <-> events of the calendar that receives them: the
// Cadence calendar, or one of the user's own calendars. In the latter, only
// events marked with a task uid are tasks; the others are kept as ordinary
// events.
async function syncTaskCalendar(ctx, calendar) {
    const { client, user, timezone } = ctx;
    const calendarId = calendar.google_id;
    const ownCalendar = calendar.is_tududi;
    const links = await GoogleTaskLink.findAll({
        where: { user_id: user.id, kind: 'event' },
    });
    // The target changed: events in the previous calendar are deleted there
    // and pushed again here.
    const moving = links.filter((l) => l.container_id !== calendarId);
    if (moving.length) {
        ctx.log?.(
            'info',
            `Moving ${moving.length} task event(s) to "${calendar.summary}"`
        );
    }
    for (const link of moving) {
        await guard(ctx, 'push', async () => {
            await client.deleteEvent(link.container_id, link.google_id);
            await link.update({
                container_id: calendarId,
                google_id: `moved-${link.id}`,
                local_hash: null,
            });
        });
    }
    const byGoogle = new Map(links.map((link) => [link.google_id, link]));
    const byTask = new Map(links.map((link) => [link.task_id, link]));
    const tasks = await local.loadTasks(
        user.id,
        links.map((link) => link.task_id)
    );
    const tasksById = new Map(tasks.map((task) => [task.id, task]));

    const { items, nextSyncToken } = await fetchChanges(
        client,
        calendar,
        async () => {
            if (!ownCalendar) {
                await GoogleEvent.destroy({
                    where: { google_calendar_id: calendar.id },
                });
            }
        }
    );
    const keepAsEvent = (event) =>
        calendar.sync_mode === 'hidden'
            ? null
            : storeEvent(user.id, calendar, event);

    // Pull: Google -> Tududi
    ctx.pullFailed = false;
    for (const event of items) {
        await guard(ctx, 'pull', async () => {
            let link = byGoogle.get(event.id);
            let task = link ? tasksById.get(link.task_id) : null;

            if (event.status === 'cancelled') {
                // Deleting the event takes the date off the task; the task
                // stays.
                if (!link) {
                    if (!ownCalendar) await keepAsEvent(event);
                    return;
                }
                if (task && task.due_date) {
                    await task.update({
                        due_date: null,
                        due_has_time: false,
                        start_date: null,
                        start_has_time: false,
                    });
                }
                await link.destroy();
                byGoogle.delete(event.id);
                byTask.delete(link.task_id);
                return;
            }
            if (!event.start) return;
            const remoteHash = hash(remoteEventProjection(event));

            if (!link) {
                const taskUid =
                    event.extendedProperties?.private?.tududiTaskUid;
                if (!ownCalendar && !taskUid) {
                    // The user's own event: never turned into a task.
                    await keepAsEvent(event);
                    return;
                }
                task = taskUid
                    ? tasks.find((candidate) => candidate.uid === taskUid)
                    : null;
                if (!task && taskUid) return;
                if (!ownCalendar) {
                    await GoogleEvent.destroy({
                        where: {
                            google_calendar_id: calendar.id,
                            event_id: event.id,
                        },
                    });
                }
                if (!task) {
                    // An event added to the Tududi calendar on Google
                    // becomes a task.
                    task = await local.createTask(user, {
                        ...fromGoogleEvent(event, null, timezone),
                        name: event.summary || '(untitled)',
                        note: event.description || null,
                    });
                    tasksById.set(task.id, task);
                }
                link = await GoogleTaskLink.create({
                    user_id: user.id,
                    task_id: task.id,
                    kind: 'event',
                    container_id: calendarId,
                    google_id: event.id,
                    local_hash: hash(localEventProjection(task, timezone)),
                    remote_hash: remoteHash,
                });
                byGoogle.set(event.id, link);
                byTask.set(task.id, link);
                return;
            }

            if (!task || remoteHash === link.remote_hash) return;
            const localChanged =
                hash(localEventProjection(task, timezone)) !== link.local_hash;
            if (localChanged) {
                const cadenceWins =
                    new Date(task.updated_at) > new Date(event.updated || 0);
                ctx.log?.(
                    'conflict',
                    `"${task.name}" changed in Cadence and in Google Calendar: the ${
                        cadenceWins ? 'Cadence' : 'Google'
                    } edit, made later, was kept`,
                    task.uid
                );
                if (cadenceWins) return;
            }
            const attrs = fromGoogleEvent(event, task, timezone);
            if (Object.keys(attrs).length) await task.update(attrs);
            await link.update({
                remote_hash: remoteHash,
                local_hash: hash(localEventProjection(task, timezone)),
            });
        });
    }

    // Push: Tududi -> Google
    for (const link of [...byTask.values()]) {
        await guard(ctx, 'push', async () => {
            if (tasksById.has(link.task_id)) return;
            await client.deleteEvent(link.container_id, link.google_id);
            await link.destroy();
            byTask.delete(link.task_id);
        });
    }

    for (const task of tasksById.values()) {
        await guard(
            ctx,
            'push',
            async () => {
                const link = byTask.get(task.id);
                if (!local.belongsOnCalendar(task, ctx.account)) {
                    // Done, undated, or (with Google Tasks on) without a time:
                    // off the calendar.
                    if (link) {
                        await client.deleteEvent(
                            link.container_id,
                            link.google_id
                        );
                        await link.destroy();
                        byTask.delete(task.id);
                    }
                    return;
                }
                const localHash = hash(localEventProjection(task, timezone));
                if (link && link.local_hash === localHash) return;
                const body = toGoogleEvent(task, timezone, local.taskUrl(task));
                const moved = link && link.google_id.startsWith('moved-');
                const saved =
                    link && !moved
                        ? await client.patchEvent(
                              calendarId,
                              link.google_id,
                              body
                          )
                        : await client.insertEvent(calendarId, body);
                const fields = {
                    container_id: calendarId,
                    google_id: saved.id,
                    local_hash: localHash,
                    remote_hash: hash(remoteEventProjection(saved)),
                };
                if (link) {
                    await link.update(fields);
                } else {
                    byTask.set(
                        task.id,
                        await GoogleTaskLink.create({
                            user_id: user.id,
                            task_id: task.id,
                            kind: 'event',
                            ...fields,
                        })
                    );
                }
            },
            task.uid
        );
    }

    if (nextSyncToken && !ctx.pullFailed) {
        await calendar.update({ sync_token: nextSyncToken });
    }
}

// The calendar that receives the tasks. A chosen calendar that is gone or
// no longer writable falls back to the Cadence calendar.
async function taskCalendar(ctx, account) {
    if (account.task_calendar_id) {
        const calendars = await syncCalendarList(ctx, account);
        const chosen = calendars.find(
            (row) => row.google_id === account.task_calendar_id
        );
        if (chosen && isWritable(chosen) && !chosen.is_tududi) {
            return { calendars, target: chosen };
        }
        await account.update({ task_calendar_id: null });
    }
    const id = await ensureTududiCalendar(ctx, account);
    const calendars = await syncCalendarList(ctx, account);
    return {
        calendars,
        target: calendars.find((row) => row.google_id === id),
    };
}

async function syncCalendars(ctx, account) {
    const { calendars, target } = await taskCalendar(ctx, account);
    for (const calendar of calendars) {
        if (calendar === target) {
            await syncTaskCalendar(ctx, calendar);
        } else if (calendar.is_tududi) {
            // Not receiving tasks at the moment: nothing to read there.
            continue;
        } else if (
            calendar.access_role !== 'freeBusyReader' &&
            calendar.sync_mode !== 'hidden'
        ) {
            await syncCalendarEvents(ctx, calendar);
        }
    }
}

module.exports = {
    syncCalendars,
    storeEvent,
    TUDUDI_CALENDAR_NAME,
};
