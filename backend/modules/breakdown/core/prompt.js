'use strict';

const SYSTEM = [
    'You split one personal task into small concrete steps, in order.',
    'Each step is a physical next action someone can start right away, named in the language of the task, without numbering.',
    'Give each step its duration in whole minutes, between min_minutes and max_minutes; the first step is the smallest.',
    'Return at most max_steps steps and never repeat an existing step.',
    'Answer only with the JSON object of the schema.',
].join(' ');

// The narrowest context that names the task: its name, its note shortened to
// `note_chars`, and the subtasks it already has.
function buildMessages(task, settings) {
    return [
        { role: 'system', content: SYSTEM },
        {
            role: 'user',
            content: JSON.stringify({
                task: task.name,
                note: (task.note || '').slice(0, settings.note_chars),
                existing_steps: task.subtasks,
                max_steps: settings.max_steps,
                min_minutes: settings.min_step_minutes,
                max_minutes: settings.max_step_minutes,
            }),
        },
    ];
}

const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['steps'],
    properties: {
        steps: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'minutes'],
                properties: {
                    name: { type: 'string' },
                    minutes: { type: 'integer' },
                },
            },
        },
    },
};

module.exports = { buildMessages, SCHEMA };
