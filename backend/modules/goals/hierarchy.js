'use strict';

// A goal with a parent is a key result of that objective. The tree stops at
// one level, a key result is never on the bucket list, and both ends belong
// to the same user. The REST service and offline sync share these rules.

// The reason `goal` (a row, or null for a new one) cannot take `parentId` and
// `bucket`, as a stable code; null when the change is fine.
async function problemWith({ goal, parentId, bucket, userId }) {
    const { Goal } = require('../../models');
    const effectiveBucket = bucket === undefined ? goal?.bucket : bucket;

    // undefined: the parent is not changing, only the rest is checked.
    const effectiveParent =
        parentId === undefined ? (goal?.parent_goal_id ?? null) : parentId;
    if (!effectiveParent) return null;
    if (goal && effectiveParent === goal.id) return 'invalid_hierarchy';
    if (effectiveBucket) return 'invalid_hierarchy';
    if (parentId === undefined) return null;

    const parent = await Goal.findByPk(parentId, {
        attributes: ['id', 'user_id', 'parent_goal_id'],
    });
    if (!parent || parent.user_id !== userId) return 'invalid_hierarchy';
    if (parent.parent_goal_id) return 'invalid_hierarchy';

    if (goal) {
        const hasKeyResults = await Goal.count({
            where: { parent_goal_id: goal.id },
        });
        if (hasKeyResults > 0) return 'invalid_hierarchy';
    }
    return null;
}

// Removes a goal, its key results, and the links projects and tasks held to
// them. Each step goes through the models so sync clients hear about it.
async function destroyWithDependents(goal) {
    const { Goal, Project, Task } = require('../../models');
    const keyResults = await Goal.findAll({
        where: { parent_goal_id: goal.id },
    });
    const ids = [goal.id, ...keyResults.map((kr) => kr.id)];
    await Project.update({ goal_id: null }, { where: { goal_id: ids } });
    await Task.update({ goal_id: null }, { where: { goal_id: ids } });
    for (const keyResult of keyResults) await keyResult.destroy();
    await goal.destroy();
}

module.exports = { problemWith, destroyWithDependents };
