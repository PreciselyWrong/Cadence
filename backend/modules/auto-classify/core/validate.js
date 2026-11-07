'use strict';

// What the model said, made safe (docs/41-auto-classify.md). Code keeps only
// a known uid or tag, for a field still empty, above its threshold; between
// the ask threshold and the write threshold it becomes a question for the
// user; anything else is dropped. A null answer is normal and means nothing.
const { cleanSummary } = require('./summary');

const NAME_MIN = 2;
const PROJECT_NAME_MAX = 100;
const TAG_NAME_MAX = 50;
const MINUTES_MIN = 5;
const MINUTES_MAX = 720;
const MAX_PROJECT_OPTIONS = 3;

function confidenceOf(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : 0;
}

const lower = (text) => text.toLocaleLowerCase('fr');

function indexCatalog(catalog) {
    const excluded = new Set(catalog.excluded || []);
    return {
        projects: new Map(catalog.projects.map((p) => [p.uid, p])),
        projectNames: new Set(catalog.projects.map((p) => lower(p.name))),
        areas: new Map(catalog.areas.map((a) => [a.uid, a])),
        tags: new Set(
            catalog.tags.map((t) => t.name).filter((n) => !excluded.has(n))
        ),
        allTagNames: new Set(catalog.tags.map((t) => lower(t.name))),
        excluded: new Set([...excluded].map(lower)),
    };
}

function cleanName(raw, max) {
    if (typeof raw !== 'string') return null;
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < NAME_MIN || name.length > max) return null;
    return /[,\n\r]/.test(name) ? null : name;
}

function newProjectOf(raw, index) {
    const name = cleanName(raw?.name, PROJECT_NAME_MAX);
    if (!name || index.projectNames.has(lower(name))) return null;
    const areaUid = index.areas.has(raw.area_uid) ? raw.area_uid : null;
    return { name, area_uid: areaUid };
}

function newTagOf(raw, index) {
    const name = cleanName(raw, TAG_NAME_MAX);
    if (!name) return null;
    const key = lower(name);
    if (index.allTagNames.has(key) || index.excluded.has(key)) return null;
    return name;
}

function decideProject(raw, item, index, t, out) {
    const project = raw.project || {};
    const projectKnown = index.projects.has(project.uid);
    const projectConfidence = confidenceOf(project.confidence);
    const areaAllowed = item.entity === 'task';
    const area = areaAllowed ? raw.area || {} : {};
    const areaKnown = areaAllowed && index.areas.has(area.uid);
    const areaConfidence = confidenceOf(area.confidence);
    if (projectKnown) out.confidences.project = projectConfidence;
    if (areaKnown) out.confidences.area = areaConfidence;

    if (projectKnown && projectConfidence >= t.project) {
        out.apply.project_uid = project.uid;
        return;
    }
    const projectInDoubt = projectKnown && projectConfidence >= t.ask;
    if (!projectInDoubt && areaKnown && areaConfidence >= t.project) {
        out.apply.area_uid = area.uid;
        return;
    }
    const newProject = newProjectOf(raw.new_project, index);
    const areaInDoubt = areaKnown && areaConfidence >= t.ask;
    if (!projectInDoubt && !areaInDoubt && !newProject) return;

    const candidates = [
        ...(projectInDoubt ? [project.uid] : []),
        ...(Array.isArray(project.alternatives) ? project.alternatives : []),
    ];
    const options = [...new Set(candidates)]
        .filter((uid) => index.projects.has(uid))
        .slice(0, MAX_PROJECT_OPTIONS)
        .map((uid) => ({
            uid,
            confidence: uid === project.uid ? projectConfidence : null,
        }));
    // The domain offered: the one the model named, else the best project's.
    let areaUid = null;
    if (areaAllowed) {
        areaUid = areaKnown
            ? area.uid
            : (index.projects.get(options[0]?.uid)?.area_uid ?? null);
    }
    out.ask.project = { options, area_uid: areaUid, new_project: newProject };
}

function decideTags(raw, index, t, settings, out) {
    const seen = new Set();
    const tags = (Array.isArray(raw.tags) ? raw.tags : [])
        .filter((tag) => tag && index.tags.has(tag.name))
        .filter((tag) => !seen.has(tag.name) && seen.add(tag.name))
        .map((tag) => ({
            name: tag.name,
            confidence: confidenceOf(tag.confidence),
        }))
        .sort((a, b) => b.confidence - a.confidence);
    if (tags.length > 0) {
        out.confidences.tags = Object.fromEntries(
            tags.map((tag) => [tag.name, tag.confidence])
        );
    }
    const sure = tags
        .filter((tag) => tag.confidence >= t.tags)
        .slice(0, settings.max_tags)
        .map((tag) => tag.name);
    const doubt = tags
        .filter((tag) => tag.confidence >= t.ask && tag.confidence < t.tags)
        .slice(0, Math.max(settings.max_tags - sure.length, 0))
        .map((tag) => tag.name);
    if (sure.length > 0) out.apply.tags = sure;
    if (doubt.length > 0) out.ask.tags = { options: doubt, new_tag: null };
    return newTagOf(raw.new_tag, index);
}

function decideDuration(raw, t, out) {
    const value = raw.estimated_minutes?.value;
    if (!Number.isInteger(value)) return;
    const confidence = confidenceOf(raw.estimated_minutes.confidence);
    out.confidences.estimated_minutes = confidence;
    if (value < MINUTES_MIN || value > MINUTES_MAX) return;
    if (confidence >= t.duration) out.apply.estimated_minutes = value;
}

function decidePriority(raw, t, out) {
    const value = raw.priority?.value;
    if (value !== 1 && value !== 2) return;
    const confidence = confidenceOf(raw.priority.confidence);
    out.confidences.priority = confidence;
    if (confidence >= t.priority) out.ask.priority = { value, confidence };
}

// `entry` is { item, slots } as the worker prepared it; `index` comes from
// indexCatalog. Answers { apply, ask, confidences }: `apply` holds what may
// be written now, `ask` (or null) what to put to the user.
function decide(raw, entry, index, settings) {
    const { item, slots } = entry;
    const t = settings.thresholds;
    const out = { apply: {}, ask: {}, confidences: {} };
    if (!raw || raw.uid !== item.uid) return { ...out, ask: null };

    if (slots.project) decideProject(raw, item, index, t, out);
    const newTag = slots.tags ? decideTags(raw, index, t, settings, out) : null;
    if (slots.duration) decideDuration(raw, t, out);
    if (slots.priority) decidePriority(raw, t, out);
    if (slots.summary) {
        const summary = cleanSummary(raw.summary, settings.summary_max_chars);
        if (summary) out.apply.summary = summary;
    }

    const asking = Boolean(out.ask.project || out.ask.tags || out.ask.priority);
    if (asking && newTag) {
        out.ask.tags = {
            options: out.ask.tags?.options ?? [],
            new_tag: newTag,
        };
    }
    return { ...out, ask: asking ? out.ask : null };
}

module.exports = {
    decide,
    indexCatalog,
    confidenceOf,
    MINUTES_MIN,
    MINUTES_MAX,
};
