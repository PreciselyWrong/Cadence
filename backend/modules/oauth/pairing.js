'use strict';

// The pairing window (docs/38-remote-mcp.md): client registration and
// authorization are refused unless the owner clicked "Authorize a new
// connector" in the web profile in the last ten minutes. A pairing serves
// one client, the first to register or, for a client that connects again,
// the first to open the consent page, and it closes once a grant is given.
// In memory, like the authorization codes: a restart only means clicking
// again.

const PAIRING_TTL_MS = 10 * 60 * 1000;

let current = null;

const live = () => {
    if (current && current.expiresAt <= Date.now()) current = null;
    return current;
};

function open(userId) {
    current = {
        userId,
        clientId: null,
        expiresAt: Date.now() + PAIRING_TTL_MS,
    };
    return { expiresAt: new Date(current.expiresAt) };
}

function status() {
    const pairing = live();
    return pairing
        ? {
              open: true,
              expiresAt: new Date(pairing.expiresAt),
              clientBound: pairing.clientId !== null,
          }
        : { open: false, expiresAt: null, clientBound: false };
}

// Whether a new client may register now. The caller binds it with bind().
const acceptsRegistration = () => {
    const pairing = live();
    return !!pairing && pairing.clientId === null;
};

// Whether this client may use the consent page now, binding the pairing to
// it when no client has claimed it yet.
function admitClient(clientId) {
    const pairing = live();
    if (!pairing) return false;
    if (pairing.clientId === null) pairing.clientId = clientId;
    return pairing.clientId === clientId;
}

function bind(clientId) {
    const pairing = live();
    if (pairing && pairing.clientId === null) pairing.clientId = clientId;
}

const openedBy = () => live()?.userId ?? null;

function close() {
    current = null;
}

module.exports = {
    PAIRING_TTL_MS,
    open,
    status,
    acceptsRegistration,
    admitClient,
    bind,
    openedBy,
    close,
};
