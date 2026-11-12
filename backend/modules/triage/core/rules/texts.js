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

// 45 -> '45 min', 120 -> '2 h', 555 -> '9 h 15', 65 -> '1 h 05'.
function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    if (total < 60) return `${total} min`;
    const rest = total % 60;
    const hours = `${Math.floor(total / 60)} h`;
    return rest === 0 ? hours : `${hours} ${String(rest).padStart(2, '0')}`;
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
        tonight: (minutes) => `${formatDuration(minutes)} de priorités`,
    },
    card: {
        workHours: (title) => `« ${title} » tombe pendant tes heures de focus.`,
        workHoursQuestion: (title) =>
            `« ${title} » doit-il rester sur tes heures de focus ?`,
        conflict: (a, b) => `« ${a} » et « ${b} » se chevauchent.`,
        conflictQuestion: (a) => `« ${a} » doit-il être déplacé ?`,
        overload: (day, planned, capacity) =>
            capacity > 0
                ? `${formatDay(day)} : ${formatDuration(planned)} de tâches pour ${formatDuration(capacity)} de libre. À alléger d’environ ${formatDuration(planned - capacity)}.`
                : `${formatDay(day)} : ${formatDuration(planned)} de tâches et aucun temps libre.`,
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
        money: 'Échéance d’argent',
        planned: 'Prévue aujourd’hui',
    },
    evening: {
        verdict: {
            done: (n) =>
                plural(
                    n,
                    '1 tâche terminée aujourd’hui',
                    `${n} tâches terminées aujourd’hui`
                ),
            tonight: (n) =>
                plural(n, '1 reste pour ce soir', `${n} restent pour ce soir`),
            slipped: (n) =>
                plural(n, '1 glisse vers demain', `${n} glissent vers demain`),
            nothing: 'Rien à reprendre ce soir.',
        },
        reason: {
            dueToday: 'Due aujourd’hui, pas dans la liste de ce soir',
            planned: 'Prévue aujourd’hui, pas dans la liste de ce soir',
            overdue: (dayMonth) => `Échue depuis le ${dayMonth}`,
        },
    },
};

module.exports = { texts, formatDay, formatDuration, titleOf };
