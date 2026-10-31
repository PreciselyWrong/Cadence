'use strict';

// The groups every user starts with, as in android/domain HabitGroup.defaults().
// Their ids are fixed strings shared by all users; the always-available
// `group-day` is where a habit falls back when its group is deleted.
const DEFAULT_GROUPS = [
    {
        uid: 'group-day',
        name: 'Journée',
        start_minute: null,
        end_minute: null,
        sort_order: 0,
    },
    {
        uid: 'group-morning',
        name: 'Matin',
        start_minute: 5 * 60,
        end_minute: 12 * 60,
        sort_order: 1,
    },
    {
        uid: 'group-afternoon',
        name: 'Après-midi',
        start_minute: 12 * 60,
        end_minute: 18 * 60,
        sort_order: 2,
    },
    {
        uid: 'group-evening',
        name: 'Soir',
        start_minute: 18 * 60,
        end_minute: 23 * 60,
        sort_order: 3,
    },
];

// The oldest possible clock: a device that already renamed or moved one of
// its own groups wins the merge over the group the server made up.
const FLOOR_CLOCK = '0000000000001-0000-server';

// Creates the default groups of a user who has none. A user who deleted some
// on purpose does not get them back.
async function ensureDefaultGroups(userId, options = {}) {
    const { HabitGroup } = require('../../../../models');
    if (
        (await HabitGroup.count({
            where: { user_id: userId },
            transaction: options.transaction,
        })) > 0
    ) {
        return;
    }
    for (const group of DEFAULT_GROUPS) {
        const { uid, ...fields } = group;
        await HabitGroup.create(
            {
                uid,
                user_id: userId,
                ...fields,
                field_clocks: Object.fromEntries(
                    Object.keys(fields).map((key) => [key, FLOOR_CLOCK])
                ),
            },
            { ...options, syncApplied: true }
        );
    }
}

module.exports = { DEFAULT_GROUPS, ensureDefaultGroups };
