'use strict';

const { Op } = require('sequelize');
const { Goal } = require('../../../models');
const goalsRepository = require('../../goals/repository');
const goalsService = require('../../goals/service');

const parentInputProperty = {
    parent_goal_uid: {
        type: ['string', 'null'],
        description:
            'UID of an objective: makes this goal one of its key results (one level only, never a bucket-list goal, never an objective that already has key results). Pass null to make it a top-level objective again.',
    },
};

// Where each goal sits in the tree, read in one query for a whole list:
// parent_goal_uid for a key result, key_results ({uid, title}) for an
// objective. `goals` are rows or plain objects with id and parent_goal_id.
async function hierarchyOf(goals) {
    if (goals.length === 0) return new Map();
    const ids = goals.map((g) => g.id);
    const parentIds = goals.map((g) => g.parent_goal_id).filter(Boolean);
    const [keyResults, parents] = await Promise.all([
        Goal.findAll({
            where: { parent_goal_id: { [Op.in]: ids } },
            attributes: ['uid', 'title', 'parent_goal_id'],
            order: [['title', 'ASC']],
            raw: true,
        }),
        parentIds.length
            ? Goal.findAll({
                  where: { id: { [Op.in]: parentIds } },
                  attributes: ['id', 'uid'],
                  raw: true,
              })
            : [],
    ]);
    const parentUid = new Map(parents.map((p) => [p.id, p.uid]));
    return new Map(
        goals.map((goal) => [
            goal.id,
            {
                parent_goal_uid: goal.parent_goal_id
                    ? (parentUid.get(goal.parent_goal_id) ?? null)
                    : null,
                key_results: keyResults
                    .filter((kr) => kr.parent_goal_id === goal.id)
                    .map(({ uid, title }) => ({ uid, title })),
            },
        ])
    );
}

function registerGoalTools(server, context, tools) {
    // 1. list_goals - List goals with optional filtering
    tools.push({
        name: 'list_goals',
        description: 'List goals with optional filtering by area or status',
        inputSchema: {
            type: 'object',
            properties: {
                area_id: {
                    type: 'number',
                    description: 'Filter by area ID',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'achieved', 'paused', 'dropped', 'all'],
                    description: 'Filter by status (default: all)',
                },
            },
        },
        handler: async (params) => {
            let goals;
            if (params.area_id) {
                goals = await goalsRepository.findAllByArea(
                    context.userId,
                    params.area_id
                );
            } else {
                goals = await goalsRepository.findAllByUser(context.userId);
            }

            if (params.status && params.status !== 'all') {
                goals = goals.filter((g) => g.status === params.status);
            }

            const tree = await hierarchyOf(goals);
            const serialized = goals.map((g) => ({
                id: g.id,
                uid: g.uid,
                title: g.title,
                why: g.why,
                horizon: g.horizon,
                status: g.status,
                bucket: g.bucket ?? null,
                target_date: g.target_date,
                area: g.Area
                    ? { id: g.Area.id, uid: g.Area.uid, name: g.Area.name }
                    : null,
                ...tree.get(g.id),
                progress: g.progress,
                created_at: g.created_at,
                updated_at: g.updated_at,
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            { count: serialized.length, goals: serialized },
                            null,
                            2
                        ),
                    },
                ],
            };
        },
    });

    // 2. get_goal - Get a single goal by UID
    tools.push({
        name: 'get_goal',
        description: 'Get a specific goal by its UID',
        inputSchema: {
            type: 'object',
            properties: {
                uid: {
                    type: 'string',
                    description: 'Goal UID',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const goal = await goalsRepository.findByUid(
                context.userId,
                params.uid
            );

            if (!goal) {
                throw new Error(`Goal not found: ${params.uid}`);
            }

            const [tree, summary] = await Promise.all([
                hierarchyOf([goal]),
                goalsRepository.progressOf(context.userId, goal),
            ]);
            const serialized = {
                id: goal.id,
                uid: goal.uid,
                title: goal.title,
                why: goal.why,
                horizon: goal.horizon,
                status: goal.status,
                bucket: goal.bucket ?? null,
                target_date: goal.target_date,
                area: goal.Area
                    ? {
                          id: goal.Area.id,
                          uid: goal.Area.uid,
                          name: goal.Area.name,
                      }
                    : null,
                ...tree.get(goal.id),
                progress: summary.progress,
                projects: (goal.Projects || []).map((p) => ({
                    id: p.id,
                    uid: p.uid,
                    name: p.name,
                    status: p.status,
                })),
                created_at: goal.created_at,
                updated_at: goal.updated_at,
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ goal: serialized }, null, 2),
                    },
                ],
            };
        },
    });

    // 3. create_goal - Create a new goal
    tools.push({
        name: 'create_goal',
        description: 'Create a new goal within an area',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Goal title (required)',
                },
                area_id: {
                    type: 'number',
                    description: 'Parent area ID (required)',
                },
                why: {
                    type: 'string',
                    description: 'The motivation behind the goal',
                },
                horizon: {
                    type: 'string',
                    enum: ['month', 'quarter', 'season', 'year'],
                    description: 'Time horizon (default: season)',
                },
                target_date: {
                    type: 'string',
                    description: 'Target date (YYYY-MM-DD)',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'achieved', 'paused', 'dropped'],
                    description: 'Goal status (default: active)',
                },
                bucket: {
                    type: 'string',
                    enum: ['have', 'be', 'do'],
                    description:
                        'Put the goal on the bucket list (have, be or do)',
                },
                ...parentInputProperty,
            },
            required: ['title', 'area_id'],
        },
        handler: async (params) => {
            if (!params.title || params.title.trim().length === 0) {
                throw new Error('Goal title is required');
            }

            const bucket = params.bucket || null;
            const parentId = await goalsService.resolveParentId(
                context.userId,
                null,
                params.parent_goal_uid ?? null,
                bucket
            );

            const goal = await goalsRepository.create({
                user_id: context.userId,
                area_id: params.area_id,
                parent_goal_id: parentId,
                title: params.title.trim(),
                why: params.why || null,
                horizon: params.horizon || 'season',
                target_date: params.target_date || null,
                status: params.status || 'active',
                bucket,
            });

            const reloaded = await goalsRepository.findByUid(
                context.userId,
                goal.uid
            );
            const tree = await hierarchyOf([reloaded]);

            const serialized = {
                id: reloaded.id,
                uid: reloaded.uid,
                title: reloaded.title,
                why: reloaded.why,
                horizon: reloaded.horizon,
                status: reloaded.status,
                bucket: reloaded.bucket ?? null,
                target_date: reloaded.target_date,
                area: reloaded.Area
                    ? {
                          id: reloaded.Area.id,
                          uid: reloaded.Area.uid,
                          name: reloaded.Area.name,
                      }
                    : null,
                ...tree.get(reloaded.id),
                created_at: reloaded.created_at,
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                message: 'Goal created successfully',
                                goal: serialized,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },
    });

    // 4. update_goal - Update an existing goal
    tools.push({
        name: 'update_goal',
        description: 'Update an existing goal',
        inputSchema: {
            type: 'object',
            properties: {
                uid: {
                    type: 'string',
                    description: 'Goal UID (required)',
                },
                title: {
                    type: 'string',
                    description: 'New title',
                },
                why: {
                    type: 'string',
                    description: 'New motivation text',
                },
                horizon: {
                    type: 'string',
                    enum: ['month', 'quarter', 'season', 'year'],
                    description: 'New time horizon',
                },
                target_date: {
                    type: 'string',
                    description:
                        'New target date (YYYY-MM-DD) or empty string to clear',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'achieved', 'paused', 'dropped'],
                    description: 'New status',
                },
                bucket: {
                    type: 'string',
                    enum: ['have', 'be', 'do'],
                    description: 'Bucket list group (have, be or do)',
                },
                ...parentInputProperty,
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const goal = await goalsRepository.findByUid(
                context.userId,
                params.uid
            );

            if (!goal) {
                throw new Error(`Goal not found: ${params.uid}`);
            }

            const updates = {};
            if (params.title !== undefined) updates.title = params.title;
            if (params.why !== undefined) updates.why = params.why;
            if (params.horizon !== undefined) updates.horizon = params.horizon;
            if (params.target_date !== undefined)
                updates.target_date =
                    params.target_date === '' ? null : params.target_date;
            if (params.status !== undefined) updates.status = params.status;
            if (params.bucket !== undefined)
                updates.bucket = params.bucket || null;
            if (params.parent_goal_uid !== undefined || updates.bucket) {
                const parentId = await goalsService.resolveParentId(
                    context.userId,
                    goal,
                    params.parent_goal_uid,
                    updates.bucket
                );
                if (params.parent_goal_uid !== undefined) {
                    updates.parent_goal_id = parentId;
                }
            }

            await goalsRepository.update(goal, updates);

            const reloaded = await goalsRepository.findByUid(
                context.userId,
                params.uid
            );
            const tree = await hierarchyOf([reloaded]);

            const serialized = {
                id: reloaded.id,
                uid: reloaded.uid,
                title: reloaded.title,
                why: reloaded.why,
                horizon: reloaded.horizon,
                status: reloaded.status,
                bucket: reloaded.bucket ?? null,
                target_date: reloaded.target_date,
                area: reloaded.Area
                    ? {
                          id: reloaded.Area.id,
                          uid: reloaded.Area.uid,
                          name: reloaded.Area.name,
                      }
                    : null,
                ...tree.get(reloaded.id),
                updated_at: reloaded.updated_at,
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                message: 'Goal updated successfully',
                                goal: serialized,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        },
    });

    // 5. delete_goal - Delete a goal
    tools.push({
        name: 'delete_goal',
        description: 'Delete a goal (linked projects become unlinked)',
        inputSchema: {
            type: 'object',
            properties: {
                uid: {
                    type: 'string',
                    description: 'Goal UID',
                },
            },
            required: ['uid'],
        },
        handler: async (params) => {
            const goal = await goalsRepository.findByUid(
                context.userId,
                params.uid
            );

            if (!goal) {
                throw new Error(`Goal not found: ${params.uid}`);
            }

            await goalsRepository.delete(goal);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            { message: 'Goal deleted successfully' },
                            null,
                            2
                        ),
                    },
                ],
            };
        },
    });
}

module.exports = { registerGoalTools };
