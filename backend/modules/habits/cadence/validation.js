'use strict';

const { ENTITIES, DAYS_OF_WEEK } = require('./schema');
const { isDate } = require('./dates');
const models = require('./models');

// Validation shared by every write path (sync push, REST). Types and enums
// come from schema.js; the cross-field rules reuse the builders of the rule
// engine, so a goal, schedule or pause refused by the Kotlin domain is
// refused here too.

const INT_MAX = 2147483647;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_INSTANT =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const NAME_LISTS = (value) =>
    String(value ?? '')
        .split(',')
        .filter((part) => part !== '');

function typeError(spec, value) {
    switch (spec.type) {
        case 'str':
            return typeof value === 'string' && value.length <= spec.len
                ? null
                : 'invalid_value';
        case 'text':
            return typeof value === 'string' ? null : 'invalid_value';
        case 'enum':
            return spec.values.includes(value) ? null : 'invalid_value';
        case 'int':
            return Number.isSafeInteger(value) && Math.abs(value) <= INT_MAX
                ? null
                : 'invalid_value';
        case 'big':
            return Number.isSafeInteger(value) ? null : 'invalid_value';
        case 'bool':
            return typeof value === 'boolean' ? null : 'invalid_value';
        case 'day':
            return typeof value === 'string' && isDate(value)
                ? null
                : 'invalid_value';
        case 'ts':
            return (typeof value === 'string' && ISO_INSTANT.test(value)) ||
                value instanceof Date
                ? null
                : 'invalid_value';
        default:
            return 'invalid_value';
    }
}

// The row as the rules see it: dates as ISO strings, the incoming values on
// top. Reference columns hold numeric ids.
function merged(row, values) {
    const out = {};
    if (row) {
        for (const [key, value] of Object.entries(row.get({ plain: true }))) {
            out[key] = value instanceof Date ? value.toISOString() : value;
        }
    }
    for (const [key, value] of Object.entries(values)) {
        out[key] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
}

function checkColumns(def, row, values) {
    const refColumns = Object.values(def.refs);
    for (const [name, spec] of Object.entries(def.columns)) {
        if (name in values) {
            const value = values[name];
            if (value === null || value === undefined) {
                if (spec.required) return `invalid_value:${name}`;
            } else if (typeError(spec, value)) {
                return `invalid_value:${name}`;
            }
        } else if (!row && spec.required && spec.default === undefined) {
            return `missing_field:${name}`;
        }
    }
    for (const ref of refColumns) {
        if (ref.required && !row && !values[ref.column]) {
            return `missing_field:${ref.column}`;
        }
        if (ref.required && ref.column in values && !values[ref.column]) {
            return `invalid_value:${ref.column}`;
        }
    }
    return null;
}

const when = (condition) => (condition ? null : 'invalid_value');
const attempt = (fn) => {
    try {
        fn();
        return null;
    } catch {
        return 'invalid_value';
    }
};
const bothOrNone = (...values) =>
    values.every((v) => v === null || v === undefined) ||
    values.every((v) => v !== null && v !== undefined);

const INVARIANTS = {
    habit_group: (m) =>
        when(
            m.name.trim() !== '' &&
                bothOrNone(m.start_minute, m.end_minute) &&
                [m.start_minute, m.end_minute].every(
                    (v) => v == null || (v >= 0 && v < 1440)
                )
        ),
    habit: (m) =>
        when(
            m.name.trim() !== '' &&
                (m.alcohol_follow_up_time == null ||
                    TIME.test(m.alcohol_follow_up_time))
        ),
    habit_goal: (m) =>
        when(
            bothOrNone(
                m.progression_step,
                m.progression_cadence,
                m.progression_starts_on
            )
        ) ||
        attempt(() =>
            models.buildGoal({
                targetMinor: m.target_minor,
                period: m.period,
                goalType: m.goal_type,
                unit: m.unit_id
                    ? {
                          id: m.unit_id,
                          dimension: m.unit_dimension ?? 'CUSTOM',
                          nameFr: m.unit_name_fr ?? '',
                          symbol: m.unit_symbol ?? '',
                          scaleToCanonical: m.unit_scale_to_canonical ?? 1,
                      }
                    : null,
                frequencyTarget: m.frequency_target,
                minimumMinor: m.minimum_minor,
                direction: m.direction,
                progression:
                    m.progression_step == null
                        ? null
                        : {
                              step: m.progression_step,
                              cadence: m.progression_cadence,
                              capMinor: m.progression_cap_minor,
                              startsOn: m.progression_starts_on,
                          },
            })
        ),
    habit_schedule: (m) =>
        attempt(() =>
            models.buildSchedule({
                mode: m.schedule_mode,
                activeDays: NAME_LISTS(m.active_days),
                firstDayOfWeek: m.first_day_of_week,
                intervalDays: m.interval_days,
            })
        ),
    habit_entry: (m) => when(m.value_minor > 0),
    habit_pause: (m) =>
        attempt(() =>
            models.buildPause({
                start: m.start,
                endExclusive: m.end_exclusive,
                reason: m.reason,
                reasonLabel: m.reason_label,
            })
        ),
    habit_quick_value: (m) => when(m.amount_minor > 0),
    habit_reminder: (m) =>
        when(
            TIME.test(m.time) &&
                NAME_LISTS(m.days_of_week).every((d) =>
                    DAYS_OF_WEEK.includes(d)
                )
        ),
    habit_timer: (m) => when(m.accumulated_seconds >= 0),
    health_connect_rule: (m) => {
        const types = NAME_LISTS(m.exercise_types);
        return when(types.length > 0 && types.every((t) => /^\d+$/.test(t)));
    },
    health_connect_import: () => null,
    abstinence_log: (m) =>
        when(
            (m.kind === 'URGE'
                ? Number.isInteger(m.intensity) &&
                  m.intensity >= 1 &&
                  m.intensity <= 5
                : m.intensity == null) &&
                (m.note == null || m.note.length <= 500)
        ),
    alcohol_consumption: (m) =>
        when(m.standard_drinks == null || m.standard_drinks >= 0),
    learned_question_settings: (m) =>
        when(
            TIME.test(m.ask_at) &&
                m.threshold_percent >= 1 &&
                m.threshold_percent <= 100 &&
                NAME_LISTS(m.muted_weekdays).every((d) =>
                    DAYS_OF_WEEK.includes(d)
                )
        ),
    learned_question_record: (m) =>
        when(
            m.outcome === 'AMOUNT' ? m.value_minor > 0 : m.value_minor == null
        ),
};

// A second row with the same natural key but another uid would break a
// unique index; say so rather than failing at the database.
async function duplicateKey(entity, row, m, userId) {
    const def = ENTITIES[entity];
    if (!def.unique) return null;
    const Model = require('../../../models')[def.model];
    const where = { user_id: userId };
    for (const column of def.unique) {
        if (m[column] === undefined || m[column] === null) return null;
        where[column] = m[column];
    }
    const other = await Model.findOne({ where, attributes: ['id'] });
    return other && (!row || other.id !== row.id) ? 'duplicate_key' : null;
}

// Returns an error code or null. `values` are column values (references as
// numeric ids) about to be written on top of `row` (null for a new row).
async function validate(entity, row, values, userId) {
    const def = ENTITIES[entity];
    const columnError = checkColumns(def, row, values);
    if (columnError) return columnError;
    const m = merged(row, values);
    return (
        INVARIANTS[entity](m) || (await duplicateKey(entity, row, m, userId))
    );
}

module.exports = { validate, INVARIANTS, typeError };
