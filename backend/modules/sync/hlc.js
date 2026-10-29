'use strict';

// Hybrid logical clocks, written "<13-digit ms>-<4-digit counter>-<node>"
// so that plain string comparison orders them. The server keeps its own
// clock ahead of every clock it accepts: a web edit made after a device
// synced always wins over that device's older edits.
const NODE = 'server';
const FORMAT = /^(\d{13})-(\d{4})-([A-Za-z0-9_.:-]{1,64})$/;
// A device whose clock runs further ahead than this would win every merge
// until real time caught up.
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

let lastMs = 0;
let lastCounter = 0;

function format(ms, counter, node) {
    return `${String(ms).padStart(13, '0')}-${String(counter).padStart(4, '0')}-${node}`;
}

function parse(value) {
    const match = typeof value === 'string' && FORMAT.exec(value);
    if (!match) return null;
    return { ms: Number(match[1]), counter: Number(match[2]), node: match[3] };
}

function isAcceptable(value, nowMs = Date.now()) {
    const parsed = parse(value);
    return Boolean(parsed) && parsed.ms <= nowMs + MAX_FUTURE_MS;
}

function now() {
    const ms = Date.now();
    if (ms > lastMs) {
        lastMs = ms;
        lastCounter = 0;
    } else if (lastCounter >= 9999) {
        // The counter has four digits; a fifth would break string ordering.
        lastMs += 1;
        lastCounter = 0;
    } else {
        lastCounter += 1;
    }
    return format(lastMs, lastCounter, NODE);
}

function observe(value) {
    const parsed = parse(value);
    if (!parsed) return;
    if (
        parsed.ms > lastMs ||
        (parsed.ms === lastMs && parsed.counter > lastCounter)
    ) {
        lastMs = parsed.ms;
        lastCounter = parsed.counter;
    }
}

module.exports = { now, observe, parse, isAcceptable };
