'use strict';

// The one judgement of automatic classification: the model proposes, among
// existing uids and tags, through the provider of Profile › AI Assistant
// (OpenAI-compatible, Anthropic's endpoint included). The answer is a strict
// JSON Schema; core/validate.js checks it before anything is written.
const ai = require('../ai-assistant/service');
const entitlements = require('../../services/entitlementsService');
const repository = require('./repository');
const { buildMessages } = require('./core/prompt');
const { buildSchema } = require('./core/schema');

const state = { ask: null, catalogs: new Map() };

// Tests replace the call: the model itself is never tested.
function configure(options = {}) {
    if ('ask' in options) state.ask = options.ask;
    if (options.clearCache) state.catalogs.clear();
}

async function catalogFor(userId, settings, now = Date.now()) {
    const ttl = settings.context_cache_minutes * 60 * 1000;
    const cached = state.catalogs.get(userId);
    let catalog = cached && now - cached.at < ttl ? cached.catalog : null;
    if (!catalog) {
        catalog = await repository.readCatalog(userId);
        if (ttl > 0) state.catalogs.set(userId, { at: now, catalog });
    }
    return { ...catalog, excluded: settings.excluded_tags };
}

// A project or tag created by the user must be nameable at once.
function forgetCatalog(userId) {
    state.catalogs.delete(userId);
}

async function isConfigured(userId) {
    return state.ask ? true : ai.isAIConfigured(userId);
}

async function askModel(userId, catalog, entries, settings) {
    if (state.ask) return state.ask({ userId, catalog, entries, settings });
    const client = await ai.getOpenAIClient(userId);
    await entitlements.consumeUsage(userId, 'ai_requests');
    await entitlements.consumeMonthlyUsage(userId, 'ai_credits');
    const params = {
        model: settings.model || (await ai.getAIModel(userId)),
        messages: buildMessages(catalog, entries),
        max_tokens: settings.max_tokens,
        ...ai.getExtraBodyParams(),
        response_format: ai.buildResponseFormat(
            'classification',
            buildSchema(
                catalog,
                entries.map((entry) => entry.item.uid)
            )
        ),
    };
    if (settings.reasoning_effort) {
        params.reasoning_effort = settings.reasoning_effort;
    }
    const response = await ai.callWithFallback(client, userId, params);
    const raw = ai.extractMessageContent(response.choices[0]?.message);
    return JSON.parse(ai.extractJSON(raw)).items ?? [];
}

module.exports = {
    configure,
    catalogFor,
    forgetCatalog,
    isConfigured,
    askModel,
};
