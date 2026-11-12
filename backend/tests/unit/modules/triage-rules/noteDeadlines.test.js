'use strict';

const {
    datesInNote,
    deadlineCards,
} = require('../../../../modules/daily-plan/brief/rules/noteDeadlines');
const { TODAY, task, input } = require('./fixtures');

describe('datesInNote', () => {
    it('reads a French date with no year as the next occurrence', () => {
        expect(datesInNote('Doit partir avant le 12 novembre.', TODAY)).toEqual(
            ['2026-11-12']
        );
    });

    it('reads an English date too', () => {
        expect(datesInNote('Send the file by Nov 12', TODAY)).toEqual([
            '2026-11-12',
        ]);
    });

    it('reads nothing from an empty note', () => {
        expect(datesInNote(null, TODAY)).toEqual([]);
    });
});

describe('deadlineCards', () => {
    it('proposes the note date when it is earlier than the due date', () => {
        const [card] = deadlineCards(
            input({
                tasks: [
                    task({
                        uid: 'task-a',
                        name: 'Envoyer le dossier fictif',
                        note: 'Doit partir avant le 12 novembre.',
                        due_date: '2026-11-20',
                    }),
                ],
            })
        );
        expect(card).toMatchObject({
            type: 'deadline_in_note',
            task_uids: ['task-a'],
            payload: { due_date: '2026-11-12' },
            question: null,
        });
        expect(card.text).toContain('12 novembre');
        expect(card.text).toContain('20 novembre');
    });

    it('stays silent when the note date is not earlier than the due date', () => {
        const cards = deadlineCards(
            input({
                tasks: [
                    task({
                        note: 'Avant le 12 novembre.',
                        due_date: '2026-11-10',
                    }),
                ],
            })
        );
        expect(cards).toEqual([]);
    });

    it('asks about any future date when the task has no due date', () => {
        const [card] = deadlineCards(
            input({ tasks: [task({ note: 'Rappel pour le 12 novembre.' })] })
        );
        expect(card.text).toBe(
            'La note de « Tâche fictive » cite le 12 novembre.'
        );
    });

    it('ignores a date already in the past', () => {
        expect(
            deadlineCards(
                input({ tasks: [task({ note: 'Fait le 2 octobre 2025.' })] })
            )
        ).toEqual([]);
    });
});
