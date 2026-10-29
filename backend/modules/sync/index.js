'use strict';

/**
 * Sync Module
 *
 * Offline-first sync for the native clients (Android, Linux): a change
 * journal pulled by cursor, idempotent pushed operations, and field-level
 * merge by hybrid logical clock. See docs/fork/PLAN-clients-sync.md.
 */

const routes = require('./routes');

module.exports = { routes };
