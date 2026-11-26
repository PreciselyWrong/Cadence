'use strict';

// The one judgement of « Découper en étapes »: the model proposes steps
// through the provider of Profile › AI Assistant, as a strict JSON Schema;
// core/steps.js checks the answer before anything is shown.
const ai = require('../ai-assistant/service');
const entitlements = require('../../services/entitlementsService');
const { buildMessages, SCHEMA } = require('./core/prompt');

const state = { ask: null };

// Tests replace the call: the model itself is never tested.
function configure(options = {}) {
    if ('ask' in options) state.ask = options.ask;
}

async function isConfigured(userId) {
    return state.ask ? true : ai.isAIConfigured(userId);
}

async function askSteps(userId, task, settings) {
    if (state.ask) return state.ask({ userId, task, settings });
    const client = await ai.getOpenAIClient(userId);
    await entitlements.consumeUsage(userId, 'ai_requests');
    await entitlements.consumeMonthlyUsage(userId, 'ai_credits');
    const response = await ai.callWithFallback(client, userId, {
        model: settings.model || (await ai.getAIModel(userId)),
        messages: buildMessages(task, settings),
        max_tokens: settings.max_tokens,
        ...ai.getExtraBodyParams(),
        response_format: ai.buildResponseFormat('task_breakdown', SCHEMA),
    });
    const raw = ai.extractMessageContent(response.choices[0]?.message);
    return JSON.parse(ai.extractJSON(raw)).steps ?? [];
}

module.exports = { configure, isConfigured, askSteps };
