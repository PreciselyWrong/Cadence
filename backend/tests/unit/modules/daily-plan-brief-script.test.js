'use strict';

// The spoken script of the brief: French for the ear, numbers in words, a word
// budget, the pronunciation dictionary and cleaning of external text. Names
// and addresses are fictitious.
const {
    WORD_BUDGET,
    buildAudioScript,
    cleanExternal,
    spellNumber,
    speakDuration,
    speakTime,
    wordCount,
} = require('../../../modules/daily-plan/brief/script');

const SETTINGS = { voice: { dictionary: [] } };

const brief = (overrides = {}) => ({
    date: '2026-11-04',
    counters: {
        overdue: 0,
        due_today: 0,
        conflicts: 0,
        tonight_minutes: 0,
        replies: 0,
    },
    tonight: [],
    anticipate: [],
    replies: [],
    ...overrides,
});

const tasks = (entries) =>
    new Map(entries.map(([uid, name]) => [uid, { uid, name }]));

const chapterOf = (script, id) =>
    script.chapters.find((chapter) => chapter.id === id);

describe('spelling numbers for speech', () => {
    it.each([
        [0, 'zéro'],
        [1, 'un'],
        [16, 'seize'],
        [17, 'dix-sept'],
        [21, 'vingt et un'],
        [70, 'soixante-dix'],
        [71, 'soixante et onze'],
        [80, 'quatre-vingts'],
        [91, 'quatre-vingt-onze'],
        [100, 'cent'],
        [200, 'deux cents'],
        [201, 'deux cent un'],
        [579, 'cinq cent soixante-dix-neuf'],
        [999, 'neuf cent quatre-vingt-dix-neuf'],
    ])('spells %i as "%s"', (n, words) => {
        expect(spellNumber(n)).toBe(words);
    });

    it('uses the feminine form for "une" and "vingt et une"', () => {
        expect(spellNumber(1, { feminine: true })).toBe('une');
        expect(spellNumber(21, { feminine: true })).toBe('vingt et une');
    });

    it('leaves numbers above 999 as digits', () => {
        expect(spellNumber(1000)).toBe('1000');
    });
});

describe('speaking times and durations', () => {
    it('speaks clock times on the hour and the half hour', () => {
        expect(speakTime(600)).toBe('dix heures');
        expect(speakTime(630)).toBe('dix heures trente');
        expect(speakTime(60)).toBe('une heure');
    });

    it('speaks midnight and noon by name', () => {
        expect(speakTime(0)).toBe('minuit');
        expect(speakTime(720)).toBe('midi');
    });

    it('speaks minutes and hours as durations', () => {
        expect(speakDuration(40)).toBe('quarante minutes');
        expect(speakDuration(1)).toBe('une minute');
        expect(speakDuration(90)).toBe('une heure trente');
        expect(speakDuration(120)).toBe('deux heures');
    });
});

describe('buildAudioScript', () => {
    it('speaks the date and the verdict in the intro', () => {
        const script = buildAudioScript(
            brief({
                counters: {
                    overdue: 1,
                    due_today: 2,
                    conflicts: 1,
                    tonight_minutes: 45,
                },
            }),
            SETTINGS
        );
        expect(chapterOf(script, 'intro').text).toBe(
            "Nous sommes mercredi quatre novembre. Une tâche en retard, deux tâches dues aujourd'hui, un conflit d'agenda, quarante-cinq minutes à caser ce soir."
        );
    });

    it('says the first of the month as "premier"', () => {
        const script = buildAudioScript(
            brief({ date: '2026-12-01' }),
            SETTINGS
        );
        expect(chapterOf(script, 'intro').text).toMatch(
            /^Nous sommes mardi premier décembre\./
        );
    });

    it('lists the evening tasks in order, with their minutes spoken', () => {
        const script = buildAudioScript(
            brief({
                tonight: [
                    { task_uid: 'a', reason: 'x', minutes: 15 },
                    { task_uid: 'b', reason: 'y', minutes: 90 },
                ],
            }),
            SETTINGS,
            {
                tasksByUid: tasks([
                    ['a', 'Payer la facture fictive'],
                    ['b', 'Ranger le garage fictif'],
                ]),
            }
        );
        expect(chapterOf(script, 'tonight').text).toBe(
            'Ce soir, deux tâches à faire. Premièrement, Payer la facture fictive, quinze minutes. Deuxièmement, Ranger le garage fictif, une heure trente.'
        );
    });

    it('does not name a task it cannot find', () => {
        const script = buildAudioScript(
            brief({
                tonight: [{ task_uid: 'missing', reason: 'x', minutes: 5 }],
            }),
            SETTINGS
        );
        expect(chapterOf(script, 'tonight').text).toContain(
            'Premièrement, une tâche, cinq minutes.'
        );
    });

    it('reads the questions of the anticipate cards', () => {
        const script = buildAudioScript(
            brief({
                anticipate: [
                    {
                        key: 'k',
                        type: 'conflict',
                        text: 'Deux rendez-vous se chevauchent.',
                        question: {
                            key: 'q',
                            text: 'Le rendez-vous fictif doit-il être déplacé ?',
                        },
                    },
                    {
                        key: 'k2',
                        type: 'overload',
                        text: 'Journée chargée.',
                        question: null,
                    },
                ],
            }),
            SETTINGS
        );
        expect(chapterOf(script, 'anticipate').text).toBe(
            'Le rendez-vous fictif doit-il être déplacé ? Journée chargée.'
        );
    });

    it('gives the reply count and the senders, without subjects', () => {
        const script = buildAudioScript(
            brief({
                replies: [
                    {
                        from: 'Marie Dupont <marie@example.test>',
                        subject: 'Sujet secret',
                    },
                    { from: 'colleague@example.test', subject: 'Autre sujet' },
                    {
                        from: 'Marie Dupont <marie@example.test>',
                        subject: 'Encore',
                    },
                ],
            }),
            SETTINGS
        );
        const replies = chapterOf(script, 'replies').text;
        expect(replies).toBe(
            'Trois réponses en attente. De Marie Dupont et colleague.'
        );
        expect(replies).not.toContain('Sujet');
    });

    it('leaves out the empty chapters', () => {
        const script = buildAudioScript(brief(), SETTINGS);
        expect(script.chapters.map((chapter) => chapter.id)).toEqual(['intro']);
        expect(chapterOf(script, 'intro').text).toBe(
            "Nous sommes mercredi quatre novembre. Rien d'urgent aujourd'hui."
        );
    });

    it('keeps every chapter within the word budget by trimming the lists', () => {
        const long = 'Une tâche fictive avec un très long nom '
            .repeat(4)
            .trim();
        const many = Array.from({ length: 10 }, (_, i) => `t${i}`);
        const script = buildAudioScript(
            brief({
                counters: {
                    overdue: 3,
                    due_today: 4,
                    conflicts: 2,
                    tonight_minutes: 200,
                },
                tonight: many.map((uid) => ({
                    task_uid: uid,
                    reason: 'r',
                    minutes: 20,
                })),
                anticipate: Array.from({ length: 6 }, (_, i) => ({
                    key: `k${i}`,
                    type: 'overload',
                    text: long,
                    question: { key: `q${i}`, text: `${long} ?` },
                })),
                replies: Array.from({ length: 5 }, (_, i) => ({
                    from: `expediteur${i}@example.test`,
                })),
            }),
            SETTINGS,
            { tasksByUid: tasks(many.map((uid) => [uid, long])) }
        );
        expect(wordCount(script.chapters)).toBeLessThanOrEqual(WORD_BUDGET);
        expect(wordCount(script.chapters)).toBeLessThanOrEqual(230);
        expect(chapterOf(script, 'intro')).toBeDefined();
    });

    it('applies the pronunciation dictionary as whole words, case-insensitively, last', () => {
        const script = buildAudioScript(
            brief({
                tonight: [{ task_uid: 'a', reason: 'x', minutes: 10 }],
                anticipate: [
                    {
                        key: 'k',
                        type: 'overload',
                        text: 'Piperie fictive.',
                        question: null,
                    },
                ],
            }),
            { voice: { dictionary: [{ from: 'piper', to: 'pa-yé-pèr' }] } },
            { tasksByUid: tasks([['a', 'Tester PIPER fictif']]) }
        );
        expect(chapterOf(script, 'tonight').text).toContain(
            'Tester pa-yé-pèr fictif'
        );
        // "Piperie" is another word: left alone.
        expect(chapterOf(script, 'anticipate').text).toBe('Piperie fictive.');
    });

    it('strips control characters and Piper phoneme markup from external text', () => {
        const script = buildAudioScript(
            brief({
                tonight: [{ task_uid: 'a', reason: 'x', minutes: 10 }],
                replies: [{ from: '[[k a]]\u0007intrus@example.test' }],
            }),
            SETTINGS,
            {
                tasksByUid: tasks([
                    ['a', 'Tâche [[ h e l l o ]] \u0000\u001b fictive'],
                ]),
            }
        );
        const text = script.chapters.map((chapter) => chapter.text).join(' ');
        expect(text).not.toMatch(/\[\[|\]\]/);
        expect(text).not.toMatch(/[\u0000-\u001f\u007f]/);
        expect(text).toContain('Tâche h e l l o fictive');
    });

    it('returns chapters with the id, title and text of each', () => {
        const script = buildAudioScript(brief(), SETTINGS);
        expect(script).toEqual({
            chapters: [
                {
                    id: 'intro',
                    title: expect.any(String),
                    text: expect.any(String),
                },
            ],
        });
    });
});

describe('cleanExternal', () => {
    it('collapses whitespace and removes markup', () => {
        expect(cleanExternal('  a \n\t b [[c]] ')).toBe('a b c');
    });
});
