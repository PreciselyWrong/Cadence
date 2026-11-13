'use strict';

const {
    validateCareer,
    checkCareerDecisions,
    withDecisions,
    isComplete,
    taskFor,
} = require('../../../modules/proposals/core/career');
const { ValidationError } = require('../../../shared/errors');

const offer = (fields = {}) => ({
    id: 'o1',
    title: 'Dev back-end',
    company: 'Acme',
    url: 'https://jobs.example.com/1',
    fit: 'Node et SQL, comme ton dernier poste',
    ...fields,
});
const followup = (fields = {}) => ({
    id: 'f1',
    title: 'Candidature Beta',
    company: 'Beta',
    ...fields,
});
const task = (fields = {}) => ({ id: 't1', name: 'Envoyer le CV', ...fields });

const payload = (fields = {}) => ({
    headline: 'Point emploi',
    subtitle: 'Une offre et une relance',
    offers: [offer()],
    followups: [followup()],
    tasks: [task()],
    ...fields,
});

describe('validateCareer', () => {
    it('keeps a valid payload as it is', () => {
        const answer = validateCareer(
            payload({ stats: [{ label: 'Offres', value: '3' }] })
        );
        expect(answer).toEqual({
            headline: 'Point emploi',
            subtitle: 'Une offre et une relance',
            stats: [{ label: 'Offres', value: '3' }],
            followups: [
                {
                    id: 'f1',
                    title: 'Candidature Beta',
                    company: 'Beta',
                    applied_at: null,
                    note: null,
                    draft_url: null,
                    source_url: null,
                },
            ],
            offers: [
                {
                    id: 'o1',
                    title: 'Dev back-end',
                    company: 'Acme',
                    url: 'https://jobs.example.com/1',
                    fit: 'Node et SQL, comme ton dernier poste',
                    location: null,
                    rate: null,
                    expires: null,
                    source: null,
                },
            ],
            tasks: [
                { id: 't1', name: 'Envoyer le CV', note: null, due_date: null },
            ],
        });
    });

    it('refuses a payload without a headline or that is not an object', () => {
        expect(() => validateCareer(payload({ headline: '  ' }))).toThrow(
            ValidationError
        );
        expect(() => validateCareer(null)).toThrow(ValidationError);
        expect(() => validateCareer([])).toThrow(ValidationError);
    });

    it('refuses a payload where nothing is valid', () => {
        expect(() =>
            validateCareer({
                headline: 'Vide',
                offers: [
                    {
                        id: 'o1',
                        title: 'x',
                        company: 'y',
                        url: 'http://a.example',
                    },
                ],
                followups: [{ title: 'sans id' }],
                tasks: [],
            })
        ).toThrow('nothing valid to propose');
    });

    it('drops an offer whose url is not https, and keeps the others', () => {
        const answer = validateCareer(
            payload({
                offers: [
                    offer({ id: 'bad', url: 'http://jobs.example.com/x' }),
                    offer({ id: 'js', url: 'javascript:alert(1)' }),
                    offer({ id: 'ok' }),
                ],
            })
        );
        expect(answer.offers.map((item) => item.id)).toEqual(['ok']);
    });

    it('drops an entry with a bad id or a missing required field', () => {
        const answer = validateCareer(
            payload({
                offers: [
                    offer({ id: 'with space' }),
                    offer({ id: 'a/b' }),
                    offer({ id: 'no-fit', fit: '' }),
                    offer({ id: 'ok-1_x' }),
                ],
                tasks: [task({ id: 'x'.repeat(65) }), task({ name: '' })],
            })
        );
        expect(answer.offers.map((item) => item.id)).toEqual(['ok-1_x']);
        expect(answer.tasks).toEqual([]);
    });

    it('drops a repeated id, keeping the first', () => {
        const answer = validateCareer(
            payload({
                offers: [
                    offer({ id: 'same', title: 'Premier' }),
                    offer({ id: 'same', title: 'Second' }),
                ],
            })
        );
        expect(answer.offers.map((item) => item.title)).toEqual(['Premier']);
    });

    it('caps each list at its limit', () => {
        const answer = validateCareer(
            payload({
                offers: Array.from({ length: 20 }, (_, i) =>
                    offer({ id: `o${i}` })
                ),
                followups: Array.from({ length: 12 }, (_, i) =>
                    followup({ id: `f${i}` })
                ),
                tasks: Array.from({ length: 10 }, (_, i) =>
                    task({ id: `t${i}` })
                ),
                stats: Array.from({ length: 6 }, (_, i) => ({
                    label: `L${i}`,
                    value: `${i}`,
                })),
            })
        );
        expect(answer.offers).toHaveLength(15);
        expect(answer.followups).toHaveLength(10);
        expect(answer.tasks).toHaveLength(8);
        expect(answer.stats).toHaveLength(4);
    });

    it('truncates long texts to their limits', () => {
        const answer = validateCareer(
            payload({
                headline: 'h'.repeat(100),
                subtitle: 's'.repeat(300),
                stats: [{ label: 'l'.repeat(40), value: 'v'.repeat(40) }],
            })
        );
        expect(answer.headline).toHaveLength(60);
        expect(answer.subtitle).toHaveLength(160);
        expect(answer.stats[0]).toEqual({
            label: 'l'.repeat(20),
            value: 'v'.repeat(12),
        });
    });

    it('keeps a follow-up whose draft is not on Gmail, without the draft', () => {
        const answer = validateCareer(
            payload({
                followups: [
                    followup({
                        draft_url: 'https://evil.example.com/draft',
                        source_url: 'https://beta.example.com/job',
                        applied_at: '2026-11-02',
                        note: 'Relance après 10 jours',
                    }),
                ],
            })
        );
        expect(answer.followups[0]).toEqual(
            expect.objectContaining({
                draft_url: null,
                source_url: 'https://beta.example.com/job',
                applied_at: '2026-11-02',
                note: 'Relance après 10 jours',
            })
        );
    });

    it('accepts a Gmail draft link', () => {
        const answer = validateCareer(
            payload({
                followups: [
                    followup({
                        draft_url:
                            'https://mail.google.com/mail/u/0/#drafts/abc',
                    }),
                ],
            })
        );
        expect(answer.followups[0].draft_url).toBe(
            'https://mail.google.com/mail/u/0/#drafts/abc'
        );
    });

    it('drops an invalid date or source, not the entry', () => {
        const answer = validateCareer(
            payload({
                offers: [offer({ expires: '13/11/2026', source: 'linkedin' })],
                tasks: [task({ due_date: '2026-02-30' })],
            })
        );
        expect(answer.offers[0]).toEqual(
            expect.objectContaining({ expires: null, source: null })
        );
        expect(answer.tasks[0].due_date).toBeNull();
    });
});

describe('checkCareerDecisions', () => {
    const answer = validateCareer(payload());

    it('accepts the operations each kind allows', () => {
        expect(
            checkCareerDecisions(answer, [
                { kind: 'offer', id: 'o1', op: 'apply' },
                { kind: 'followup', id: 'f1', op: 'task', note: '  ok  ' },
                {
                    kind: 'task',
                    id: 't1',
                    op: 'create',
                    due_date: '2026-11-20',
                },
            ])
        ).toEqual([
            { kind: 'offer', id: 'o1', op: 'apply' },
            { kind: 'followup', id: 'f1', op: 'task', note: 'ok' },
            { kind: 'task', id: 't1', op: 'create', due_date: '2026-11-20' },
        ]);
    });

    it('refuses an unknown id, an operation of another kind, or a bad date', () => {
        expect(() =>
            checkCareerDecisions(answer, [
                { kind: 'offer', id: 'nope', op: 'apply' },
            ])
        ).toThrow(ValidationError);
        expect(() =>
            checkCareerDecisions(answer, [
                { kind: 'offer', id: 'o1', op: 'done' },
            ])
        ).toThrow(ValidationError);
        expect(() =>
            checkCareerDecisions(answer, [
                { kind: 'task', id: 't1', op: 'create', due_date: 'demain' },
            ])
        ).toThrow(ValidationError);
    });

    it('refuses a decisions value that is not a list', () => {
        expect(() => checkCareerDecisions(answer, undefined)).toThrow(
            ValidationError
        );
    });
});

describe('decision state', () => {
    const answer = validateCareer(payload());

    it('marks each item with its operation, or null when undecided', () => {
        const merged = withDecisions(answer, [
            { kind: 'offer', id: 'o1', op: 'skip' },
        ]);
        expect(merged.offers[0].decision).toBe('skip');
        expect(merged.followups[0].decision).toBeNull();
        expect(merged.tasks[0].decision).toBeNull();
    });

    it('is complete only when every item has a final decision', () => {
        const later = [
            { kind: 'offer', id: 'o1', op: 'later' },
            { kind: 'followup', id: 'f1', op: 'done' },
            { kind: 'task', id: 't1', op: 'skip' },
        ];
        expect(isComplete(answer, later)).toBe(false);
        expect(
            isComplete(answer, [
                { kind: 'offer', id: 'o1', op: 'apply' },
                ...later.slice(1),
            ])
        ).toBe(true);
    });
});

describe('taskFor', () => {
    const answer = validateCareer(
        payload({
            offers: [
                offer({
                    expires: '2026-12-01',
                    location: 'Lausanne',
                    rate: '90k',
                }),
                offer({ id: 'old', expires: '2026-10-01' }),
            ],
            followups: [
                followup({
                    draft_url: 'https://mail.google.com/mail/u/0/#drafts/x',
                }),
            ],
        })
    );

    it('makes an application task due at the offer expiry, with its link', () => {
        expect(
            taskFor(
                answer,
                { kind: 'offer', id: 'o1', op: 'apply' },
                '2026-11-13'
            )
        ).toEqual({
            name: 'Postuler : Dev back-end — Acme',
            note: 'Node et SQL, comme ton dernier poste\nLausanne\n90k',
            due_date: '2026-12-01',
            source_url: 'https://jobs.example.com/1',
            source: 'mcp',
        });
    });

    it('falls back to three days when the offer already expired', () => {
        expect(
            taskFor(
                answer,
                { kind: 'offer', id: 'old', op: 'apply' },
                '2026-11-13'
            ).due_date
        ).toBe('2026-11-16');
    });

    it('makes a follow-up task due today, with the draft in the note', () => {
        const task = taskFor(
            answer,
            { kind: 'followup', id: 'f1', op: 'task' },
            '2026-11-13'
        );
        expect(task.name).toBe('Relancer Beta');
        expect(task.due_date).toBe('2026-11-13');
        expect(task.note).toBe(
            'Candidature Beta\nhttps://mail.google.com/mail/u/0/#drafts/x'
        );
    });

    it('takes the decision date over the task date', () => {
        const withDate = validateCareer(
            payload({
                tasks: [
                    task({ due_date: '2026-11-30', note: 'Voir le brief' }),
                ],
            })
        );
        expect(
            taskFor(
                withDate,
                {
                    kind: 'task',
                    id: 't1',
                    op: 'create',
                    due_date: '2026-11-20',
                },
                '2026-11-13'
            )
        ).toEqual({
            name: 'Envoyer le CV',
            note: 'Voir le brief',
            due_date: '2026-11-20',
            source: 'mcp',
        });
    });
});
