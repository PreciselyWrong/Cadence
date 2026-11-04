'use strict';

// Hermes agent connector: settings (ui_settings.agents + encrypted
// users.agent_api_key) and the one entry point the brief engine uses to ask
// the agent for a request type. Writes nothing to mail or tasks.

const crypto = require('crypto');
const { User } = require('../../models');
const entitlements = require('../../services/entitlementsService');
const secretCipher = require('../../shared/crypto/secretCipher');
const { logError } = require('../../services/logService');
const {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} = require('../../shared/errors');
const { normalizeAgentSettings, validateAgentSettings } = require('./settings');
const client = require('./client');
const { AgentError } = client;
const { getRequestType } = require('./requests');

const MAX_API_KEY_LENGTH = 500;
const PROFILE_KEYS = ['mail', 'drafting'];

function readUiSettings(row) {
    const value = row.ui_settings;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) || {};
        } catch {
            return {};
        }
    }
    return value && typeof value === 'object' ? value : {};
}

async function loadRow(userId) {
    const row = await User.findByPk(userId, {
        attributes: ['id', 'ui_settings', 'agent_api_key'],
    });
    if (!row) throw new NotFoundError('User not found.');
    return row;
}

// The key is decrypted only to build a request or the last 4 characters.
// A stored value that cannot be decrypted counts as no key.
function decryptApiKey(encrypted) {
    if (!encrypted) return '';
    try {
        return secretCipher.decrypt(encrypted) || '';
    } catch (error) {
        logError('Failed to decrypt stored agent API key', error);
        return '';
    }
}

function loadSettings(row) {
    return normalizeAgentSettings(readUiSettings(row).agents);
}

async function getSettings(user) {
    const row = await loadRow(user.id);
    const plaintext = decryptApiKey(row.agent_api_key);
    return {
        ...loadSettings(row),
        api_key_set: Boolean(row.agent_api_key),
        api_key_last4: plaintext.length >= 4 ? plaintext.slice(-4) : null,
    };
}

function apiKeyUpdate(apiKey) {
    if (apiKey === null || apiKey === '') return { agent_api_key: null };
    if (typeof apiKey !== 'string') {
        throw new ValidationError('api_key must be a string');
    }
    const key = apiKey.trim();
    if (key.length > MAX_API_KEY_LENGTH) {
        throw new ValidationError(
            `api_key must be at most ${MAX_API_KEY_LENGTH} characters`
        );
    }
    if (!secretCipher.hasKeyMaterial()) {
        throw new ValidationError(
            'Cannot save the agent API key: set TUDUDI_SESSION_SECRET (or TUDUDI_OIDC_SECRET_ENCRYPTION_KEY) on the server first'
        );
    }
    return { agent_api_key: secretCipher.encrypt(key) };
}

// A patch is merged over the stored settings; profiles merge key by key so
// that saving one profile keeps the other.
async function saveSettings(user, patch) {
    if (entitlements.isHostedMode()) {
        throw new ForbiddenError(
            'Agent settings are managed by the operator on the hosted plan.'
        );
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new ValidationError('Settings must be an object');
    }

    const { api_key: apiKey, ...settingsPatch } = patch;
    const row = await loadRow(user.id);
    const current = loadSettings(row);
    const merged = { ...current, ...settingsPatch };
    if (
        settingsPatch.profiles &&
        typeof settingsPatch.profiles === 'object' &&
        !Array.isArray(settingsPatch.profiles)
    ) {
        merged.profiles = { ...current.profiles, ...settingsPatch.profiles };
    }
    const validated = validateAgentSettings(merged);
    const keyUpdate = apiKey === undefined ? {} : apiKeyUpdate(apiKey);

    await User.update(
        {
            ...keyUpdate,
            ui_settings: {
                ...readUiSettings(row),
                agents: validated,
            },
        },
        { where: { id: user.id } }
    );

    return getSettings(user);
}

// Asks the agent for one request type and returns { run_id, data }.
// Throws AgentError (code: not_configured, unauthorized, unreachable,
// timeout, failed, needs_approval, bad_output). A needs_approval error
// carries runId and profile: the caller decides whether to denyRun.
// idempotencyKey makes a retry return the same run.
async function runRequest(user, type, payload, { idempotencyKey } = {}) {
    const requestType = getRequestType(type);
    const input = requestType.buildInput(payload);

    const row = await loadRow(user.id);
    const settings = loadSettings(row);
    const profile = settings.profiles[requestType.profileKey];
    const apiKey = decryptApiKey(row.agent_api_key);
    if (!settings.baseUrl || !profile || !apiKey) {
        throw new AgentError('not_configured');
    }

    const { runId } = await client.createRun({
        settings,
        apiKey,
        profile,
        input,
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
    });
    const run = await client.waitForRun({
        settings,
        apiKey,
        profile,
        runId,
    });

    return {
        run_id: runId,
        data: requestType.outputSchema.parse(run.output),
    };
}

// Refuses the approval a run is waiting for. Takes the run id and profile
// carried by the needs_approval error; nothing is approved here.
async function denyRun(user, { runId, profile }) {
    const row = await loadRow(user.id);
    const settings = loadSettings(row);
    const apiKey = decryptApiKey(row.agent_api_key);
    await client.denyApproval({ settings, apiKey, profile, runId });
}

// Connection test. Each part reports ok, or its failure kind; no request
// carries the input text.
async function testConnection(user) {
    const row = await loadRow(user.id);
    const settings = loadSettings(row);
    const apiKey = decryptApiKey(row.agent_api_key);

    let health = 'error';
    try {
        await client.checkHealth(settings);
        health = 'ok';
    } catch {
        health = 'error';
    }

    let auth = 'error';
    const probeProfile = settings.profiles.mail || settings.profiles.drafting;
    if (!settings.baseUrl) {
        auth = 'error';
    } else if (!apiKey) {
        auth = 'unauthorized';
    } else if (probeProfile) {
        try {
            await client.listModels({
                settings,
                apiKey,
                profile: probeProfile,
            });
            auth = 'ok';
        } catch (error) {
            auth = error.code === 'unauthorized' ? 'unauthorized' : 'error';
        }
    }

    const profiles = {};
    for (const key of PROFILE_KEYS) {
        const name = settings.profiles[key];
        if (!name) {
            profiles[key] = 'missing';
            continue;
        }
        if (!settings.baseUrl || !apiKey) {
            profiles[key] = 'error';
            continue;
        }
        try {
            await client.listModels({ settings, apiKey, profile: name });
            profiles[key] = 'ok';
        } catch (error) {
            profiles[key] =
                error.code === 'not_configured' ? 'missing' : 'error';
        }
    }

    return { health, auth, profiles };
}

module.exports = {
    getSettings,
    saveSettings,
    runRequest,
    denyRun,
    testConnection,
};
