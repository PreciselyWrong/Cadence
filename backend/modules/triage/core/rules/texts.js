'use strict';

// Every user-facing string of the triage rules, in the account's language:
// French for `fr`, English for every other language (the rules run on the
// server, where the web's 26 translations are not loaded).

const MONTHS_FR = [
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

const MONTHS_EN = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const parts = (day) => {
    const [, month, date] = day.split('-');
    return { month: Number(month) - 1, date: Number(date) };
};

// '2026-11-12' -> '12 novembre'
function formatDay(day) {
    const { month, date } = parts(day);
    return `${date} ${MONTHS_FR[month]}`;
}

// '2026-11-12' -> 'Nov 12'
function formatDayEn(day) {
    const { month, date } = parts(day);
    return `${MONTHS_EN[month]} ${date}`;
}

const fr = {
    untitled: 'Sans titre',
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

const en = {
    untitled: 'Untitled',
    card: {
        workHours: (title) => `"${title}" falls in your focus hours.`,
        workHoursQuestion: (title) =>
            `Should "${title}" stay in your focus hours?`,
        conflict: (a, b) => `"${a}" and "${b}" overlap.`,
        conflictQuestion: (a) => `Should "${a}" be moved?`,
        deadlineInNote: (title, day, due) =>
            due
                ? `The note of "${title}" mentions ${formatDayEn(day)}, before the ${formatDayEn(due)} due date.`
                : `The note of "${title}" mentions ${formatDayEn(day)}.`,
        postponed: (count) => `Pushed back ${count} times recently: drop it?`,
    },
    duplicate: {
        sameNameClosed: 'A task with the same name was just completed.',
        similarClosed: (other) => `Looks like "${other}", completed recently.`,
        openTwin: 'Another open task has the same name.',
        thisTask: (description) => `This one: ${description}`,
        otherTask: (description) => `The other: ${description}`,
        closedOn: (day) => `completed on ${formatDayEn(day)}`,
        due: (day) => `due ${formatDayEn(day)}`,
        project: (name) => `project ${name}`,
    },
};

const textsFor = (language) =>
    String(language || '').startsWith('fr') ? fr : en;

const titleOf = (name, texts) =>
    (name && String(name).trim()) || texts.untitled;

module.exports = { textsFor, titleOf };
