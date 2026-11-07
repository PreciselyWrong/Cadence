'use strict';

// The answer the model must give, as a strict JSON Schema. Every project,
// area and tag it may name is an enum of what exists, and every item uid an
// enum of the batch: it cannot invent one. Strict mode wants every property
// required and additionalProperties: false at every level; "nothing" is null.
// Bounds (confidence 0..1, minutes 5..720) are checked in code (validate.js):
// strict schemas accept no minimum/maximum.

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

function oneOf(values) {
    return values.length > 0
        ? nullable({ type: 'string', enum: values })
        : { type: 'null' };
}

const object = (properties) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
});

function tagNames(catalog) {
    const excluded = new Set(catalog.excluded || []);
    return catalog.tags
        .map((tag) => tag.name)
        .filter((name) => !excluded.has(name));
}

function buildSchema(catalog, itemUids) {
    const projectUids = catalog.projects.map((project) => project.uid);
    const areaUids = catalog.areas.map((area) => area.uid);
    const tags = tagNames(catalog);
    const confidence = { type: 'number' };
    const item = object({
        uid: { type: 'string', enum: itemUids },
        project: object({
            uid: oneOf(projectUids),
            confidence,
            alternatives: { type: 'array', items: oneOf(projectUids) },
        }),
        area: object({ uid: oneOf(areaUids), confidence }),
        new_project: object({
            name: nullable({ type: 'string' }),
            area_uid: oneOf(areaUids),
        }),
        tags: {
            type: 'array',
            items: object({ name: oneOf(tags), confidence }),
        },
        new_tag: nullable({ type: 'string' }),
        estimated_minutes: object({
            value: nullable({ type: 'integer' }),
            confidence,
        }),
        priority: object({
            value: { type: 'integer', enum: [0, 1, 2] },
            confidence,
        }),
        summary: nullable({ type: 'string' }),
    });
    return object({ items: { type: 'array', items: item } });
}

module.exports = { buildSchema, tagNames };
