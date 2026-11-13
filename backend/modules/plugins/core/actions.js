'use strict';

// Page actions: buttons a plugin adds to the header of Cadence pages
// (docs/46-plugins.md). A click opens the plugin's own page with the action
// and what the page shows in the query, so the plugin needs a `menu` page.
// Each place is drawn by the web and Android clients; a new place is added
// here and on both clients in the same change.
const ACTION_PLACES = [
    'plan',
    'today',
    'inbox',
    'project',
    'triage',
    'overdue',
];
const ACTION_ID = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_ACTIONS = 10;
const MAX_LABEL = 30;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function parseAction(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { error: 'an action is not an object' };
    }
    const id = text(raw.id);
    if (!ACTION_ID.test(id)) {
        return { error: `action id "${raw.id}" is not valid` };
    }
    const label = text(raw.label);
    if (!label || label.length > MAX_LABEL) {
        return {
            error: `action "${id}" needs a label (${MAX_LABEL} characters at most)`,
        };
    }
    const places = Array.isArray(raw.places) ? raw.places : [];
    if (places.length === 0 || places.some((p) => !ACTION_PLACES.includes(p))) {
        return {
            error: `action "${id}" places can only be: ${ACTION_PLACES.join(', ')}`,
        };
    }
    return {
        action: {
            id,
            label,
            places: ACTION_PLACES.filter((p) => places.includes(p)),
        },
    };
}

function parseActions(raw, hasPage) {
    if (raw === undefined || raw === null) return { actions: [] };
    if (!Array.isArray(raw) || raw.length > MAX_ACTIONS) {
        return {
            error: `actions must be a list of at most ${MAX_ACTIONS} buttons`,
        };
    }
    if (raw.length > 0 && !hasPage) {
        return { error: 'actions open the plugin page: declare a menu page' };
    }
    const actions = [];
    for (const entry of raw) {
        const { action, error } = parseAction(entry);
        if (error) return { error };
        if (actions.some((a) => a.id === action.id)) {
            return { error: `action "${action.id}" is declared twice` };
        }
        actions.push(action);
    }
    return { actions };
}

module.exports = { ACTION_PLACES, parseActions };
