'use strict';

const fs = require('fs');
const path = require('path');
const rolesService = require('../../services/rolesService');
const secretCipher = require('../../shared/crypto/secretCipher');
const { safeRequest } = require('../caldav/services/safe-request');
const {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} = require('../../shared/errors');
const registry = require('./registry');
const git = require('./git');
const { parseGitUrl } = require('./core/gitUrl');
const repository = require('./repository');
const { compareVersions, grantFor, isWithinGrant } = require('./core/manifest');
const { withDefaults, applySettingsUpdate } = require('./core/settings');

const UPDATE_TIMEOUT_MS = 8000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

async function assertAdmin(userId) {
    if (!userId) throw new UnauthorizedError('Authentication required');
    if (!(await rolesService.isAdmin(userId))) {
        throw new ForbiddenError('Forbidden');
    }
}

function settingsView(manifest, stored) {
    const values = withDefaults(manifest.settings, stored);
    return manifest.settings.map((field) => {
        const base = { ...field };
        delete base.default;
        if (field.type === 'secret') {
            return { ...base, has_value: !!(stored && stored[field.key]) };
        }
        return { ...base, value: values[field.key] };
    });
}

function updateView(manifest, row) {
    if (!manifest?.update) return null;
    const check = row?.update_check || null;
    return {
        url: manifest.update.url,
        latest: check?.latest || null,
        available:
            !!check?.latest &&
            compareVersions(check.latest, manifest.version) > 0,
        checked_at: check?.checked_at || null,
        error: check?.error || null,
    };
}

function stateOf(entry, row) {
    if (!entry) return 'missing';
    if (!entry.manifest) return entry.incompatible ? 'incompatible' : 'invalid';
    if (!row?.enabled) return 'disabled';
    if (!isWithinGrant(entry.manifest, row.grant)) return 'needs_approval';
    return registry.isRunning(entry.manifest.id) ? 'active' : 'error';
}

function view(entry, row) {
    const manifest = entry?.manifest || null;
    const state = stateOf(entry, row);
    return {
        id: manifest?.id || row?.slug || null,
        folder: entry?.folder || null,
        name: manifest?.name || row?.slug || entry?.folder || null,
        description: manifest?.description || '',
        version: manifest?.version || row?.version_seen || null,
        loaded_version: manifest ? registry.runningVersion(manifest.id) : null,
        previous_version: row?.previous_version || null,
        state,
        last_error:
            (manifest && registry.runtimeError(manifest.id)) ||
            (state === 'error' ? row?.last_error : null) ||
            entry?.error ||
            null,
        permissions: manifest?.permissions || [],
        events: manifest?.events || [],
        settings: manifest ? settingsView(manifest, row?.settings) : [],
        update: updateView(manifest, row),
        entry_missing: entry?.entryMissing === true,
        menu: manifest?.menu || null,
        installed_from_git:
            !!entry && fs.existsSync(path.join(entry.folderPath, '.git')),
    };
}

async function list(userId) {
    await assertAdmin(userId);
    if (!registry.pluginsDir()) return { configured: false, plugins: [] };

    const rows = new Map((await repository.findAll()).map((r) => [r.slug, r]));
    const entries = registry.scan();
    const plugins = entries.map((entry) =>
        view(entry, entry.manifest ? rows.get(entry.manifest.id) : null)
    );
    const found = new Set(
        entries.filter((e) => e.manifest).map((e) => e.manifest.id)
    );
    for (const row of rows.values()) {
        if (row.enabled && !found.has(row.slug)) plugins.push(view(null, row));
    }
    return { configured: true, plugins };
}

async function load(id) {
    const entry = registry.scan().find((e) => e.manifest?.id === id);
    if (!entry) throw new NotFoundError('Plugin not found');
    return { entry, row: await repository.findBySlug(id) };
}

function encryptNewSecrets(manifest, current, values) {
    const result = { ...values };
    for (const field of manifest.settings) {
        if (field.type !== 'secret') continue;
        const value = result[field.key];
        if (typeof value !== 'string' || value === current?.[field.key]) {
            continue;
        }
        if (!secretCipher.hasKeyMaterial()) {
            throw new ValidationError(
                'Set TUDUDI_SESSION_SECRET before saving a secret'
            );
        }
        result[field.key] = secretCipher.encrypt(value);
    }
    return result;
}

async function update(userId, id, body) {
    await assertAdmin(userId);
    const { entry, row } = await load(id);
    const { manifest } = entry;
    const input = body && typeof body === 'object' ? body : {};
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
        throw new ValidationError('enabled must be true or false');
    }

    const patch = {};
    let settings = row?.settings || {};
    if (input.settings !== undefined) {
        const result = applySettingsUpdate(
            manifest.settings,
            settings,
            input.settings
        );
        if (!result.ok) throw new ValidationError(result.error);
        settings = encryptNewSecrets(manifest, row?.settings, result.values);
        patch.settings = settings;
    }

    if (input.enabled === true) {
        if (entry.entryMissing) {
            throw new ValidationError(
                `The entry file ${manifest.main} is missing`
            );
        }
        const { missing } = applySettingsUpdate(
            manifest.settings,
            settings,
            {}
        );
        if (missing.length > 0) {
            throw new ValidationError(`Fill in: ${missing.join(', ')}`);
        }
        patch.enabled = true;
        patch.grant = grantFor(manifest);
        if (row?.version_seen !== manifest.version) {
            patch.previous_version = row?.version_seen || null;
            patch.version_seen = manifest.version;
        }
    } else if (input.enabled === false) {
        patch.enabled = false;
    }

    const saved = await repository.save(id, patch);
    if (input.enabled === true) {
        await registry.activate(entry, saved);
    } else if (input.enabled === false) {
        await registry.deactivate(id);
    } else if (patch.settings) {
        registry.refreshSettings(entry, saved);
    }
    return view(entry, await repository.findBySlug(id));
}

// Remembers a version change the admin made by replacing the folder.
async function noteVersion(entry, row) {
    if (!row || row.version_seen === entry.manifest.version) return row;
    return repository.save(entry.manifest.id, {
        previous_version: row.version_seen || row.previous_version,
        version_seen: entry.manifest.version,
    });
}

async function reloadAll(userId) {
    await assertAdmin(userId);
    await registry.unloadAll();
    const rows = new Map((await repository.findAll()).map((r) => [r.slug, r]));
    for (const entry of registry.scan()) {
        if (entry.manifest) {
            // eslint-disable-next-line no-await-in-loop
            await noteVersion(entry, rows.get(entry.manifest.id));
        }
    }
    await registry.start();
    return list(userId);
}

async function reloadOne(userId, id) {
    await assertAdmin(userId);
    const { entry, row } = await load(id);
    await registry.deactivate(id);
    const current = await noteVersion(entry, row);
    if (
        current?.enabled &&
        !entry.entryMissing &&
        isWithinGrant(entry.manifest, current.grant)
    ) {
        await registry.activate(entry, current);
    }
    return view(entry, await repository.findBySlug(id));
}

async function checkUpdate(userId, id) {
    await assertAdmin(userId);
    const { entry, row } = await load(id);
    const { manifest } = entry;
    if (!manifest.update) {
        throw new ValidationError('This plugin has no update address');
    }
    const checked_at = new Date().toISOString();
    let check;
    try {
        const response = await safeRequest({
            url: manifest.update.url,
            method: 'GET',
            timeout: UPDATE_TIMEOUT_MS,
            maxContentLength: 100000,
            headers: { Accept: 'application/json' },
        });
        const data =
            typeof response.data === 'string'
                ? JSON.parse(response.data)
                : response.data;
        if (!VERSION_PATTERN.test(String(data?.version || ''))) {
            throw new Error('No version in the answer');
        }
        check = { checked_at, latest: data.version, error: null };
    } catch {
        check = {
            checked_at,
            latest: null,
            error: 'Could not read the update address',
        };
    }
    const saved = await repository.save(id, { update_check: check });
    return view(entry, saved || row);
}

// Clones a repository into the plugins folder. The plugin stays off: the
// admin reads what it asks for, then turns it on.
async function install(userId, rawUrl) {
    await assertAdmin(userId);
    const dir = registry.pluginsDir();
    if (!dir) throw new ValidationError('Set TUDUDI_PLUGINS_DIR first');
    const parsed = parseGitUrl(rawUrl);
    if (!parsed.ok) throw new ValidationError(parsed.error);

    const target = path.join(dir, parsed.folder);
    if (fs.existsSync(target)) {
        throw new ConflictError(`The folder ${parsed.folder} already exists`);
    }
    fs.mkdirSync(dir, { recursive: true });
    const discard = () => fs.rmSync(target, { recursive: true, force: true });

    try {
        await git.clone(parsed.url, target);
    } catch (error) {
        discard();
        throw new ValidationError(`Could not clone: ${error.message}`);
    }

    const entry = registry.scan().find((e) => e.folder === parsed.folder);
    if (entry?.duplicate) {
        discard();
        throw new ConflictError(entry.error);
    }
    if (!entry?.manifest) {
        discard();
        throw new ValidationError(
            entry?.error || 'The repository holds no cadence-plugin.json'
        );
    }
    const duplicate = registry
        .scan()
        .some(
            (e) =>
                e.manifest?.id === entry.manifest.id &&
                e.folder !== parsed.folder
        );
    if (duplicate) {
        discard();
        throw new ConflictError(
            `A plugin with the id ${entry.manifest.id} is already installed`
        );
    }
    return view(entry, await repository.findBySlug(entry.manifest.id));
}

// git pull --ff-only in a plugin installed from Git, then a reload.
async function pull(userId, id) {
    await assertAdmin(userId);
    const { entry } = await load(id);
    if (!fs.existsSync(path.join(entry.folderPath, '.git'))) {
        throw new ValidationError('This plugin was not installed from Git');
    }
    try {
        await git.pull(entry.folderPath);
    } catch (error) {
        throw new ValidationError(`Could not update: ${error.message}`);
    }
    return reloadOne(userId, id);
}

// Stops the plugin, deletes its folder and what Cadence kept for it. A
// plugin that is only a row (folder already gone) is cleaned up the same way.
async function remove(userId, id) {
    await assertAdmin(userId);
    const entry = registry.scan().find((e) => e.manifest?.id === id);
    const row = await repository.findBySlug(id);
    if (!entry && !row) throw new NotFoundError('Plugin not found');
    await registry.deactivate(id);
    if (entry) {
        const dir = fs.realpathSync(registry.pluginsDir());
        const real = fs.realpathSync(entry.folderPath);
        if (!real.startsWith(dir + path.sep)) {
            throw new ForbiddenError(
                'The plugin folder is outside the plugins folder'
            );
        }
        fs.rmSync(real, { recursive: true, force: true });
    }
    await repository.remove(id);
    return { removed: id };
}

module.exports = {
    install,
    pull,
    remove,
    list,
    update,
    reloadAll,
    reloadOne,
    checkUpdate,
};
