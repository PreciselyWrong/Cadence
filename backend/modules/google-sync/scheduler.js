'use strict';

const { getGoogleConfig, isConfigured } = require('./config');
const { syncAll } = require('./syncEngine');
const { logInfo, logError } = require('../../services/logService');

let timer = null;

function initialize() {
    if (timer || !isConfigured()) return;
    const minutes = getGoogleConfig().syncIntervalMinutes;
    timer = setInterval(
        () => {
            const { withJobLock } = require('../../services/jobLock');
            withJobLock('google-sync', syncAll).catch((error) =>
                logError('Google sync run failed:', error)
            );
        },
        minutes * 60 * 1000
    );
    timer.unref();
    logInfo(`Google sync scheduled every ${minutes} minute(s)`);
}

function stop() {
    if (timer) clearInterval(timer);
    timer = null;
}

module.exports = { initialize, stop };
