'use strict';

// The spoken script of the daily brief (docs/39-daily-brief.md, Audio). Pure:
// the same brief and settings always give the same text. It is written for
// the ear, and numbers are spelled out in French because Piper does not
// normalize digits. External text (task names, senders) is cleaned of control
// characters and of Piper phoneme markup before it is spoken.

const WORD_BUDGET = 230;
const ANTICIPATE_MAX = 4;
const TONIGHT_MAX = 10;
const REPLY_SENDERS_MAX = 3;
const MAX_SPELLED = 999;

const UNITS = [
    'zéro',
    'un',
    'deux',
    'trois',
    'quatre',
    'cinq',
    'six',
    'sept',
    'huit',
    'neuf',
    'dix',
    'onze',
    'douze',
    'treize',
    'quatorze',
    'quinze',
    'seize',
];
const TENS = {
    2: 'vingt',
    3: 'trente',
    4: 'quarante',
    5: 'cinquante',
    6: 'soixante',
};
const WEEKDAYS = [
    'dimanche',
    'lundi',
    'mardi',
    'mercredi',
    'jeudi',
    'vendredi',
    'samedi',
];
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
const ORDINALS = [
    'premièrement',
    'deuxièmement',
    'troisièmement',
    'quatrièmement',
    'cinquièmement',
    'sixièmement',
    'septièmement',
    'huitièmement',
    'neuvièmement',
    'dixièmement',
];

// 1 to 99 in French. `feminine` gives "une" and "vingt et une".
function under100(n, feminine) {
    if (n < 17) return n === 1 && feminine ? 'une' : UNITS[n];
    if (n < 20) return `dix-${UNITS[n - 10]}`;
    if (n < 70) {
        const base = TENS[Math.floor(n / 10)];
        const unit = n % 10;
        if (unit === 0) return base;
        if (unit === 1) return `${base} et ${feminine ? 'une' : 'un'}`;
        return `${base}-${UNITS[unit]}`;
    }
    if (n < 80) {
        const rest = n - 60;
        return rest === 11 ? 'soixante et onze' : `soixante-${under100(rest)}`;
    }
    if (n === 80) return 'quatre-vingts';
    return `quatre-vingt-${under100(n - 80, feminine)}`;
}

// Integers 0 to 999 in French words. Larger values are left as digits.
function spellNumber(n, { feminine = false } = {}) {
    if (!Number.isInteger(n) || n < 0 || n > MAX_SPELLED) return String(n);
    if (n < 100) return under100(n, feminine);
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const head =
        hundreds === 1
            ? 'cent'
            : `${UNITS[hundreds]} cent${rest === 0 ? 's' : ''}`;
    return rest === 0 ? head : `${head} ${under100(rest, feminine)}`;
}

function speakMinutes(n) {
    if (n === 0) return 'zéro minute';
    if (n === 1) return 'une minute';
    return `${spellNumber(n, { feminine: true })} minutes`;
}

// A duration of minutes: "quarante minutes", "une heure trente".
function speakDuration(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (total < 60) return speakMinutes(total);
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    const hourPart =
        hours === 1
            ? 'une heure'
            : `${spellNumber(hours, { feminine: true })} heures`;
    return rest === 0
        ? hourPart
        : `${hourPart} ${spellNumber(rest, { feminine: true })}`;
}

// A clock time from minutes after midnight: "dix heures trente", "midi".
function speakTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    if (m === 0) return 'minuit';
    if (m === 720) return 'midi';
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    if (hour === 0) {
        return `${spellNumber(minute, { feminine: true })} minutes après minuit`;
    }
    const hourPart = hour === 1 ? 'une heure' : `${spellNumber(hour)} heures`;
    return minute === 0
        ? hourPart
        : `${hourPart} ${spellNumber(minute, { feminine: true })}`;
}

// "2 tâches en retard": the count is spoken and the noun agrees with it.
function counted(n, singular, plural, { feminine = false } = {}) {
    return `${spellNumber(n, { feminine })} ${n === 1 ? singular : plural}`;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function joinFrench(items) {
    if (items.length <= 1) return items[0] || '';
    return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

// Control characters and Piper phoneme markup ("[[" and "]]") out of text that
// comes from the user's data, so it cannot steer the synthesis.
function cleanExternal(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/\[\[|\]\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// "Marie Dupont <marie.dupont@example.test>" -> "Marie Dupont";
// "colleague@example.test" -> "colleague".
function senderName(from) {
    const raw = cleanExternal(from)
        .replace(/<[^>]*>/g, '')
        .replace(/["']/g, '')
        .trim();
    const local = raw.includes('@') ? raw.split('@')[0] : raw;
    return local.replace(/[._-]+/g, ' ').trim() || 'un expéditeur';
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word, case-insensitive replacements, applied last.
function applyDictionary(text, dictionary) {
    return (dictionary || []).reduce((out, entry) => {
        if (!entry?.from) return out;
        const pattern = new RegExp(
            `(?<![\\p{L}\\p{N}])${escapeRegExp(entry.from)}(?![\\p{L}\\p{N}])`,
            'giu'
        );
        return out.replace(pattern, () => entry.to ?? '');
    }, text);
}

// "mercredi quatre novembre" for '2026-11-04'.
function spokenDate(day) {
    const [year, month, date] = day.split('-').map(Number);
    const weekday =
        WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
    const dayWords = date === 1 ? 'premier' : spellNumber(date);
    return `${weekday} ${dayWords} ${MONTHS[month - 1]}`;
}

function introText(brief) {
    const c = brief.counters || {};
    const facts = [];
    if (c.overdue) {
        facts.push(
            counted(c.overdue, 'tâche en retard', 'tâches en retard', {
                feminine: true,
            })
        );
    }
    if (c.due_today) {
        facts.push(
            counted(
                c.due_today,
                "tâche due aujourd'hui",
                "tâches dues aujourd'hui",
                {
                    feminine: true,
                }
            )
        );
    }
    if (c.conflicts) {
        facts.push(
            counted(c.conflicts, "conflit d'agenda", "conflits d'agenda")
        );
    }
    if (c.tonight_minutes) {
        facts.push(`${speakDuration(c.tonight_minutes)} de priorités`);
    }
    const verdict = facts.length
        ? `${capitalize(facts.join(', '))}.`
        : "Rien d'urgent aujourd'hui.";
    return `Nous sommes ${spokenDate(brief.date)}. ${verdict}`;
}

function tonightItems(brief, tasksByUid) {
    return (brief.tonight || []).slice(0, TONIGHT_MAX).map((pick, index) => {
        const task = tasksByUid?.get(pick.task_uid);
        const title = task
            ? cleanExternal(task.name) || 'Sans titre'
            : 'une tâche';
        return `${capitalize(ORDINALS[index])}, ${title}, ${speakDuration(pick.minutes)}.`;
    });
}

// An overload card's text has digits, which Piper does not read: it is spoken
// from its numbers.
function spokenOverload({ date, task_minutes: tasks, capacity_minutes: free }) {
    const load = `${speakDuration(tasks)} de tâches`;
    return free > 0
        ? `${capitalize(spokenDate(date))}, ${load} pour ${speakDuration(free)} de libre.`
        : `${capitalize(spokenDate(date))}, ${load} et aucun temps libre.`;
}

function anticipateItems(brief) {
    return (brief.anticipate || [])
        .slice(0, ANTICIPATE_MAX)
        .map((card) =>
            card.overload
                ? spokenOverload(card.overload)
                : cleanExternal(card.question?.text || card.text)
        )
        .filter(Boolean);
}

function replyNames(brief) {
    return [...new Set((brief.replies || []).map((r) => senderName(r.from)))];
}

// The chapters for the lists as they are now. Leads state the full counts,
// so trimming a list shortens the speech but not the sentence about it.
function renderChapters(brief, state) {
    const chapters = [
        { id: 'intro', title: 'Le point du jour', text: state.intro },
    ];
    const tonightTotal = (brief.tonight || []).length;
    if (tonightTotal > 0) {
        const lead = `Aujourd'hui, ${counted(
            Math.min(tonightTotal, TONIGHT_MAX),
            'tâche prioritaire',
            'tâches prioritaires',
            { feminine: true }
        )}.`;
        chapters.push({
            id: 'tonight',
            title: 'Priorités du jour',
            text: [lead, ...state.tonight].join(' '),
        });
    }
    if (state.anticipate.length > 0) {
        chapters.push({
            id: 'anticipate',
            title: 'À anticiper',
            text: state.anticipate.join(' '),
        });
    }
    const replyCount = (brief.replies || []).length;
    if (replyCount > 0) {
        const more = replyNames(brief).length > REPLY_SENDERS_MAX;
        const lead = `${capitalize(
            counted(replyCount, 'réponse en attente', 'réponses en attente', {
                feminine: true,
            })
        )}.`;
        const senders = state.senders.length
            ? ` De ${joinFrench(state.senders)}${more ? " et d'autres" : ''}.`
            : '';
        chapters.push({
            id: 'replies',
            title: 'Réponses en attente',
            text: `${lead}${senders}`,
        });
    }
    return chapters;
}

const wordCount = (chapters) =>
    chapters
        .map((chapter) => chapter.text)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;

// Drops the last item of the least important list first, until the script
// fits the word budget. Lists keep their order.
function fitBudget(brief, state) {
    let chapters = renderChapters(brief, state);
    for (;;) {
        if (wordCount(chapters) <= WORD_BUDGET) return chapters;
        const list = ['anticipate', 'senders', 'tonight']
            .map((key) => state[key])
            .find((items) => items.length > 0);
        if (!list) return chapters;
        list.pop();
        chapters = renderChapters(brief, state);
    }
}

// { chapters: [{ id, title, text }] } for `brief`. `tasksByUid` (a Map of uid
// to task with a name) gives the titles the tonight list speaks; without it
// the list says "une tâche".
function buildAudioScript(brief, settings, { tasksByUid } = {}) {
    const state = {
        intro: introText(brief),
        tonight: tonightItems(brief, tasksByUid),
        anticipate: anticipateItems(brief),
        senders: replyNames(brief).slice(0, REPLY_SENDERS_MAX),
    };
    const dictionary = settings?.voice?.dictionary ?? [];
    const chapters = fitBudget(brief, state).map((chapter) => ({
        ...chapter,
        text: applyDictionary(chapter.text, dictionary),
    }));
    return { chapters };
}

const EVENING_DONE_NAMES_MAX = 5;

// The evening review's script: intro (the counts), done, tonight, tomorrow.
// Same rules as the morning script: spelled numbers, cleaned external text,
// the dictionary last, and lists trimmed from the end to fit the budget.
function buildEveningAudioScript(evening, settings, { tasksByUid } = {}) {
    const counters = evening.counters || {};
    const tonightCount = (evening.tonight || []).length;
    const lists = {
        tonight: (evening.tonight || [])
            .slice(0, TONIGHT_MAX)
            .map((pick, index) => {
                const task = tasksByUid?.get(pick.task_uid);
                const title = task
                    ? cleanExternal(task.name) || 'Sans titre'
                    : 'une tâche';
                return `${capitalize(ORDINALS[index])}, ${title}, ${speakDuration(pick.minutes)}.`;
            }),
        doneNames: (evening.done || [])
            .slice(0, EVENING_DONE_NAMES_MAX)
            .map((uid) => {
                const task = tasksByUid?.get(uid);
                return task
                    ? cleanExternal(task.name) || 'Sans titre'
                    : 'une tâche';
            }),
    };

    const facts = [];
    if (counters.done) {
        facts.push(
            counted(counters.done, 'tâche terminée', 'tâches terminées', {
                feminine: true,
            })
        );
    }
    if (tonightCount) {
        facts.push(
            counted(
                tonightCount,
                'tâche reste pour ce soir',
                'tâches restent pour ce soir',
                {
                    feminine: true,
                }
            )
        );
    }
    if (counters.slipped) {
        facts.push(
            counted(
                counters.slipped,
                'tâche glisse à demain',
                'tâches glissent à demain',
                {
                    feminine: true,
                }
            )
        );
    }
    const intro = `Bilan du soir, ${spokenDate(evening.date)}. ${
        facts.length
            ? `${capitalize(facts.join(', '))}.`
            : 'Rien à reprendre ce soir.'
    }`;

    const render = () => {
        const chapters = [
            { id: 'intro', title: 'Le bilan du soir', text: intro },
        ];
        if (counters.done) {
            const more = counters.done > EVENING_DONE_NAMES_MAX;
            const lead = `${capitalize(
                counted(counters.done, 'tâche terminée', 'tâches terminées', {
                    feminine: true,
                })
            )} aujourd'hui.`;
            const names = lists.doneNames.length
                ? ` ${capitalize(joinFrench(lists.doneNames))}${more ? " et d'autres" : ''}.`
                : '';
            chapters.push({
                id: 'done',
                title: 'Fait aujourd’hui',
                text: `${lead}${names}`,
            });
        }
        if (tonightCount) {
            const lead = `Ce soir, ${counted(
                Math.min(tonightCount, TONIGHT_MAX),
                'tâche à faire',
                'tâches à faire',
                { feminine: true }
            )}.`;
            chapters.push({
                id: 'tonight',
                title: 'Ce soir',
                text: [lead, ...lists.tonight].join(' '),
            });
        }
        chapters.push({
            id: 'tomorrow',
            title: 'Demain',
            text: eveningTomorrowText(evening.tomorrow),
        });
        return chapters;
    };

    const fitted = fitEveningBudget(render, lists);
    const dictionary = settings?.voice?.dictionary ?? [];
    return {
        chapters: fitted.map((chapter) => ({
            ...chapter,
            text: applyDictionary(chapter.text, dictionary),
        })),
    };
}

function eveningTomorrowText(day) {
    const count = (day?.task_uids || []).length;
    const parts = [`Demain, ${spokenDate(day.date)}.`];
    parts.push(
        count
            ? `${capitalize(counted(count, 'tâche prévue', 'tâches prévues', { feminine: true }))}.`
            : "Rien de prévu pour l'instant."
    );
    const planned = day.load?.planned_minutes ?? 0;
    if (planned > 0) parts.push(`Environ ${speakDuration(planned)} prévues.`);
    if ((day.flags || []).includes('overloaded')) {
        parts.push('La journée est déjà chargée.');
    }
    return parts.join(' ');
}

function fitEveningBudget(render, lists) {
    let chapters = render();
    for (;;) {
        if (wordCount(chapters) <= WORD_BUDGET) return chapters;
        const key = ['tonight', 'doneNames'].find(
            (name) => lists[name].length > 0
        );
        if (!key) return chapters;
        lists[key].pop();
        chapters = render();
    }
}

module.exports = {
    WORD_BUDGET,
    buildAudioScript,
    buildEveningAudioScript,
    cleanExternal,
    spellNumber,
    speakDuration,
    speakTime,
    applyDictionary,
    wordCount,
};
