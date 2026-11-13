'use strict';

// Week-end proposals (docs/48-weekend.md). The agent builds the payload; Cadence
// checks it, keeps what is valid, records the user's choice per slot, and
// checks the event reports that come back from capgw. Nothing here reads the
// database.
const moment = require('moment-timezone');
const { ConflictError, ValidationError } = require('../../../shared/errors');
const { cleanText } = require('./text');

const HEADLINE_MAX = 60;
const SUBTITLE_MAX = 160;
const LIMITS = { days: 2, slots: 6, places: 5 };
const BUSY_MAX = 120;
const TITLE_MAX = 120;
const NOTE_MAX = 140;
const TRAVEL_MAX = 30;
const AFTER_MAX = 120;
const PLACE_MAX = 60;
const DECISION_NOTE_MAX = 500;
const ERROR_MAX = 200;
const URL_MAX = 2048;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEATHER = new Set([
    'sun',
    'partly',
    'cloud',
    'rain',
    'snow',
    'storm',
    'fog',
]);
const PARTS = new Set(['morning', 'afternoon', 'day']);
const OPS = new Set(['calendar', 'skip', 'other']);
// A final operation settles the slot; `other` asks for another idea and
// leaves it open.
const FINAL_OPS = new Set(['calendar', 'skip']);
const EVENT_STATES = new Set(['created', 'failed']);
const CALENDAR_HOSTS = ['calendar.google.com', 'www.google.com'];
const TEMP_LIMIT = 60;

const isObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const dayOf = (value) => {
    if (typeof value !== 'string') return null;
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return moment(day, 'YYYY-MM-DD', true).isValid() ? day : null;
};

const textOf = (value, max) => cleanText(value, max) || null;
const enumOf = (value, allowed) => (allowed.has(value) ? value : null);
const intOf = (value) =>
    Number.isInteger(value) && Math.abs(value) <= TEMP_LIMIT ? value : null;
const timeOf = (value) =>
    typeof value === 'string' && TIME.test(value) ? value : null;
const idOf = (entry) =>
    typeof entry.id === 'string' && ID.test(entry.id) ? entry.id : null;

// An https address; on one of the given hosts when asked. Anything else is null.
function httpsUrl(value, hosts) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > URL_MAX) return null;
    try {
        const url = new URL(text);
        if (url.protocol !== 'https:') return null;
        if (hosts && !hosts.includes(url.hostname)) return null;
        return url.href;
    } catch {
        return null;
    }
}

// The valid entries of a list, in order: at most `max`, and no repeated key
// when a key is given.
function listOf(raw, max, read, keyOf) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const entry of raw) {
        if (out.length >= max) break;
        const item = isObject(entry) ? read(entry) : null;
        if (!item) continue;
        if (keyOf) {
            const key = keyOf(item);
            if (seen.has(key)) continue;
            seen.add(key);
        }
        out.push(item);
    }
    return out;
}

const readDay = (entry) => {
    const date = dayOf(entry.date);
    if (!date) return null;
    return {
        date,
        weather: enumOf(entry.weather, WEATHER),
        min: intOf(entry.min),
        max: intOf(entry.max),
    };
};

function readActivity(entry) {
    if (!isObject(entry)) return null;
    const title = cleanText(entry.title, TITLE_MAX);
    if (!title) return null;
    return {
        title,
        url: httpsUrl(entry.url),
        note: textOf(entry.note, NOTE_MAX),
        travel: textOf(entry.travel, TRAVEL_MAX),
        start: timeOf(entry.start),
        end: timeOf(entry.end),
        after: textOf(entry.after, AFTER_MAX),
    };
}

// A slot needs an id, a day of the proposal and a part of the day. A busy slot
// is what the calendar holds: it has no activity and takes no decision.
function readSlot(entry, dates) {
    const id = idOf(entry);
    const date = dayOf(entry.date);
    if (!id || !date || !dates.has(date) || !PARTS.has(entry.part)) return null;
    const busy = textOf(entry.busy, BUSY_MAX);
    const activity = busy ? null : readActivity(entry.activity);
    return {
        id,
        date,
        part: entry.part,
        weather: enumOf(entry.weather, WEATHER),
        temp: intOf(entry.temp),
        feels: intOf(entry.feels),
        busy,
        after: textOf(entry.after, AFTER_MAX),
        recommended: activity !== null && entry.recommended === true,
        activity,
    };
}

const readPlace = (entry) => {
    const place = cleanText(entry.place, PLACE_MAX);
    const date = dayOf(entry.date);
    if (!place || !date) return null;
    return {
        place,
        date,
        weather: enumOf(entry.weather, WEATHER),
        temp: intOf(entry.temp),
        travel: textOf(entry.travel, TRAVEL_MAX),
    };
};

// The checked payload, kept as the proposal's answer. Throws a ValidationError
// when there is no headline or no valid slot.
function validateWeekend(raw) {
    if (!isObject(raw)) throw new ValidationError('payload must be an object');
    const headline = cleanText(raw.headline, HEADLINE_MAX);
    if (!headline) throw new ValidationError('headline is required');
    const days = listOf(raw.days, LIMITS.days, readDay, (day) => day.date);
    const dates = new Set(days.map((day) => day.date));
    const slots = listOf(
        raw.slots,
        LIMITS.slots,
        (entry) => readSlot(entry, dates),
        (slot) => slot.id
    );
    if (slots.length === 0) throw new ValidationError('no slot');
    return {
        headline,
        subtitle: textOf(raw.subtitle, SUBTITLE_MAX),
        days,
        slots,
        elsewhere: listOf(raw.elsewhere, LIMITS.places, readPlace),
    };
}

const isFinal = (decision) => FINAL_OPS.has(decision.op);

// The decisions the user sent, checked against the answer and against the
// decisions already kept. A slot already settled refuses the whole call.
function checkWeekendDecisions(answer, raw, previous = []) {
    if (!Array.isArray(raw)) {
        throw new ValidationError('decisions must be a list');
    }
    const slots = new Map(answer.slots.map((slot) => [slot.id, slot]));
    const settled = new Set(
        previous.filter(isFinal).map((decision) => decision.slot_id)
    );
    const seen = new Set();
    return raw.map((entry) => {
        const slot = isObject(entry) ? slots.get(entry.slot_id) : undefined;
        if (!slot) throw new ValidationError('decision names an unknown slot');
        if (!slot.activity) {
            throw new ValidationError('slot has no activity to decide');
        }
        if (!OPS.has(entry.op)) {
            throw new ValidationError(`op ${entry.op} is not allowed`);
        }
        if (settled.has(slot.id)) {
            throw new ValidationError(`${slot.id} already_decided`);
        }
        if (seen.has(slot.id)) {
            throw new ValidationError(`${slot.id} decided twice`);
        }
        seen.add(slot.id);
        const decision = { slot_id: slot.id, op: entry.op };
        const note = textOf(entry.note, DECISION_NOTE_MAX);
        if (note) decision.note = note;
        return decision;
    });
}

// Keeps the decisions by slot: a new one replaces the older one of its slot. A
// calendar decision asks capgw for the event, so its event is requested.
function recordDecisions(previous, checked) {
    const bySlot = new Map(
        previous.map((decision) => [decision.slot_id, decision])
    );
    for (const decision of checked) {
        const stored = { ...decision };
        if (decision.op === 'calendar') stored.event = { state: 'requested' };
        bySlot.set(decision.slot_id, stored);
    }
    return [...bySlot.values()];
}

// The final decisions of a replaced proposal that the new answer still
// proposes in the same slot. An open « other » request is not carried: the new
// answer is its answer.
function carryDecisions(previous, answer) {
    const open = new Set(
        answer.slots.filter((slot) => slot.activity).map((slot) => slot.id)
    );
    return previous.filter(
        (decision) => isFinal(decision) && open.has(decision.slot_id)
    );
}

// True when every slot with an activity has a final decision.
function isComplete(answer, decisions) {
    const settled = new Set(
        decisions.filter(isFinal).map((decision) => decision.slot_id)
    );
    return answer.slots.every((slot) => !slot.activity || settled.has(slot.id));
}

// The answer with the decision and the event of each slot.
function withSlotDecisions(answer, decisions) {
    const bySlot = new Map(
        decisions.map((decision) => [decision.slot_id, decision])
    );
    return {
        ...answer,
        slots: answer.slots.map((slot) => {
            const decision = bySlot.get(slot.id);
            return {
                ...slot,
                decision: decision?.op ?? null,
                event: decision?.event ?? null,
            };
        }),
    };
}

// The event report of capgw: created with the calendar link, or failed with
// its reason. A link that is not https on Google Calendar is dropped.
function checkEventReport(raw) {
    if (!isObject(raw)) throw new ValidationError('report must be an object');
    if (typeof raw.slot_id !== 'string' || !raw.slot_id) {
        throw new ValidationError('slot_id is required');
    }
    if (!EVENT_STATES.has(raw.state)) {
        throw new ValidationError('state must be created or failed');
    }
    return {
        slot_id: raw.slot_id,
        state: raw.state,
        link: httpsUrl(raw.link, CALENDAR_HOSTS),
        error: textOf(raw.error, ERROR_MAX),
    };
}

// Sets the event of a requested calendar decision. A report is final: a slot
// already created or failed is a conflict.
function reportEvent(decisions, report) {
    const index = decisions.findIndex(
        (decision) =>
            decision.slot_id === report.slot_id && decision.op === 'calendar'
    );
    if (index < 0) {
        throw new ValidationError('no calendar decision on this slot');
    }
    if (decisions[index].event?.state !== 'requested') {
        throw new ConflictError('event already reported');
    }
    const event = {
        state: report.state,
        ...(report.link && { link: report.link }),
        ...(report.error && { error: report.error }),
    };
    return decisions.map((decision, i) =>
        i === index ? { ...decision, event } : decision
    );
}

module.exports = {
    validateWeekend,
    checkWeekendDecisions,
    recordDecisions,
    carryDecisions,
    withSlotDecisions,
    isComplete,
    isFinal,
    checkEventReport,
    reportEvent,
};
