'use strict';

// Whether each optional source of the brief is set up. Only reads configuration:
// nothing here calls the agent or the AI provider.
const agentsService = require('../../agents/service');
const ai = require('../../ai-assistant/service');

// Mail reads need the agent address, its key and the mail profile.
async function mailAgentConfigured(user) {
    const agent = await agentsService.getSettings(user);
    return Boolean(agent.baseUrl && agent.api_key_set && agent.profiles.mail);
}

async function llmConfigured(userId) {
    return ai.isAIConfigured(userId);
}

module.exports = { mailAgentConfigured, llmConfigured };
