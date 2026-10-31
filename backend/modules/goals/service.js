'use strict';

const goalsRepository = require('./repository');
const goalHierarchy = require('./hierarchy');
const { Area, Goal } = require('../../models');
const permissionsService = require('../../services/permissionsService');
const {
    NotFoundError,
    ValidationError,
    ForbiddenError,
} = require('../../shared/errors');

const { ACCESS } = permissionsService;

const MAX_REORDER_GOALS = 5000;
const HORIZONS = Goal.rawAttributes.horizon.values;
const BUCKETS = Goal.rawAttributes.bucket.values;

function validateHorizon(horizon) {
    if (!HORIZONS.includes(horizon)) {
        throw new ValidationError(
            `Invalid horizon. Must be one of: ${HORIZONS.join(', ')}.`
        );
    }
    return horizon;
}

// null/'' takes a goal off the bucket list.
function validateBucket(bucket) {
    if (bucket === null || bucket === '') return null;
    if (!BUCKETS.includes(bucket)) {
        throw new ValidationError(
            `Invalid bucket. Must be one of: ${BUCKETS.join(', ')}.`
        );
    }
    return bucket;
}

class GoalsService {
    // A goal can only be placed in an area the caller owns or can edit.
    // Nonexistent and inaccessible areas get the same error so area ids
    // cannot be probed.
    async resolveAreaId(userId, areaId) {
        if (areaId === undefined || areaId === null || areaId === '') {
            return null;
        }

        const area = await Area.findByPk(areaId, { attributes: ['id', 'uid'] });
        const access = area
            ? await permissionsService.getAccess(userId, 'area', area.uid)
            : 'none';
        if (access !== 'rw' && access !== 'admin') {
            throw new ValidationError('Invalid area');
        }
        return area.id;
    }

    // The API speaks in parent_goal_uid; the row keeps parent_goal_id.
    // null/'' makes the goal a top-level objective again.
    async resolveParentId(userId, goal, parentUid, bucket) {
        let parentId = parentUid === undefined ? undefined : null;
        if (parentUid !== undefined && parentUid !== null && parentUid !== '') {
            const parent = await Goal.findOne({
                where: { uid: String(parentUid), user_id: userId },
                attributes: ['id'],
            });
            if (!parent) throw new ValidationError('Invalid parent goal');
            parentId = parent.id;
        }
        const problem = await goalHierarchy.problemWith({
            goal,
            parentId,
            bucket,
            userId,
        });
        if (problem) {
            throw new ValidationError(
                'A key result must belong to an objective that is not itself a key result.'
            );
        }
        return parentId;
    }

    // Adds the objective a key result belongs to: parent_goal_uid, and the
    // objective's uid and title as parent_goal.
    async withParentUid(goal) {
        const json = goal.toJSON();
        const parent = goal.parent_goal_id
            ? await Goal.findByPk(goal.parent_goal_id, {
                  attributes: ['uid', 'title'],
              })
            : null;
        return {
            ...json,
            parent_goal_uid: parent ? parent.uid : null,
            parent_goal: parent
                ? { uid: parent.uid, title: parent.title }
                : null,
        };
    }

    async getAll(userId, areaId, areaUid) {
        let goals;
        if (areaUid || areaId) {
            const area = await Area.findOne({
                where: areaUid ? { uid: areaUid } : { id: areaId },
                attributes: ['id', 'uid'],
            });
            const access = area
                ? await permissionsService.getAccess(userId, 'area', area.uid)
                : ACCESS.NONE;
            if (access === ACCESS.NONE) return [];
            goals = await goalsRepository.findAllByArea(userId, area.id);
        } else {
            goals = await goalsRepository.findAllByUser(userId);
        }

        const positions = await goalsRepository.getUserGoalPositions(userId);
        return goals.map((goal) => ({
            ...goal,
            sort_position: positions[goal.id] ?? null,
        }));
    }

    /**
     * Save the user's custom order of the Goals page.
     */
    async reorder(userId, goalUids) {
        if (
            !Array.isArray(goalUids) ||
            goalUids.some((uid) => typeof uid !== 'string' || !uid)
        ) {
            throw new ValidationError('goal_uids must be a list of UIDs.');
        }
        if (goalUids.length > MAX_REORDER_GOALS) {
            throw new ValidationError(
                `Cannot order more than ${MAX_REORDER_GOALS} goals.`
            );
        }
        if (new Set(goalUids).size !== goalUids.length) {
            throw new ValidationError('goal_uids contains duplicates.');
        }

        const whereClause = await permissionsService.ownershipOrPermissionWhere(
            'goal',
            userId
        );
        const goals = goalUids.length
            ? await goalsRepository.findIdsByUids(whereClause, goalUids)
            : [];
        if (goals.length !== goalUids.length) {
            throw new NotFoundError('One or more goals not found.');
        }

        const idByUid = new Map(goals.map((g) => [g.uid, g.id]));
        await goalsRepository.replaceUserGoalOrder(
            userId,
            goalUids.map((uid) => idByUid.get(uid))
        );
        return { goal_uids: goalUids };
    }

    // The goal and the caller's access to it; a goal they cannot see reads
    // as missing.
    async findAccessible(userId, uid) {
        const goal = await goalsRepository.findVisibleByUid(userId, uid);
        const access = goal
            ? await permissionsService.getAccess(userId, 'goal', uid)
            : ACCESS.NONE;
        if (access === ACCESS.NONE) throw new NotFoundError('Goal not found');
        return { goal, access };
    }

    // The goal with its key results; the progress counts the goal's own
    // items and those of its key results.
    async getByUid(userId, uid) {
        const { goal } = await this.findAccessible(userId, uid);
        const withParent = await this.withParentUid(goal);
        const [keyResults, summary] = await Promise.all([
            goalsRepository.findKeyResults(userId, goal),
            goalsRepository.progressOf(userId, goal),
        ]);
        return { ...withParent, KeyResults: keyResults, ...summary };
    }

    async create(userId, data) {
        const {
            title,
            area_id,
            why,
            horizon,
            target_date,
            status,
            color,
            bucket,
            parent_goal_uid,
        } = data;
        if (!title || !title.trim()) {
            throw new ValidationError('Goal title is required');
        }
        const resolvedAreaId = await this.resolveAreaId(userId, area_id);
        const resolvedBucket =
            bucket === undefined ? null : validateBucket(bucket);
        const parentId = await this.resolveParentId(
            userId,
            null,
            parent_goal_uid ?? null,
            resolvedBucket
        );
        const goal = await goalsRepository.create({
            user_id: userId,
            area_id: resolvedAreaId,
            parent_goal_id: parentId,
            title: title.trim(),
            why: why || null,
            horizon:
                horizon === undefined ? 'season' : validateHorizon(horizon),
            target_date: target_date || null,
            status: status || 'active',
            color: color || null,
            bucket: resolvedBucket,
        });
        return this.withParentUid(goal);
    }

    async update(userId, uid, data) {
        const { goal, access } = await this.findAccessible(userId, uid);
        if (access !== ACCESS.RW && access !== ACCESS.ADMIN) {
            throw new ForbiddenError('Forbidden');
        }

        const {
            title,
            area_id,
            why,
            horizon,
            target_date,
            status,
            color,
            bucket,
            parent_goal_uid,
        } = data;
        const updates = {};
        if (title !== undefined) updates.title = title.trim();
        if (area_id !== undefined) {
            updates.area_id = await this.resolveAreaId(userId, area_id);
        }
        if (why !== undefined) updates.why = why;
        if (horizon !== undefined) updates.horizon = validateHorizon(horizon);
        if (bucket !== undefined) updates.bucket = validateBucket(bucket);
        if (target_date !== undefined)
            updates.target_date = target_date || null;
        if (status !== undefined) updates.status = status;
        if (color !== undefined) updates.color = color || null;
        if (parent_goal_uid !== undefined || updates.bucket) {
            const parentId = await this.resolveParentId(
                userId,
                goal,
                parent_goal_uid,
                updates.bucket
            );
            if (parent_goal_uid !== undefined) {
                updates.parent_goal_id = parentId;
            }
        }

        const updated = await goalsRepository.update(goal, updates);
        return this.withParentUid(updated);
    }

    async delete(userId, uid) {
        const { goal } = await this.findAccessible(userId, uid);
        // Only the owner deletes a goal, not someone it was shared with.
        if (goal.user_id !== userId) {
            throw new ForbiddenError('Only the owner can delete this goal.');
        }
        await goalHierarchy.destroyWithDependents(goal);
    }

    async countActive(userId) {
        return goalsRepository.countActiveByUser(userId);
    }
}

module.exports = new GoalsService();
