'use strict';

// The weekend agent (Hermes, « Météo du week-end ») pushes one ready payload:
// the days, the slots to decide and the places with better weather
// (docs/48-weekend.md). The user chooses per slot in Cadence.
const text = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const weekend = () => require('../../proposals/weekend');

const ID = {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{1,64}$',
    description: 'Your own id for the slot, letters, digits, _ or -',
};
const DAY = { type: 'string', description: 'YYYY-MM-DD' };
const HTTPS = { type: 'string', description: 'https:// address' };
const WEATHER = {
    type: 'string',
    enum: ['sun', 'partly', 'cloud', 'rain', 'snow', 'storm', 'fog'],
};
const TEMP = { type: 'integer', description: 'Celsius' };

const DAY_ITEM = {
    type: 'object',
    properties: {
        date: DAY,
        weather: WEATHER,
        min: TEMP,
        max: TEMP,
    },
    required: ['date'],
};

const ACTIVITY = {
    type: 'object',
    properties: {
        title: { type: 'string', description: 'At most 120 characters' },
        url: HTTPS,
        note: { type: 'string', description: 'At most 140 characters' },
        travel: { type: 'string', description: 'At most 30 characters' },
        start: { type: 'string', description: 'HH:MM' },
        end: { type: 'string', description: 'HH:MM' },
        after: {
            type: 'string',
            description: 'Follow-up line, at most 120 characters',
        },
    },
    required: ['title'],
};

const SLOT = {
    type: 'object',
    properties: {
        id: ID,
        date: { ...DAY, description: 'One of days[].date' },
        part: { type: 'string', enum: ['morning', 'afternoon', 'day'] },
        weather: WEATHER,
        temp: TEMP,
        feels: { ...TEMP, description: 'Felt temperature' },
        busy: {
            type: 'string',
            description:
                'What the calendar already holds, at most 120 characters; a busy slot has no activity',
        },
        after: {
            type: 'string',
            description:
                'Follow-up line of the slot, at most 120 characters (« Ensuite : balade à Dizy »), used for busy slots',
        },
        activity: ACTIVITY,
        recommended: {
            type: 'boolean',
            description: 'Preselects « Mettre à l’agenda »',
        },
    },
    required: ['id', 'date', 'part'],
};

const PLACE = {
    type: 'object',
    properties: {
        place: { type: 'string', description: 'At most 60 characters' },
        date: DAY,
        weather: WEATHER,
        temp: TEMP,
        travel: { type: 'string', description: 'At most 30 characters' },
    },
    required: ['place', 'date'],
};

function registerWeekendTools(server, context, tools) {
    tools.push({
        name: 'propose_weekend',
        description:
            'Push the week-end outing proposal: a headline, up to two days with their weather, up to six slots (morning, afternoon or day) with an activity to decide, or busy when the calendar already holds the slot, and up to five places with better weather. Replaces the ready weekend proposal; the final decisions of the slots with the same id carry over. Invalid entries are dropped; a payload without a valid slot is refused. Cadence computes nothing here: send what you found.',
        inputSchema: {
            type: 'object',
            properties: {
                headline: {
                    type: 'string',
                    description: 'At most 60 characters',
                },
                subtitle: {
                    type: 'string',
                    description: 'At most 160 characters',
                },
                days: { type: 'array', items: DAY_ITEM, maxItems: 2 },
                slots: { type: 'array', items: SLOT, maxItems: 6 },
                elsewhere: { type: 'array', items: PLACE, maxItems: 5 },
            },
            required: ['headline', 'slots'],
        },
        handler: async (params) =>
            text(await weekend().proposeWeekend(context.user, params)),
    });
}

module.exports = { registerWeekendTools };
