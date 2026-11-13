'use strict';

// Every user-facing string of the triage rules, in French (the default UI
// language). Kept in one map so they can be translated later without
// touching the rules.

const MONTHS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
];

// '2026-11-12' -> '12 novembre'
function formatDay(day) {
    const [, month, date] = day.split('-');
    return `${Number(date)} ${MONTHS[Number(month) - 1]}`;
}

const titleOf = (name) => (name && String(name).trim()) || 'Sans titre';

const texts = {
    card: {
        workHours: (title) => `« ${title} » tombe pendant tes heures de focus.`,
        workHoursQuestion: (title) =>
            `« ${title} » doit-il rester sur tes heures de focus ?`,
        conflict: (a, b) => `« ${a} » et « ${b} » se chevauchent.`,
        conflictQuestion: (a) => `« ${a} » doit-il être déplacé ?`,
        deadlineInNote: (title, day, due) =>
            due
                ? `La note de « ${title} » cite le ${formatDay(day)}, avant l’échéance du ${formatDay(due)}.`
                : `La note de « ${title} » cite le ${formatDay(day)}.`,
        postponed: (count) =>
            `Reportée ${count} fois récemment : l’abandonner ?`,
    },
    duplicate: {
        sameNameClosed: 'Une tâche du même nom vient d’être terminée.',
        similarClosed: (other) =>
            `Ressemble à « ${other} », terminée récemment.`,
        openTwin: 'Une autre tâche ouverte porte le même nom.',
        thisTask: (description) => `Celle-ci : ${description}`,
        otherTask: (description) => `L’autre : ${description}`,
        closedOn: (day) => `terminée le ${formatDay(day)}`,
        due: (day) => `échéance le ${formatDay(day)}`,
        project: (name) => `projet ${name}`,
    },
};

module.exports = { texts, formatDay, titleOf };
