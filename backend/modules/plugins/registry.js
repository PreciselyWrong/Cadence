'use strict';

// Finds plugins on disk and runs the enabled ones inside the server process
// (docs/46-plugins.md). Cadence never installs or updates a plugin: it reads
// the folder as it is, and a reload reads it again.

const fs = require('fs');
const path = require('path');
const express = require('express');
const { getConfig } = require('../../config/config');
const { logger } = require('../../services/logService');
const secretCipher = require('../../shared/crypto/secretCipher');
const { uid } = require('../../utils/uid');
const eventBus = require('./eventBus');
const repository = require('./repository');
const { parseManifest, isWithinGrant } = require('./core/manifest');
const { withDefaults } = require('./core/settings');

const MANIFEST_FILE = 'cadence-plugin.json';
const ACTIVATE_TIMEOUT_MS = 10000;
const HANDLER_TIMEOUT_MS = 10000;
const MAX_STORAGE_BYTES = 64 * 1024;

// id -> { manifest, folderPath, mod, handlers, router, disposers, storage,
//         writes, settings, error }
const running = new Map();
let unsubscribe = null;

function pluginsDir() {
    if (getConfig().hosted?.enabled) return null;
    const dir = (process.env.TUDUDI_PLUGINS_DIR || '').trim();
    return dir ? path.resolve(dir) : null;
}

const messageOf = (error) =>
    String(error?.message || error || 'Unknown error').slice(0, 500);

function withTimeout(work, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} took more than ${ms / 1000}s`)),
            ms
        );
    });
    return Promise.race([Promise.resolve().then(work), timeout]).finally(() =>
        clearTimeout(timer)
    );
}

function insideFolder(folderPath, relative) {
    const target = path.resolve(folderPath, relative);
    if (!fs.existsSync(target)) return { path: target, exists: false };
    const realFolder = fs.realpathSync(folderPath);
    const realTarget = fs.realpathSync(target);
    const inside = realTarget.startsWith(realFolder + path.sep);
    return { path: realTarget, exists: inside, escapes: !inside };
}

// Every plugin folder in the plugins directory:
// { folder, folderPath, manifest, error, incompatible, entryMissing }.
// The first folder (alphabetical) to use an id wins; a later one is invalid.
function scan() {
    const dir = pluginsDir();
    if (!dir) return [];
    let names;
    try {
        names = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter(
                (e) =>
                    e.isDirectory() &&
                    !e.name.startsWith('.') &&
                    e.name !== 'node_modules'
            )
            .map((e) => e.name)
            .sort();
    } catch {
        return [];
    }

    const seen = new Set();
    return names.map((folder) => {
        const folderPath = path.join(dir, folder);
        const entry = { folder, folderPath };
        let raw;
        try {
            raw = JSON.parse(
                fs.readFileSync(path.join(folderPath, MANIFEST_FILE), 'utf8')
            );
        } catch (error) {
            return {
                ...entry,
                error:
                    error.code === 'ENOENT'
                        ? `${MANIFEST_FILE} not found`
                        : `${MANIFEST_FILE} is not valid JSON`,
            };
        }
        const parsed = parseManifest(raw);
        if (!parsed.ok) {
            return {
                ...entry,
                error: parsed.error,
                incompatible: parsed.incompatible === true,
            };
        }
        const { manifest } = parsed;
        if (seen.has(manifest.id)) {
            return {
                ...entry,
                error: `Another folder already uses the id "${manifest.id}"`,
                duplicate: true,
            };
        }
        seen.add(manifest.id);
        const main = insideFolder(folderPath, manifest.main);
        if (main.escapes) {
            return { ...entry, error: 'main points outside the plugin folder' };
        }
        return {
            ...entry,
            manifest,
            mainPath: main.path,
            entryMissing: !main.exists,
        };
    });
}

function purgeModuleCache(folderPath) {
    const prefix = fs.existsSync(folderPath)
        ? fs.realpathSync(folderPath) + path.sep
        : folderPath + path.sep;
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(prefix)) delete require.cache[key];
    }
}

function noteError(id, message) {
    const plugin = running.get(id);
    if (plugin) plugin.error = message;
    repository.saveError(id, message).catch(() => {});
}

function decryptedSettings(manifest, stored) {
    const values = withDefaults(manifest.settings, stored);
    for (const field of manifest.settings) {
        const value = values[field.key];
        if (field.type === 'secret' && secretCipher.isEncrypted(value)) {
            try {
                values[field.key] = secretCipher.decrypt(value);
            } catch {
                values[field.key] = null;
            }
        }
    }
    return values;
}

function buildContext(plugin, entry, row) {
    const { manifest } = entry;
    const log = (level) => (data, message) =>
        logger[level]({ plugin: manifest.id, ...(data || {}) }, message);

    const ctx = {
        id: manifest.id,
        version: manifest.version,
        logger: {
            debug: log('debug'),
            info: log('info'),
            warn: log('warn'),
            error: log('error'),
        },
        settings: {
            get: (key) => plugin.settings[key],
            all: () => ({ ...plugin.settings }),
        },
        storage: {
            get: (key) => plugin.storage[key],
            set: (key, value) => {
                const next = { ...plugin.storage, [key]: value };
                if (JSON.stringify(next).length > MAX_STORAGE_BYTES) {
                    throw new Error('Plugin storage is limited to 64 KB');
                }
                plugin.storage = next;
                plugin.writes = plugin.writes
                    .then(() => repository.saveStorage(manifest.id, next))
                    .catch(() => {});
            },
            delete: (key) => {
                const next = { ...plugin.storage };
                delete next[key];
                plugin.storage = next;
                plugin.writes = plugin.writes
                    .then(() => repository.saveStorage(manifest.id, next))
                    .catch(() => {});
            },
        },
        onDispose: (fn) => {
            if (typeof fn === 'function') plugin.disposers.push(fn);
        },
    };

    if (manifest.permissions.includes('events')) {
        ctx.on = (event, handler) => {
            if (!manifest.events.includes(event)) {
                throw new Error(
                    `The manifest does not declare the event ${event}`
                );
            }
            if (typeof handler !== 'function') {
                throw new Error('ctx.on needs a function');
            }
            if (!plugin.handlers.has(event)) plugin.handlers.set(event, []);
            plugin.handlers.get(event).push(handler);
        };
    }
    if (manifest.permissions.includes('routes')) {
        plugin.router = express.Router();
        ctx.router = plugin.router;
    }
    return ctx;
}

async function runDisposers(plugin) {
    for (const dispose of plugin.disposers.splice(0).reverse()) {
        try {
            await withTimeout(dispose, HANDLER_TIMEOUT_MS, 'onDispose');
        } catch (error) {
            logger.warn(
                { plugin: plugin.manifest.id, error: messageOf(error) },
                'Plugin dispose failed'
            );
        }
    }
}

// Loads one plugin. Resolves { ok: true } or { ok: false, error }; never
// throws and never leaves a half-started plugin behind.
async function activate(entry, row) {
    const { manifest } = entry;
    ensureSubscribed();
    await deactivate(manifest.id);

    const plugin = {
        manifest,
        folderPath: entry.folderPath,
        mod: null,
        handlers: new Map(),
        router: null,
        disposers: [],
        storage: { ...(row?.storage || {}) },
        writes: Promise.resolve(),
        settings: decryptedSettings(manifest, row?.settings),
        error: null,
        ui: manifest.menu
            ? express.static(
                  path.join(entry.folderPath, path.dirname(manifest.menu.page)),
                  {
                      dotfiles: 'ignore',
                      redirect: false,
                      setHeaders: (res) => {
                          res.setHeader('X-Content-Type-Options', 'nosniff');
                          // The page belongs to a plugin an admin turned on,
                          // so it may use inline scripts and call its own
                          // routes; nothing outside this server.
                          res.setHeader(
                              'Content-Security-Policy',
                              "default-src 'self' 'unsafe-inline' data:; frame-ancestors 'self'"
                          );
                      },
                  }
              )
            : null,
    };
    running.set(manifest.id, plugin);

    try {
        purgeModuleCache(entry.folderPath);
        // eslint-disable-next-line global-require
        plugin.mod = require(entry.mainPath);
        if (typeof plugin.mod?.activate !== 'function') {
            throw new Error('The entry point must export activate(ctx)');
        }
        const ctx = buildContext(plugin, entry, row);
        await withTimeout(
            () => plugin.mod.activate(ctx),
            ACTIVATE_TIMEOUT_MS,
            'activate'
        );
        await repository.saveError(manifest.id, null);
        return { ok: true };
    } catch (error) {
        const message = messageOf(error);
        logger.error(
            { plugin: manifest.id, error: message },
            'Plugin failed to activate'
        );
        await deactivate(manifest.id);
        await repository.saveError(manifest.id, message).catch(() => {});
        return { ok: false, error: message };
    }
}

async function deactivate(id) {
    const plugin = running.get(id);
    if (!plugin) return;
    running.delete(id);
    try {
        if (typeof plugin.mod?.deactivate === 'function') {
            await withTimeout(
                () => plugin.mod.deactivate(),
                HANDLER_TIMEOUT_MS,
                'deactivate'
            );
        }
    } catch (error) {
        logger.warn(
            { plugin: id, error: messageOf(error) },
            'Plugin deactivate failed'
        );
    }
    await runDisposers(plugin);
    await plugin.writes;
    purgeModuleCache(plugin.folderPath);
}

async function unloadAll() {
    for (const id of [...running.keys()]) {
        // eslint-disable-next-line no-await-in-loop
        await deactivate(id);
    }
}

function runHandler(plugin, handler, event) {
    setImmediate(() => {
        withTimeout(() => handler(event), HANDLER_TIMEOUT_MS, event.name).catch(
            (error) => {
                const message = messageOf(error);
                logger.warn(
                    { plugin: plugin.manifest.id, event: event.name },
                    'Plugin handler failed'
                );
                noteError(plugin.manifest.id, message);
            }
        );
    });
}

function onEvent(event) {
    for (const plugin of running.values()) {
        const handlers = plugin.handlers.get(event.name);
        if (!handlers) continue;
        for (const handler of handlers) runHandler(plugin, handler, event);
    }
}

// Express handler for /plugins/:id/x/*: forwards to the plugin's router
// while it runs, 404 otherwise.
function routeHandler(req, res, next) {
    const plugin = running.get(req.params.id);
    if (!plugin?.router) {
        return res.status(404).json({ error: 'Plugin not found' });
    }
    return plugin.router(req, res, next);
}

function ensureSubscribed() {
    if (unsubscribe) return;
    unsubscribe = eventBus.subscribe((event) =>
        onEvent({ id: uid(), at: new Date().toISOString(), ...event })
    );
}

// Express handler for /plugins/:id/ui/*: the files of the plugin's page.
function uiHandler(req, res, next) {
    const plugin = running.get(req.params.id);
    if (!plugin?.ui) return res.status(404).json({ error: 'Plugin not found' });
    return plugin.ui(req, res, next);
}

// Sidebar entries of the plugins that run.
function menuItems() {
    return [...running.values()]
        .filter((plugin) => plugin.manifest.menu)
        .map((plugin) => ({
            id: plugin.manifest.id,
            label: plugin.manifest.menu.label,
            path: `/plugins/${plugin.manifest.id}`,
            // Where the page is served: /api/plugins/<id>/ui/<file>
            file: path.basename(plugin.manifest.menu.page),
        }));
}

// Starts what was left on at the last shutdown. Called once at boot, and by
// tests to simulate a restart.
async function start() {
    ensureSubscribed();
    if (!pluginsDir()) return;
    const rows = new Map((await repository.findAll()).map((r) => [r.slug, r]));
    for (const entry of scan()) {
        const row = entry.manifest && rows.get(entry.manifest.id);
        if (
            row?.enabled &&
            !entry.entryMissing &&
            isWithinGrant(entry.manifest, row.grant)
        ) {
            // eslint-disable-next-line no-await-in-loop
            await activate(entry, row);
        }
    }
}

const isRunning = (id) => running.has(id);
const runningVersion = (id) => running.get(id)?.manifest.version || null;
const runtimeError = (id) => running.get(id)?.error || null;

// A saved settings change is visible to the running plugin at once.
function refreshSettings(entry, row) {
    const plugin = running.get(entry.manifest.id);
    if (plugin)
        plugin.settings = decryptedSettings(entry.manifest, row.settings);
}

module.exports = {
    pluginsDir,
    scan,
    start,
    activate,
    deactivate,
    unloadAll,
    routeHandler,
    uiHandler,
    menuItems,
    refreshSettings,
    isRunning,
    runningVersion,
    runtimeError,
    onEvent,
};
