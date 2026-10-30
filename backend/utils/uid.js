const { customAlphabet } = require('nanoid');

const UID_ALPHABET = '0123456789abcdefghijkmnpqrstuvwxyz';
const UID_LENGTH = 15;

function uid() {
    const generate = customAlphabet(UID_ALPHABET, UID_LENGTH);
    return generate();
}

// Format of uids made by uid(). Clients that choose their own uid (offline
// sync) must send this shape; CalDAV task uids are checked elsewhere.
const UID_PATTERN = new RegExp(`^[${UID_ALPHABET}]{${UID_LENGTH}}$`);

function isValidUid(value) {
    return typeof value === 'string' && UID_PATTERN.test(value);
}

module.exports = { uid, isValidUid };
