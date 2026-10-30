'use strict';

// Google OAuth client of the instance, created in Google Cloud Console
// (APIs: Google Calendar API and Google Tasks API).
function getGoogleConfig() {
    const interval = parseInt(process.env.GOOGLE_SYNC_INTERVAL_MINUTES, 10);
    return {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        // Optional: defaults to <origin>/api/google/oauth/callback of the
        // request that starts the connection.
        redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
        syncIntervalMinutes: Number.isFinite(interval)
            ? Math.min(Math.max(interval, 1), 60)
            : 2,
    };
}

function isConfigured() {
    const { clientId, clientSecret } = getGoogleConfig();
    return Boolean(clientId && clientSecret);
}

module.exports = { getGoogleConfig, isConfigured };
