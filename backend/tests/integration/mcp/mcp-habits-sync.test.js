'use strict';

const request = require('supertest');
const app = require('../../../app');
const { Task, RecurringCompletion } = require('../../../models');
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

describe('MCP habit tools accept client uids', () => {
    let token;

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

    beforeEach(async () => {
        const user = await createTestUser({ email: 'mcp-sync@example.com' });
        token = (
            await createApiTokenFromService({
                userId: user.id,
                name: 'MCP habit sync test',
                expiresAt: null,
            })
        ).rawToken;
    });

    it('create_habit with the same uid twice makes one habit', async () => {
        const uid = 'a1b2c3d4e5f6g7h';
        const first = toolJson(
            await callTool('create_habit', { name: 'Read', uid })
        );
        const second = toolJson(
            await callTool('create_habit', { name: 'Read', uid })
        );
        expect(first.habit.uid).toBe(uid);
        expect(second.habit.uid).toBe(uid);
        expect(await Task.count({ where: { uid } })).toBe(1);
    });

    it('log_habit_completion with the same checkin_uid twice makes one check-in', async () => {
        const habit = toolJson(
            await callTool('create_habit', {
                name: 'Stretch',
                habit_target_count: 3,
            })
        ).habit;
        const checkinUid = 'h7g6f5e4d3c2b1a';
        const args = { uid: habit.uid, checkin_uid: checkinUid };
        toolJson(await callTool('log_habit_completion', args));
        toolJson(await callTool('log_habit_completion', args));
        expect(
            await RecurringCompletion.count({ where: { uid: checkinUid } })
        ).toBe(1);
    });

    it('list_habits returns server_time for the next updated_since call', async () => {
        const result = toolJson(await callTool('list_habits', {}));
        expect(new Date(result.server_time).getTime()).not.toBeNaN();
    });
});
