'use strict';

const { User, ApiToken } = require('../../models');
const { isPasswordAuthEnabled } = require('../../config/authConfig');
const mfaService = require('../mfa/service');
const { createApiToken, revokeApiToken } = require('../users/apiTokenService');
const { tokenLifetimeSeconds } = require('./config');

// bcrypt of a random string, never a real password.
const TIMING_DUMMY_HASH =
    '$2b$12$S7EHH/j.ogiwRJnVUy21FO6KKB0TmCnemad4iGJOnBeqGcUjoMY4u';

// The consent page asks for the account's own password and, when two-factor
// sign-in is on, a current code: a grant is never given on the strength of
// an edge login alone. Recovery codes are not accepted here.
async function verifyOwner({ email, password, mfaCode }, req) {
    if (!isPasswordAuthEnabled()) {
        return { ok: false, reason: 'password_auth_disabled' };
    }
    if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
    ) {
        return { ok: false, reason: 'invalid_credentials' };
    }

    const user = await User.findOne({
        where: { email: email.trim().toLowerCase() },
    });
    // Without an account the hash is still compared, so the reply time does
    // not tell whether the email exists.
    const passwordOk = await User.checkPassword(
        password,
        user?.password_digest || TIMING_DUMMY_HASH
    );
    if (!user || !user.password_digest || !passwordOk) {
        return { ok: false, reason: 'invalid_credentials' };
    }
    if (!user.email_verified) {
        return { ok: false, reason: 'email_not_verified', userId: user.id };
    }

    if (await mfaService.isEnabled(user.id)) {
        if (typeof mfaCode !== 'string' || !mfaCode.trim()) {
            return { ok: false, reason: 'mfa_required', userId: user.id };
        }
        try {
            await mfaService.verify(user.id, { code: mfaCode.trim() }, req, {
                allowRecovery: false,
            });
        } catch {
            return { ok: false, reason: 'mfa_invalid', userId: user.id };
        }
    }

    return { ok: true, user };
}

// The access token is a regular API key restricted to the MCP endpoint, so
// it shows up, and can be revoked, under Profile > API keys.
async function issueMcpToken({ userId, clientName }) {
    // One live token per connector: connecting again retires the previous
    // one instead of leaving it valid until it expires.
    const previous = await ApiToken.findAll({
        where: { user_id: userId, revoked_at: null },
    });
    for (const token of previous) {
        if (
            token.abilities?.scope === 'mcp' &&
            token.abilities?.oauth_client === clientName
        ) {
            await revokeApiToken(token.id, userId);
        }
    }

    const lifetime = tokenLifetimeSeconds();
    const expiresAt = new Date(Date.now() + lifetime * 1000);
    const { rawToken, tokenRecord } = await createApiToken({
        userId,
        name: `Claude MCP (${clientName})`.slice(0, 255),
        expiresAt,
        abilities: { scope: 'mcp', oauth_client: clientName },
    });
    return { rawToken, tokenId: tokenRecord.id, expiresAt, lifetime };
}

module.exports = { verifyOwner, issueMcpToken };
