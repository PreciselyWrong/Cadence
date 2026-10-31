'use strict';

const request = require('supertest');
const app = require('../../../app');
const { Habit, HabitEntry, HabitPause } = require('../../../models');
const { createTestUser } = require('../../helpers/testUtils');
const {
    createApiToken: createApiTokenFromService,
} = require('../../../modules/users/apiTokenService');

function parseSseResponse(text) {
    for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
            try {
                return JSON.parse(line.slice(6));
            } catch {
                continue;
            }
        }
    }
    return null;
}

function toolJson(response) {
    const rpc = parseSseResponse(response.text);
    if (!rpc || !rpc.result) {
        throw new Error(
            `Unexpected MCP response: ${response.text.slice(0, 200)}`
        );
    }
    if (rpc.result.isError) {
        throw new Error(rpc.result.content[0].text);
    }
    return JSON.parse(rpc.result.content[0].text);
}

describe('MCP habit tools (Cadence habits)', () => {
    let token;
    let user;

    const callTool = (name, args) =>
        request(app)
            .post('/api/mcp')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json, text/event-stream')
            .send({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name, arguments: args },
                id: 1,
            });

    const createHabit = async (args = {}) =>
        toolJson(await callTool('create_habit', { name: 'Stretch', ...args }))
            .habit;

    beforeEach(async () => {
        user = await createTestUser({ email: 'mcp-habits@example.com' });
        token = (
            await createApiTokenFromService({
                userId: user.id,
                name: 'MCP habit test',
                expiresAt: null,
            })
        ).rawToken;
    });

    it('create_habit makes a daily yes/no habit by default', async () => {
        const habit = await createHabit();
        expect(habit.goal).toMatchObject({
            goal_type: 'BINARY',
            target_minor: 1,
            period: 'DAY',
        });
        expect(habit.schedule.schedule_mode).toBe('EVERY_DAY');
        expect(await Habit.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('create_habit takes a goal and a schedule', async () => {
        const habit = await createHabit({
            name: 'Run',
            goal: { target_minor: 3, period: 'WEEK', goal_type: 'COUNT' },
            schedule: { schedule_mode: 'FLEXIBLE_PERIOD' },
        });
        expect(habit.goal).toMatchObject({ target_minor: 3, period: 'WEEK' });
        expect(habit.schedule.schedule_mode).toBe('FLEXIBLE_PERIOD');
    });

    it('create_habit with the same uid twice makes one habit', async () => {
        const uid = 'a1b2c3d4e5f6g7h';
        const first = await createHabit({ name: 'Read', uid });
        const second = await createHabit({ name: 'Read', uid });
        expect(first.uid).toBe(uid);
        expect(second.uid).toBe(uid);
        expect(await Habit.count({ where: { uid } })).toBe(1);
    });

    it('log_habit_completion with the same entry_uid twice makes one entry', async () => {
        const habit = await createHabit();
        const args = { uid: habit.uid, entry_uid: 'h7g6f5e4d3c2b1a' };
        const first = toolJson(await callTool('log_habit_completion', args));
        toolJson(await callTool('log_habit_completion', args));
        expect(first.status.evaluation.is_completed).toBe(true);
        expect(await HabitEntry.count({ where: { uid: args.entry_uid } })).toBe(
            1
        );
    });

    it('lists, reads and deletes entries', async () => {
        const habit = await createHabit();
        for (const local_date of ['2030-01-01', '2030-01-05']) {
            toolJson(
                await callTool('log_habit_completion', {
                    uid: habit.uid,
                    local_date,
                    note: 'felt good',
                })
            );
        }
        const all = toolJson(
            await callTool('get_habit_completions', { uid: habit.uid })
        );
        expect(all.count).toBe(2);
        const ranged = toolJson(
            await callTool('get_habit_completions', {
                uid: habit.uid,
                from: '2030-01-03',
            })
        );
        expect(ranged.entries.map((e) => e.local_date)).toEqual(['2030-01-05']);

        await callTool('delete_habit_completion', {
            uid: habit.uid,
            entry_uid: ranged.entries[0].uid,
        });
        expect(await HabitEntry.count()).toBe(1);
    });

    it('skips a day with a one-day pause', async () => {
        const habit = await createHabit();
        const result = toolJson(
            await callTool('log_habit_completion', {
                uid: habit.uid,
                skip: true,
                local_date: '2030-02-10',
            })
        );
        expect(result.pause).toMatchObject({
            start: '2030-02-10',
            end_exclusive: '2030-02-11',
            reason: 'REST',
        });
        expect(await HabitPause.count()).toBe(1);
    });

    it('list_habits and get_habit_stats report the period and the streak', async () => {
        const habit = await createHabit();
        toolJson(await callTool('log_habit_completion', { uid: habit.uid }));
        const list = toolJson(await callTool('list_habits', {}));
        expect(list.count).toBe(1);
        expect(list.habits[0].status.evaluation.is_completed).toBe(true);

        const stats = toolJson(
            await callTool('get_habit_stats', { uid: habit.uid })
        );
        expect(stats.status.streak.current).toBe(1);
        expect(stats.summary).toBeDefined();
    });

    it('update_habit archives and delete_habit removes', async () => {
        const habit = await createHabit();
        toolJson(
            await callTool('update_habit', {
                uid: habit.uid,
                archived: true,
                name: 'Stretch more',
            })
        );
        expect(
            toolJson(await callTool('list_habits', { archived: true })).count
        ).toBe(1);
        expect(toolJson(await callTool('list_habits', {})).count).toBe(0);
        toolJson(await callTool('delete_habit', { uid: habit.uid }));
        expect(await Habit.count({ where: { user_id: user.id } })).toBe(0);
    });
});
