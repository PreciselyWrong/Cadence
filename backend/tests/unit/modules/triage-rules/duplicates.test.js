'use strict';

const {
    normalizeName,
    jaccard,
    findDuplicates,
    duplicateCards,
} = require('../../../../modules/triage/core/rules/duplicates');
const { settingsWith, task, input } = require('./fixtures');

const closed = (overrides = {}) => ({
    uid: 'closed-a',
    name: 'Tâche fictive',
    note: null,
    completed_at: '2026-11-02T09:00:00Z',
    parent_uid: null,
    ...overrides,
});

describe('normalizeName', () => {
    it('lowercases, drops accents and punctuation, collapses spaces', () => {
        expect(normalizeName('  Réserver  l’hôtel !  ')).toBe(
            'reserver l hotel'
        );
    });
});

describe('jaccard', () => {
    it('is shared tokens over all tokens', () => {
        expect(jaccard('a b c d', 'a b c e')).toBeCloseTo(3 / 5);
    });
});

describe('findDuplicates', () => {
    it('reports an exact name match with a closed task as probable', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({ uid: 'open-a', name: 'Payer la facture fictive' }),
                ],
                closedTasks: [
                    closed({
                        uid: 'closed-a',
                        name: 'payer la facture FICTIVE',
                    }),
                ],
            }),
            settingsWith()
        );
        expect(found).toEqual([
            {
                task_uid: 'open-a',
                closed_uid: 'closed-a',
                closed_name: 'payer la facture FICTIVE',
                closed: true,
                twin: expect.objectContaining({ uid: 'closed-a' }),
                kind: 'probable',
                similarity: 1,
            },
        ]);
    });

    it('reports a close name as possible when token similarity reaches the threshold', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({
                        uid: 'open-a',
                        name: 'Préparer le rapport trimestriel finance',
                    }),
                ],
                closedTasks: [
                    closed({ name: 'Préparer rapport trimestriel finance' }),
                ],
            }),
            settingsWith()
        );
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ kind: 'possible' });
        expect(found[0].similarity).toBeCloseTo(0.8);
    });

    it('ignores a fuzzy match below the threshold', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({ name: 'Préparer le rapport trimestriel finance' }),
                ],
                closedTasks: [
                    closed({ name: 'Préparer rapport trimestriel finance' }),
                ],
            }),
            settingsWith({ thresholds: { duplicateSimilarity: 0.9 } })
        );
        expect(found).toHaveLength(0);
    });

    it('ignores tasks closed before the lookback window', () => {
        const found = findDuplicates(
            input({
                tasks: [task({ name: 'Tâche fictive' })],
                closedTasks: [closed({ completed_at: '2026-10-20T09:00:00Z' })],
            }),
            settingsWith()
        );
        expect(found).toHaveLength(0);
    });

    it('never lets a closed subtask close its open parent', () => {
        const found = findDuplicates(
            input({
                tasks: [task({ uid: 'parent', name: 'Organiser le voyage' })],
                closedTasks: [
                    closed({
                        uid: 'child',
                        name: 'Organiser le voyage',
                        parent_uid: 'parent',
                    }),
                ],
            }),
            settingsWith()
        );
        expect(found).toHaveLength(0);
    });

    it('does not match a task against its own closed parent either', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({
                        uid: 'child',
                        name: 'Organiser le voyage',
                        parent_uid: 'parent',
                    }),
                ],
                closedTasks: [
                    closed({ uid: 'parent', name: 'Organiser le voyage' }),
                ],
            }),
            settingsWith()
        );
        expect(found).toHaveLength(0);
    });
});

describe('duplicateCards', () => {
    it('says what tells the two tasks apart, never "X is a duplicate of X"', () => {
        const [card] = duplicateCards(
            input({
                tasks: [
                    task({
                        uid: 'open-a',
                        name: 'Payer la facture',
                        project_name: 'Maison fictive',
                    }),
                ],
                closedTasks: [
                    closed({ uid: 'closed-a', name: 'Payer la facture' }),
                ],
            }),
            settingsWith()
        );
        expect(card).toMatchObject({
            key: 'duplicate:open-a:closed-a',
            type: 'duplicate',
            task_uids: ['open-a'],
            question: null,
        });
        expect(card.text).not.toContain('doublon');
        expect(card.details.join(' ')).toContain('Maison fictive');
        expect(card.details.join(' ')).toContain('2 novembre');
    });

    it('never reports a recurring task or a done occurrence of its series', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({
                        uid: 'a',
                        name: 'Sport',
                        recurring: true,
                        series_uid: 'a',
                    }),
                    task({ uid: 'b', name: 'Lire' }),
                ],
                closedTasks: [
                    closed({
                        uid: 'c',
                        name: 'Sport',
                        recurring: true,
                        series_uid: 'a',
                    }),
                    closed({
                        uid: 'd',
                        name: 'Lire',
                        recurring: true,
                        series_uid: 'd',
                    }),
                ],
            }),
            settingsWith()
        );
        expect(found).toEqual([]);
    });

    it('does not take two tasks on different days for the same one', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({ uid: 'a', name: 'Sport', due_date: '2026-11-05' }),
                    task({ uid: 'b', name: 'Sport', due_date: '2026-11-07' }),
                ],
                closedTasks: [
                    closed({ uid: 'c', name: 'Sport', due_date: '2026-11-02' }),
                ],
            }),
            settingsWith()
        );
        expect(found).toEqual([]);
    });

    it('finds two open tasks with the same name and no day between them', () => {
        const found = findDuplicates(
            input({
                tasks: [
                    task({ uid: 'a', name: 'Appeler Paul' }),
                    task({
                        uid: 'b',
                        name: 'appeler paul',
                        due_date: '2026-11-05',
                    }),
                ],
            }),
            settingsWith()
        );
        expect(
            found.map((match) => [match.task_uid, match.closed_uid])
        ).toEqual([['b', 'a']]);
    });

    it('is empty when nothing matches', () => {
        expect(
            duplicateCards(input({ tasks: [task()] }), settingsWith())
        ).toEqual([]);
    });
});
