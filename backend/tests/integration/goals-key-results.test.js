const request = require('supertest');
const app = require('../../app');
const { Goal, Project, Task } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');

describe('Goals: key results, horizons and bucket list', () => {
    let user, agent;

    beforeEach(async () => {
        user = await createTestUser({ email: 'krs@example.com' });
        agent = request.agent(app);
        await agent.post('/api/login').send({
            email: 'krs@example.com',
            password: 'password123',
        });
    });

    const makeGoal = async (body) => {
        const res = await agent.post('/api/goals').send(body);
        expect(res.status).toBe(201);
        return res.body.goal;
    };

    describe('key results', () => {
        it('creates a key result under an objective', async () => {
            const objective = await makeGoal({ title: 'Launch the business' });

            const res = await agent.post('/api/goals').send({
                title: 'Sign 3 clients',
                parent_goal_uid: objective.uid,
            });

            expect(res.status).toBe(201);
            expect(res.body.goal.parent_goal_uid).toBe(objective.uid);
            const stored = await Goal.findOne({
                where: { uid: res.body.goal.uid },
            });
            expect(stored.parent_goal_id).toBe(objective.id);
        });

        it('turns a goal into a key result and back', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const goal = await makeGoal({ title: 'Loose goal' });

            const attached = await agent
                .patch(`/api/goals/${goal.uid}`)
                .send({ parent_goal_uid: objective.uid });
            expect(attached.status).toBe(200);
            expect(attached.body.goal.parent_goal_uid).toBe(objective.uid);

            const detached = await agent
                .patch(`/api/goals/${goal.uid}`)
                .send({ parent_goal_uid: null });
            expect(detached.status).toBe(200);
            expect(detached.body.goal.parent_goal_uid).toBeNull();
        });

        it('refuses a key result under a key result', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });

            const res = await agent.post('/api/goals').send({
                title: 'Too deep',
                parent_goal_uid: kr.uid,
            });

            expect(res.status).toBe(400);
        });

        it('refuses to make an objective that has key results a key result', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            await makeGoal({ title: 'KR', parent_goal_uid: objective.uid });
            const other = await makeGoal({ title: 'Other objective' });

            const res = await agent
                .patch(`/api/goals/${objective.uid}`)
                .send({ parent_goal_uid: other.uid });

            expect(res.status).toBe(400);
        });

        it('refuses a goal as its own parent', async () => {
            const goal = await makeGoal({ title: 'Self' });

            const res = await agent
                .patch(`/api/goals/${goal.uid}`)
                .send({ parent_goal_uid: goal.uid });

            expect(res.status).toBe(400);
        });

        it("refuses another user's goal as parent", async () => {
            const other = await createTestUser({
                email: 'krs-other@example.com',
            });
            const foreign = await Goal.create({
                title: 'Not mine',
                user_id: other.id,
            });

            const res = await agent.post('/api/goals').send({
                title: 'Sneaky',
                parent_goal_uid: foreign.uid,
            });

            expect(res.status).toBe(400);
        });

        it('shows key results with their progress on the objective', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });
            const krRow = await Goal.findOne({ where: { uid: kr.uid } });
            const project = await Project.create({
                name: 'Linked project',
                user_id: user.id,
                goal_id: krRow.id,
                status: 'done',
            });
            await Task.create({
                name: 'Done task',
                user_id: user.id,
                goal_id: krRow.id,
                status: Task.STATUS.DONE,
            });
            await Task.create({
                name: 'Open task',
                user_id: user.id,
                goal_id: krRow.id,
            });
            await Task.create({
                name: 'Open task of project',
                user_id: user.id,
                goal_id: krRow.id,
                project_id: project.id,
            });

            const res = await agent.get(`/api/goals/${objective.uid}`);

            expect(res.status).toBe(200);
            const [shown] = res.body.goal.KeyResults;
            expect(shown.uid).toBe(kr.uid);
            // 1 of 1 project and 1 of 3 tasks are done: 2 of 4 items.
            expect(shown.progress).toEqual({ done: 2, total: 4, percent: 50 });
            // The objective counts its own items and those of its key results.
            expect(res.body.goal.progress).toEqual({
                done: 2,
                total: 4,
                percent: 50,
            });
        });

        it('lists each goal with its next step: nearest due date, then oldest', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });
            const wish = await makeGoal({ title: 'Wish', bucket: 'do' });
            const [objectiveRow, krRow] = await Promise.all([
                Goal.findOne({ where: { uid: objective.uid } }),
                Goal.findOne({ where: { uid: kr.uid } }),
            ]);
            const older = new Date('2026-01-01T08:00:00Z');
            const newer = new Date('2026-02-01T08:00:00Z');
            await Task.create({
                name: 'Done first',
                user_id: user.id,
                goal_id: krRow.id,
                status: Task.STATUS.DONE,
                due_date: new Date('2025-12-01T12:00:00Z'),
            });
            const parent = await Task.create({
                name: 'Newer, no date',
                user_id: user.id,
                goal_id: objectiveRow.id,
                created_at: newer,
            });
            await Task.create({
                name: 'Subtask with a date',
                user_id: user.id,
                goal_id: objectiveRow.id,
                parent_task_id: parent.id,
                due_date: new Date('2025-12-02T12:00:00Z'),
            });
            const oldest = await Task.create({
                name: 'Older, no date',
                user_id: user.id,
                goal_id: krRow.id,
                created_at: older,
            });

            const res = await agent.get('/api/goals');
            const byUid = Object.fromEntries(
                res.body.goals.map((goal) => [goal.uid, goal])
            );

            expect(byUid[kr.uid].next_task).toEqual({
                uid: oldest.uid,
                name: 'Older, no date',
                due_date: null,
            });
            // An objective's next step can come from one of its key results.
            expect(byUid[objective.uid].next_task.uid).toBe(oldest.uid);
            expect(byUid[wish.uid].next_task).toBeNull();

            const due = await Task.create({
                name: 'Due soon',
                user_id: user.id,
                goal_id: objectiveRow.id,
                due_date: new Date('2026-03-01T12:00:00Z'),
            });
            const again = await agent.get('/api/goals');
            const shown = again.body.goals.find((g) => g.uid === objective.uid);
            expect(shown.next_task.uid).toBe(due.uid);
        });

        it('names the objective on a key result', async () => {
            const objective = await makeGoal({ title: 'Launch the business' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });

            const res = await agent.get(`/api/goals/${kr.uid}`);

            expect(res.body.goal.parent_goal).toEqual({
                uid: objective.uid,
                title: 'Launch the business',
            });
        });

        it('has no progress percent when nothing is linked', async () => {
            const goal = await makeGoal({ title: 'Empty' });

            const res = await agent.get(`/api/goals/${goal.uid}`);

            expect(res.body.goal.progress).toEqual({
                done: 0,
                total: 0,
                percent: null,
            });
            expect(res.body.goal.KeyResults).toEqual([]);
        });

        it('lists every goal with its parent uid', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });

            const res = await agent.get('/api/goals');
            const listed = res.body.goals.find((g) => g.uid === kr.uid);

            expect(listed.parent_goal_uid).toBe(objective.uid);
            expect(
                res.body.goals.find((g) => g.uid === objective.uid)
                    .parent_goal_uid
            ).toBeNull();
        });

        it('deletes the key results with their objective and unlinks their items', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });
            const krRow = await Goal.findOne({ where: { uid: kr.uid } });
            const task = await Task.create({
                name: 'Linked',
                user_id: user.id,
                goal_id: krRow.id,
            });

            const res = await agent.delete(`/api/goals/${objective.uid}`);

            expect(res.status).toBe(204);
            expect(await Goal.count({ where: { user_id: user.id } })).toBe(0);
            await task.reload();
            expect(task.goal_id).toBeNull();
        });

        it('lets a project and a task attach to a key result', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });
            const krRow = await Goal.findOne({ where: { uid: kr.uid } });
            const project = (
                await agent.post('/api/project').send({ name: 'P' })
            ).body;

            const res = await agent
                .patch(`/api/project/${project.uid}`)
                .send({ goal_id: krRow.id });

            expect(res.status).toBe(200);
            expect(res.body.goal_id).toBe(krRow.id);
        });
    });

    describe('horizons', () => {
        it.each(['month', 'quarter', 'season', 'year'])(
            'accepts the %s horizon',
            async (horizon) => {
                const goal = await makeGoal({
                    title: `Goal ${horizon}`,
                    horizon,
                });
                expect(goal.horizon).toBe(horizon);
            }
        );

        it('refuses an unknown horizon', async () => {
            const res = await agent
                .post('/api/goals')
                .send({ title: 'Bad', horizon: 'decade' });
            expect(res.status).toBe(400);
        });
    });

    describe('bucket list', () => {
        it.each(['have', 'be', 'do'])(
            'accepts the %s bucket',
            async (bucket) => {
                const goal = await makeGoal({
                    title: `Dream ${bucket}`,
                    bucket,
                });
                expect(goal.bucket).toBe(bucket);
                expect(goal.target_date).toBeNull();
            }
        );

        it('defaults to no bucket', async () => {
            const goal = await makeGoal({ title: 'Regular' });
            expect(goal.bucket).toBeNull();
        });

        it('refuses an unknown bucket', async () => {
            const res = await agent
                .post('/api/goals')
                .send({ title: 'Bad', bucket: 'wish' });
            expect(res.status).toBe(400);
        });

        it('moves a goal in and out of the bucket list', async () => {
            const goal = await makeGoal({ title: 'Dream' });

            const inBucket = await agent
                .patch(`/api/goals/${goal.uid}`)
                .send({ bucket: 'do' });
            expect(inBucket.body.goal.bucket).toBe('do');

            const out = await agent
                .patch(`/api/goals/${goal.uid}`)
                .send({ bucket: null });
            expect(out.body.goal.bucket).toBeNull();
        });

        it('refuses a bucket-list goal that is also a key result', async () => {
            const objective = await makeGoal({ title: 'Objective' });

            const res = await agent.post('/api/goals').send({
                title: 'Mixed',
                bucket: 'be',
                parent_goal_uid: objective.uid,
            });

            expect(res.status).toBe(400);
        });
    });

    describe('sync', () => {
        it('exposes goals to sync clients', () => {
            const { ENTITIES } = require('../../modules/sync/registry');
            const goal = ENTITIES.goal;

            expect(goal.model).toBe('Goal');
            expect(goal.fields).toEqual(
                expect.arrayContaining([
                    'title',
                    'why',
                    'horizon',
                    'target_date',
                    'status',
                    'color',
                    'bucket',
                ])
            );
            expect(Object.keys(goal.refs)).toEqual(
                expect.arrayContaining(['area_uid', 'parent_goal_uid'])
            );
            expect(Object.keys(ENTITIES.project.refs)).toContain('goal_uid');
            expect(Object.keys(ENTITIES.task.refs)).toContain('goal_uid');
        });

        it('journals a goal write and serves it in the snapshot', async () => {
            const objective = await makeGoal({ title: 'Synced' });

            const res = await agent.get('/api/v1/sync/snapshot?entity=goal');

            expect(res.status).toBe(200);
            const row = res.body.rows.find((r) => r.uid === objective.uid);
            expect(row).toMatchObject({
                title: 'Synced',
                horizon: 'season',
                bucket: null,
                parent_goal_uid: null,
            });
        });

        it('refuses a pushed key result of a key result', async () => {
            const objective = await makeGoal({ title: 'Objective' });
            const kr = await makeGoal({
                title: 'KR',
                parent_goal_uid: objective.uid,
            });
            const clock = `${String(Date.now()).padStart(13, '0')}-0000-devA`;

            const res = await agent.post('/api/v1/sync/push').send({
                ops: [
                    {
                        op_id: 'goal-deep-1',
                        entity: 'goal',
                        uid: 'newgoal0001',
                        action: 'upsert',
                        fields: {
                            title: { value: 'Too deep', hlc: clock },
                            parent_goal_uid: { value: kr.uid, hlc: clock },
                        },
                    },
                ],
            });

            expect(res.status).toBe(200);
            expect(res.body.results[0].status).toBe('rejected');
        });
    });
});
