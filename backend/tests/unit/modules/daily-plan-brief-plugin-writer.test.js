'use strict';

// A plugin can write the brief in place of the built-in LLM step
// (docs/46-plugins.md, "Writing the daily brief"). It reads a context and
// answers in the shape of the LLM answer; the same checks apply, and any
// failure keeps the rules text.
const ai = require('../../../modules/ai-assistant/service');
const pluginRegistry = require('../../../modules/plugins/registry');
const { buildBrief } = require('../../../modules/daily-plan/brief/build');
const {
    normalizeBriefSettings,
} = require('../../../modules/daily-plan/brief/settings');
const { writeBrief } = require('../../../modules/daily-plan/brief/writer');
const { TODAY, input, task } = require('./daily-plan-brief-rules/fixtures');

const USER_ID = 7;

function brief() {
    return buildBrief(
        input({
            tasks: [
                task({
                    uid: 'task-a',
                    name: 'Payer',
                    due_date: TODAY,
                    money: true,
                }),
                task({ uid: 'task-b', name: 'Relire', due_date: TODAY }),
            ],
        }),
        normalizeBriefSettings({})
    );
}

const answerFor = (b, over = {}) => ({
    verdict: 'Deux choses comptent aujourd’hui. Commence par la facture.',
    tonight: b.tonight.map((_, index) => ({
        index,
        reason: `Ce soir ${index}`,
    })),
    moves: b.moves.map((_, index) => ({ index, reason: `Déplacer ${index}` })),
    ...over,
});

const settings = (over = {}) =>
    normalizeBriefSettings({
        writing: { tone: 'calme', instructions: 'Court' },
        ...over,
    });

function withWriter(fn) {
    jest.spyOn(pluginRegistry, 'briefWriter').mockReturnValue(
        fn ? { id: 'hermes', write: fn } : null
    );
}

describe('brief written by a plugin', () => {
    it('applies the plugin wording and reports the plugin as the writer', async () => {
        const b = brief();
        const write = jest.fn().mockResolvedValue(answerFor(b));
        withWriter(write);

        const result = await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings(),
        });

        expect(result.brief.verdict.text).toMatch(/facture/);
        expect(result.brief.verdict.by).toBe('llm');
        expect(result.llm).toEqual({
            id: 'llm',
            status: 'used',
            detail: 'plugin:hermes',
        });
        expect(result.brief.tonight.map((i) => i.task_uid)).toEqual(
            b.tonight.map((i) => i.task_uid)
        );
    });

    it('gives the plugin the context: date, tone, instructions and the data block', async () => {
        const b = brief();
        const write = jest.fn().mockResolvedValue(answerFor(b));
        withWriter(write);
        await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings(),
        });

        const context = write.mock.calls[0][0];
        expect(context).toMatchObject({
            userId: USER_ID,
            date: b.date,
            timezone: b.timezone,
            tone: 'calme',
            instructions: 'Court',
        });
        expect(context.data).toMatchObject({
            verdict: b.verdict.text,
            tonight: expect.any(Array),
            moves: expect.any(Array),
        });
    });

    it('does not ask the built-in LLM when a plugin writes', async () => {
        const b = brief();
        withWriter(jest.fn().mockResolvedValue(answerFor(b)));
        const spy = jest.spyOn(ai, 'getOpenAIClient');
        await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings({ llm: { enabled: true } }),
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it.each([
        ['throws', () => Promise.reject(new Error('boom'))],
        ['answers nothing', () => Promise.resolve(null)],
        [
            'drops an item',
            (b) => Promise.resolve(answerFor(b, { tonight: [] })),
        ],
        [
            'sends an empty verdict',
            (b) => Promise.resolve(answerFor(b, { verdict: ' ' })),
        ],
    ])('keeps the rules text when the plugin %s', async (_label, behave) => {
        const b = brief();
        withWriter(jest.fn(() => behave(b)));
        const result = await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings(),
        });
        expect(result.brief).toEqual(b);
        expect(result.llm).toMatchObject({ id: 'llm', status: 'error' });
        expect(result.llm.detail).toMatch(/^plugin/);
    });

    it('keeps the rules text when the plugin takes too long', async () => {
        const b = brief();
        withWriter(() => new Promise(() => {}));
        const result = await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings(),
            pluginTimeoutMs: 20,
        });
        expect(result.brief).toEqual(b);
        expect(result.llm).toMatchObject({
            status: 'error',
            detail: 'plugin_timeout',
        });
    });

    it('falls back to the usual path when no plugin writes', async () => {
        const b = brief();
        withWriter(null);
        const result = await writeBrief({
            userId: USER_ID,
            brief: b,
            tasksByUid: new Map(),
            settings: settings({ llm: { enabled: false } }),
        });
        expect(result.llm).toEqual({ id: 'llm', status: 'off', detail: null });
    });
});
