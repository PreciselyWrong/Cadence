'use strict';

// A context is something the user said about a task, an event or a series
// ("this is not a conflict, the room is shared"). While it lives, the
// question about that target is not asked again.

// target: { scope: 'task' | 'event' | 'series', ref }. The ref is the task
// uid, the event ref or the series ref, matched against target_ref.
function isSilenced(target, contexts) {
    if (!target || !Array.isArray(contexts)) return false;
    return contexts.some(
        (context) =>
            context.scope === target.scope && context.target_ref === target.ref
    );
}

module.exports = { isSilenced };
