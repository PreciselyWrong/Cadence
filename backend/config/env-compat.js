// Environment variables were renamed TUDUDI_* -> CADENCE_*. The old names keep
// working for one release: this module copies each non-empty TUDUDI_X to
// CADENCE_X unless CADENCE_X is already set to a non-empty value, then warns
// once. Require it before anything reads the environment (after dotenv, so
// that names coming from a .env file are covered too). Dependency-free.
// Remove it, and its requires, in the release after the rename.

const LEGACY_PREFIX = 'TUDUDI_';
const CURRENT_PREFIX = 'CADENCE_';

function applyLegacyEnv(env = process.env) {
    const found = [];
    for (const key of Object.keys(env)) {
        if (!key.startsWith(LEGACY_PREFIX) || !env[key]) continue;
        found.push(key);
        const current = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
        if (env[current] === undefined || env[current] === '') {
            env[current] = env[key];
        }
    }
    return found.sort();
}

function warnLegacyEnv(names) {
    const message =
        'Legacy TUDUDI_* environment variables are deprecated: rename them to CADENCE_*, support is removed in the next release';
    try {
        require('../services/logService').logger.warn(
            { variables: names },
            message
        );
    } catch (_) {
        console.warn(message, { variables: names });
    }
}

const legacyNames = applyLegacyEnv();
if (legacyNames.length > 0) warnLegacyEnv(legacyNames);

module.exports = { applyLegacyEnv };
