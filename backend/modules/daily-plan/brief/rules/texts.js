'use strict';

// Every user-facing string of the brief rules, in French (the default UI
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

const plural = (n, one, many) => (n === 1 ? one : many);

// '2026-11-12' -> '12 novembre'
function formatDay(day) {
    const [, month, date] = day.split('-');
    return `${Number(date)} ${MONTHS[Number(month) - 1]}`;
}

const titleOf = (name) => (name && String(name).trim()) || 'Sans titre';

const texts = {
    formatDay,
    titleOf,
    nothingUrgent: 'Rien d’urgent aujourd’hui.',
    verdict: {
        overdue: (n) => plural(n, '1 tâche en retard', `${n} tâches en retard`),
        dueToday: (n) =>
            plural(
                n,
                '1 tâche due aujourd’hui',
                `${n} tâches dues aujourd’hui`
            ),
        conflicts: (n) =>
            plural(n, '1 conflit d’agenda', `${n} conflits d’agenda`),
        replies: (n) =>
            plural(n, '1 réponse en attente', `${n} réponses en attente`),
        tonight: (minutes) => `${minutes} min à caser ce soir`,
    },
    card: {
        workHours: (title) => `« ${title} » tombe pendant tes heures de focus.`,
        workHoursQuestion: (title) =>
            `« ${title} » doit-il rester sur tes heures de focus ?`,
        conflict: (a, b) => `« ${a} » et « ${b} » se chevauchent.`,
        conflictQuestion: (a) => `« ${a} » doit-il être déplacé ?`,
        overload: (day, planned, capacity) =>
            `${formatDay(day)} : ${planned} min prévues, ${capacity} min disponibles le soir.`,
        deadlineInNote: (title, day, due) =>
            due
                ? `La note de « ${title} » cite le ${formatDay(day)}, avant l’échéance du ${formatDay(due)}.`
                : `La note de « ${title} » cite le ${formatDay(day)}.`,
        deadlineQuestion: (title, day) =>
            `Le ${formatDay(day)} est-il l’échéance de « ${title} » ?`,
        duplicate: (title, closed) =>
            `« ${title} » ressemble à « ${closed} », terminée récemment.`,
        duplicateQuestion: (title, closed) =>
            `« ${title} » est-elle un doublon de « ${closed} » ?`,
        postponed: (title, count) =>
            `« ${title} » a été reportée ${count} fois récemment.`,
        postponedQuestion: (title) =>
            `Faire, abandonner ou reporter « ${title} » ?`,
    },
    move: {
        overdue: (day) => `En retard depuis le ${formatDay(day)}.`,
        overloaded: (day) => `${formatDay(day)} est surchargé.`,
    },
    tonight: {
        overdue: 'En retard',
        dueToday: 'Due aujourd’hui',
        dueTomorrow: 'Due demain',
        blocking: (n) =>
            plural(n, 'Bloque 1 autre tâche', `Bloque ${n} autres tâches`),
        money: (day) => `Échéance d’argent le ${formatDay(day)}`,
        planned: 'Prévue aujourd’hui',
        project: (name) => `Fait avancer « ${name} »`,
    },
};

module.exports = { texts, formatDay, titleOf };
