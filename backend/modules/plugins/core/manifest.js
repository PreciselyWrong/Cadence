'use strict';

const { ALL_EVENTS } = require('../../webhooks/events');

// The plugin API this server speaks (docs/46-plugins.md). A manifest that
// asks for a higher one needs a newer Cadence.
const PLUGIN_API_VERSION = 1;

const PERMISSIONS = ['events', 'routes', 'notify'];
// Permissions Cadence no longer grants: a manifest that still asks for one
// loads without it, with a warning (`brief`: the daily brief, retired on
// 2026-11-12).
const RETIRED_PERMISSIONS = ['brief'];
const SETTING_TYPES = ['string', 'secret', 'boolean', 'number', 'select'];
const ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const MAX_SETTINGS = 30;

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

function isHttpUrl(value) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

// A relative path that stays inside the plugin folder. The loader resolves
// it again and checks the result, this only rejects the obvious.
function isInnerPath(value) {
    if (!value || value.includes('\0')) return false;
    if (value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
    return !value.split(/[\\/]/).includes('..');
}

// A sidebar entry that opens a page the plugin ships. The page lives in a
// subfolder, which is the only part of the plugin served to browsers.
function parseMenu(raw) {
    if (raw === undefined || raw === null) return { menu: null };
    if (!isObject(raw)) return { error: 'menu must be an object' };
    const label = text(raw.label);
    if (!label || label.length > 40) {
        return { error: 'menu.label is required (40 characters at most)' };
    }
    const page = text(raw.page) || 'ui/index.html';
    if (!isInnerPath(page) || !page.includes('/')) {
        return {
            error: 'menu.page must be a file inside a subfolder, such as ui/index.html',
        };
    }
    return { menu: { label, page } };
}

function parseSettings(raw) {
    if (raw === undefined) return { settings: [] };
    if (!Array.isArray(raw) || raw.length > MAX_SETTINGS) {
        return { error: 'settings must be a list of at most 30 fields' };
    }
    const keys = new Set();
    const settings = [];
    for (const field of raw) {
        if (!isObject(field)) return { error: 'a setting is not an object' };
        const key = text(field.key);
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) {
            return { error: `setting key "${field.key}" is not valid` };
        }
        if (keys.has(key))
            return { error: `setting "${key}" is declared twice` };
        keys.add(key);
        if (!SETTING_TYPES.includes(field.type)) {
            return { error: `setting "${key}" has an unknown type` };
        }
        const label = text(field.label);
        if (!label) return { error: `setting "${key}" needs a label` };
        const parsed = {
            key,
            type: field.type,
            label,
            required: field.required === true,
        };
        if (field.type === 'select') {
            const options = Array.isArray(field.options)
                ? field.options.filter((o) => typeof o === 'string' && o)
                : [];
            if (options.length === 0) {
                return { error: `setting "${key}" needs options` };
            }
            parsed.options = options;
        }
        if (field.default !== undefined && field.type !== 'secret') {
            parsed.default = field.default;
        }
        if (text(field.help)) parsed.help = text(field.help);
        settings.push(parsed);
    }
    return { settings };
}

// Reads the content of a cadence-plugin.json. Returns { ok: true, manifest }
// with every optional field filled in, or { ok: false, error } (with
// `incompatible: true` when only the plugin API version is too new).
function parseManifest(raw) {
    if (!isObject(raw)) return fail('The manifest must be a JSON object');

    const id = text(raw.id);
    if (!ID_PATTERN.test(id)) {
        return fail(
            'id must be 2 to 32 characters: a letter, then a-z, 0-9 or -'
        );
    }
    const name = text(raw.name);
    if (!name || name.length > 100)
        return fail('name is required (100 characters at most)');
    const version = text(raw.version);
    if (!VERSION_PATTERN.test(version))
        return fail('version must look like 1.2.3');
    if (!Number.isInteger(raw.apiVersion) || raw.apiVersion < 1) {
        return fail('apiVersion must be a whole number, 1 or more');
    }
    if (raw.apiVersion > PLUGIN_API_VERSION) {
        return fail(
            `The plugin needs plugin API ${raw.apiVersion}; this Cadence speaks ${PLUGIN_API_VERSION}`,
            { incompatible: true }
        );
    }
    const main = text(raw.main) || 'index.js';
    if (!isInnerPath(main))
        return fail('main must be a path inside the plugin folder');

    const asked = raw.permissions ?? [];
    if (
        !Array.isArray(asked) ||
        asked.some(
            (p) => !PERMISSIONS.includes(p) && !RETIRED_PERMISSIONS.includes(p)
        )
    ) {
        return fail(`permissions can only be: ${PERMISSIONS.join(', ')}`);
    }
    const permissions = asked.filter((p) => PERMISSIONS.includes(p));
    const warnings = RETIRED_PERMISSIONS.filter((p) => asked.includes(p)).map(
        (p) => `The "${p}" permission is retired and ignored`
    );
    const events = raw.events ?? [];
    if (!Array.isArray(events)) return fail('events must be a list');
    const unknown = events.filter((e) => !ALL_EVENTS.includes(e));
    if (unknown.length > 0)
        return fail(`Unknown events: ${unknown.join(', ')}`);
    if (events.length > 0 && !permissions.includes('events')) {
        return fail('events need the "events" permission');
    }

    const { settings, error } = parseSettings(raw.settings);
    if (error) return fail(error);

    const { menu, error: menuError } = parseMenu(raw.menu);
    if (menuError) return fail(menuError);

    let update = null;
    if (raw.update !== undefined && raw.update !== null) {
        if (!isObject(raw.update) || !isHttpUrl(text(raw.update.url))) {
            return fail('update.url must be an http(s) address');
        }
        update = { url: text(raw.update.url) };
    }

    return {
        ok: true,
        manifest: {
            id,
            name,
            version,
            apiVersion: raw.apiVersion,
            description: text(raw.description).slice(0, 500),
            main,
            permissions: PERMISSIONS.filter((p) => permissions.includes(p)),
            events: ALL_EVENTS.filter((e) => events.includes(e)),
            settings,
            update,
            menu,
            warnings,
        },
    };
}

function compareVersions(a, b) {
    const left = String(a).split('.').map(Number);
    const right = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
        if ((left[i] || 0) !== (right[i] || 0)) {
            return (left[i] || 0) > (right[i] || 0) ? 1 : -1;
        }
    }
    return 0;
}

// What an admin approves by turning a plugin on.
function grantFor(manifest) {
    return {
        permissions: [...manifest.permissions],
        events: [...manifest.events],
    };
}

// True when the manifest asks for nothing beyond the recorded grant.
function isWithinGrant(manifest, grant) {
    if (!grant) return false;
    const permissions = grant.permissions || [];
    const events = grant.events || [];
    return (
        manifest.permissions.every((p) => permissions.includes(p)) &&
        manifest.events.every((e) => events.includes(e))
    );
}

module.exports = {
    PLUGIN_API_VERSION,
    PERMISSIONS,
    parseManifest,
    compareVersions,
    grantFor,
    isWithinGrant,
};
