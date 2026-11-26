'use strict';

const NAME_MAX = 200;

const clean = (name) => name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const keyOf = (name) => name.toLocaleLowerCase();

// The model's steps made safe to show: named, deduplicated (against each
// other and the task's subtasks), minutes rounded into the allowed range,
// at most `max_steps`. Anything that is not a named step is dropped.
function normalizeSteps(raw, { settings, existing = [] }) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set(existing.map((name) => keyOf(clean(name))));
    const steps = [];
    for (const step of raw) {
        if (steps.length >= settings.max_steps) break;
        if (!step || typeof step.name !== 'string') continue;
        const name = clean(step.name);
        if (!name || seen.has(keyOf(name))) continue;
        seen.add(keyOf(name));
        const minutes = Number.isFinite(Number(step.minutes))
            ? Math.round(Number(step.minutes))
            : settings.min_step_minutes;
        steps.push({
            name,
            minutes: Math.min(
                settings.max_step_minutes,
                Math.max(settings.min_step_minutes, minutes)
            ),
        });
    }
    return steps;
}

module.exports = { normalizeSteps, NAME_MAX };
