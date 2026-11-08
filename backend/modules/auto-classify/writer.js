'use strict';

// Writing what was decided, and undoing it, through the MCP tools: they hold
// the rules of each write (rights, TODO.md tasks, tag creation), and every
// write reaches the devices through the sync journal like any other.
const { toolsFor } = require('../triage/actions');
const { SUMMARY_PREFIX } = require('./core/summary');
const repository = require('./repository');

const TOOLS = { task: 'update_task', note: 'update_note', link: 'update_link' };
const idParam = (entity, uid) => (entity === 'task' ? { id: uid } : { uid });

// The tool call for `apply` (from core/validate.js) and the fields it
// changes, before and after, as uids and names.
function planWrite(item, apply) {
    const params = idParam(item.entity, item.uid);
    const before = {};
    const after = {};
    const set = (field, from, to) => {
        before[field] = from;
        after[field] = to;
    };
    if (apply.project_uid && item.entity !== 'link') {
        params[item.entity === 'task' ? 'project_id' : 'project_uid'] =
            apply.project_uid;
        set('project_uid', null, apply.project_uid);
    }
    if (apply.area_uid && item.entity === 'task') {
        params.area_uid = apply.area_uid;
        set('area_uid', null, apply.area_uid);
    }
    if (apply.tags) {
        params.tags = apply.tags;
        set('tags', [], apply.tags);
    }
    if (apply.estimated_minutes && item.entity === 'task') {
        params.estimated_minutes = apply.estimated_minutes;
        set('estimated_minutes', null, apply.estimated_minutes);
    }
    if (apply.summary && item.entity === 'link') {
        params.note = `${SUMMARY_PREFIX}${apply.summary}`;
        set('note', item.note ?? null, params.note);
    }
    return { tool: TOOLS[item.entity], params, before, after };
}

async function applyDecision(user, item, apply) {
    const plan = planWrite(item, apply);
    if (Object.keys(plan.after).length > 0) {
        await toolsFor(user)(plan.tool, plan.params);
    }
    if (item.entity === 'task' && (apply.project_uid || apply.area_uid)) {
        await repository.askWhen(user.id, item.uid);
    }
    return { before: plan.before, after: plan.after };
}

// Puts back the `before` of one change. The caller has checked that the item
// is still in its `after` state.
async function undoChange(user, change) {
    const before = change.before || {};
    const params = idParam(change.entity, change.item_uid);
    if ('project_uid' in before) {
        params[change.entity === 'task' ? 'project_id' : 'project_uid'] =
            change.entity === 'task' ? null : '';
    }
    if ('area_uid' in before) params.area_uid = null;
    if ('tags' in before) params.tags = before.tags;
    if ('estimated_minutes' in before) params.estimated_minutes = null;
    if ('note' in before) params.note = before.note;
    await toolsFor(user)(TOOLS[change.entity], params);
    if (change.entity === 'task') {
        await repository.settleWhen(user.id, change.item_uid);
    }
}

module.exports = { planWrite, applyDecision, undoChange };
