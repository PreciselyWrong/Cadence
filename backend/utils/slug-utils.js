'use strict';

const SERVER_UID = /^[0-9abcdefghijkmnpqrstuvwxyz]{15}$/;
const UUID_SOURCE =
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CLIENT_UUID = new RegExp(`^${UUID_SOURCE}$`);
const UUID_PREFIX = new RegExp(`^(${UUID_SOURCE})(?:-|$)`);

/**
 * Creates a URL-safe slug from a string
 * @param {string} text - The text to slugify
 * @param {number} maxLength - Maximum length of the slug (default: 50)
 * @returns {string} The slugified text
 */
function createSlug(text, maxLength = 50) {
    if (!text) return '';

    return (
        text
            .toLowerCase()
            .trim()
            // Remove or replace special characters
            .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
            .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, multiple hyphens with single hyphen
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .substring(0, maxLength) // Limit length
            .replace(/-$/, '')
    ); // Remove trailing hyphen if created by substring
}

/**
 * Creates a uid-slug URL for a given entity
 * @param {string} uid - The uid of the entity
 * @param {string} name - The name/title of the entity
 * @param {number} maxSlugLength - Maximum length of the slug part (default: 40)
 * @returns {string} The uid-slug URL part (e.g., "abc123-clean-the-backyard")
 */
function createUidSlug(uid, name, maxSlugLength = 40) {
    if (!uid) throw new Error('UID is required');

    const slug = createSlug(name, maxSlugLength);
    return slug ? `${uid}-${slug}` : uid;
}

/**
 * Extracts uid from a uid-slug URL part
 * @param {string} uidSlug - The uid-slug (e.g., "abc123-clean-the-backyard")
 * @returns {string} The extracted uid
 */
function extractUidFromSlug(uidSlug) {
    if (!uidSlug) return '';

    // A UUID (made offline by a client) holds hyphens itself: take it whole.
    const uuidMatch = uidSlug.match(UUID_PREFIX);
    if (uuidMatch) return uuidMatch[1];

    // UID is always 15 characters by our custom implementation, extract the first part before the first hyphen
    const parts = uidSlug.split('-');
    if (parts.length === 1) {
        // No slug, just uid
        return parts[0];
    }

    // Look for the uid part (15 chars) - it should be the first part
    const firstPart = parts[0];
    if (firstPart.length === 15) {
        return firstPart;
    }

    // Fallback: try to find 15-character alphanumeric string
    const uidMatch = uidSlug.match(/^([0-9abcdefghijkmnpqrstuvwxyz]{15})/);
    return uidMatch ? uidMatch[1] : uidSlug.split('-')[0];
}

/**
 * Validates if a string looks like a valid uid: one made by the server, or a
 * UUID chosen by a client that created the row offline (/api/v1/sync).
 * @param {string} str - String to validate
 * @returns {boolean} True if it looks like a uid
 */
function isValidUid(str) {
    return (
        typeof str === 'string' &&
        (SERVER_UID.test(str) || CLIENT_UUID.test(str))
    );
}

module.exports = {
    createSlug,
    createUidSlug,
    extractUidFromSlug,
    isValidUid,
};
