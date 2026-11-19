'use strict';

// The user's context in the facts: goals, areas and active projects. Computed
// here, capped, so the agent can justify its choices without reading the whole
// account.
const { cleanText } = require('./text');

const GOALS_MAX = 8;
const AREAS_MAX = 10;
const PROJECTS_MAX = 15;
const ABOUT_MAX = 160;

const byDueThenTitle = (a, b) => {
    if (a.due !== b.due) {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
    }
    return a.title.localeCompare(b.title);
};

// `goals`: [{ uid, title, status, due?, percent? }], `areas`: [name],
// `projects`: [{ name, area?, description?, open_tasks?, due? }] (already
// limited to the active ones).
function contextFacts({ goals = [], areas = [], projects = [] } = {}) {
    const goalFacts = goals
        .filter((goal) => goal.status === 'active')
        .map((goal) => ({
            uid: goal.uid,
            title: cleanText(goal.title, 200),
            due: goal.due ?? null,
            percent: Number.isFinite(goal.percent) ? goal.percent : null,
        }))
        .sort(byDueThenTitle)
        .slice(0, GOALS_MAX)
        .map(({ uid, title, due, percent }) => ({
            uid,
            title,
            ...(due ? { due } : {}),
            ...(percent !== null ? { progress: percent } : {}),
        }));
    const areaNames = [
        ...new Set(areas.map((name) => cleanText(name, 100)).filter(Boolean)),
    ].slice(0, AREAS_MAX);
    // What a project is about (its description, short) and how much is left,
    // so the agent can weigh a task by its project.
    const projectFacts = projects.slice(0, PROJECTS_MAX).map((project) => {
        const area = cleanText(project.area, 100);
        const about = cleanText(project.description, ABOUT_MAX);
        return {
            name: cleanText(project.name, 200),
            ...(area ? { area } : {}),
            ...(about ? { about } : {}),
            ...(project.open_tasks > 0
                ? { open_tasks: project.open_tasks }
                : {}),
            ...(project.due ? { due: project.due } : {}),
        };
    });
    return {
        goals: goalFacts,
        areas: areaNames,
        projects: projectFacts,
    };
}

module.exports = {
    contextFacts,
    GOALS_MAX,
    AREAS_MAX,
    PROJECTS_MAX,
};
