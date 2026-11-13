'use strict';

const {
    validateWeekend,
    checkWeekendDecisions,
    recordDecisions,
    carryDecisions,
    withSlotDecisions,
    isComplete,
    checkEventReport,
    reportEvent,
} = require('../../../modules/proposals/core/weekend');
const { ValidationError, ConflictError } = require('../../../shared/errors');

const day = (fields = {}) => ({
    date: '2026-11-14',
    weather: 'sun',
    min: 4,
    max: 11,
    ...fields,
});

const slot = (fields = {}) => ({
    id: 'sat-am',
    date: '2026-11-14',
    part: 'morning',
    weather: 'sun',
    temp: 9,
    activity: { title: 'Marché de Morges', url: 'https://example.com/marche' },
    ...fields,
});

const payload = (fields = {}) => ({
    headline: 'Week-end au soleil',
    subtitle: 'Samedi dégagé, dimanche pluvieux',
    days: [day(), day({ date: '2026-11-15', weather: 'rain', min: 3, max: 6 })],
    slots: [slot()],
    ...fields,
});

const answerOf = (fields = {}) => validateWeekend(payload(fields));

describe('validateWeekend', () => {
    it('keeps a valid payload with its days, slots and places', () => {
        const answer = validateWeekend(
            payload({
                elsewhere: [
                    {
                        place: 'Pontarlier',
                        date: '2026-11-14',
                        weather: 'sun',
                        temp: 10,
                        travel: '1 h',
                    },
                ],
            })
        );
        expect(answer.headline).toBe('Week-end au soleil');
        expect(answer.days).toHaveLength(2);
        expect(answer.slots[0]).toEqual({
            id: 'sat-am',
            date: '2026-11-14',
            part: 'morning',
            weather: 'sun',
            temp: 9,
            feels: null,
            busy: null,
            after: null,
            recommended: false,
            activity: {
                title: 'Marché de Morges',
                url: 'https://example.com/marche',
                note: null,
                travel: null,
                start: null,
                end: null,
                after: null,
            },
        });
        expect(answer.elsewhere).toEqual([
            {
                place: 'Pontarlier',
                date: '2026-11-14',
                weather: 'sun',
                temp: 10,
                travel: '1 h',
            },
        ]);
    });

    it('refuses a missing headline', () => {
        expect(() => validateWeekend(payload({ headline: '  ' }))).toThrow(
            new ValidationError('headline is required')
        );
    });

    it('cuts the headline to 60 characters', () => {
        const answer = answerOf({ headline: 'h'.repeat(80) });
        expect(answer.headline).toHaveLength(60);
    });

    it('refuses a payload without a valid slot', () => {
        expect(() =>
            validateWeekend(
                payload({
                    slots: [{ id: 'x', date: '2026-11-20', part: 'morning' }],
                })
            )
        ).toThrow(new ValidationError('no slot'));
    });

    it('drops a slot with a bad id, a date outside the days or a bad part', () => {
        const answer = answerOf({
            slots: [
                slot({ id: 'bad id!' }),
                slot({ id: 'wrong-day', date: '2026-11-20' }),
                slot({ id: 'bad-part', part: 'evening' }),
                slot({ id: 'sun-pm', date: '2026-11-15', part: 'afternoon' }),
            ],
        });
        expect(answer.slots.map((item) => item.id)).toEqual(['sun-pm']);
    });

    it('drops a repeated slot id after the first', () => {
        const answer = answerOf({
            slots: [slot(), slot({ activity: { title: 'Autre' } })],
        });
        expect(answer.slots).toHaveLength(1);
        expect(answer.slots[0].activity.title).toBe('Marché de Morges');
    });

    it('drops a non-https url and keeps the rest of the activity', () => {
        const answer = answerOf({
            slots: [
                slot({
                    activity: { title: 'Musée', url: 'http://musee.example' },
                }),
            ],
        });
        expect(answer.slots[0].activity).toEqual(
            expect.objectContaining({ title: 'Musée', url: null })
        );
    });

    it('drops an activity without a title', () => {
        const answer = answerOf({
            slots: [slot({ activity: { note: 'pas de titre' } })],
        });
        expect(answer.slots[0].activity).toBeNull();
    });

    it('keeps start and end only in HH:MM form', () => {
        const answer = answerOf({
            slots: [
                slot({
                    activity: { title: 'Balade', start: '09:30', end: '25:00' },
                }),
            ],
        });
        expect(answer.slots[0].activity).toEqual(
            expect.objectContaining({ start: '09:30', end: null })
        );
    });

    it('keeps a follow-up line on the slot itself, busy or not', () => {
        const answer = answerOf({
            slots: [
                slot({
                    id: 'sat-pm',
                    part: 'afternoon',
                    busy: 'Foire',
                    after: 'Ensuite : balade à Dizy',
                }),
                slot({
                    id: 'sun-am',
                    date: '2026-11-15',
                    after: 'n'.repeat(300),
                }),
            ],
        });
        expect(answer.slots[0].after).toBe('Ensuite : balade à Dizy');
        expect(answer.slots[1].after).toHaveLength(120);
    });

    it('takes a busy slot without activity or decision', () => {
        const answer = answerOf({
            slots: [
                slot({
                    busy: 'Foire aux livres, Penthalaz',
                    recommended: true,
                }),
            ],
        });
        expect(answer.slots[0].busy).toBe('Foire aux livres, Penthalaz');
        expect(answer.slots[0].activity).toBeNull();
        expect(answer.slots[0].recommended).toBe(false);
    });

    it('caps the days at 2, the slots at 6 and the places at 5', () => {
        const answer = answerOf({
            days: [
                day(),
                day({ date: '2026-11-15' }),
                day({ date: '2026-11-16' }),
            ],
            slots: [...[1, 2, 3, 4, 5, 6, 7].map((n) => slot({ id: `s${n}` }))],
            elsewhere: [1, 2, 3, 4, 5, 6].map((n) => ({
                place: `Lieu ${n}`,
                date: '2026-11-14',
                weather: 'sun',
                temp: 10,
            })),
        });
        expect(answer.days).toHaveLength(2);
        expect(answer.slots).toHaveLength(6);
        expect(answer.elsewhere).toHaveLength(5);
    });
});

describe('checkWeekendDecisions', () => {
    const answer = answerOf({
        slots: [
            slot(),
            slot({ id: 'sun-pm', date: '2026-11-15', part: 'afternoon' }),
            slot({
                id: 'busy',
                date: '2026-11-15',
                part: 'morning',
                busy: 'Concert',
                activity: undefined,
            }),
        ],
    });

    it('accepts calendar, skip and other on slots with an activity', () => {
        const checked = checkWeekendDecisions(answer, [
            { slot_id: 'sat-am', op: 'calendar' },
            { slot_id: 'sun-pm', op: 'other', note: 'Plutôt à l’intérieur' },
        ]);
        expect(checked).toEqual([
            { slot_id: 'sat-am', op: 'calendar' },
            { slot_id: 'sun-pm', op: 'other', note: 'Plutôt à l’intérieur' },
        ]);
    });

    it('cuts a decision note to 500 characters', () => {
        const [checked] = checkWeekendDecisions(answer, [
            { slot_id: 'sat-am', op: 'skip', note: 'n'.repeat(900) },
        ]);
        expect(checked.note).toHaveLength(500);
    });

    it('refuses a list that is not a list', () => {
        expect(() => checkWeekendDecisions(answer, {})).toThrow(
            new ValidationError('decisions must be a list')
        );
    });

    it('refuses an unknown slot', () => {
        expect(() =>
            checkWeekendDecisions(answer, [{ slot_id: 'nope', op: 'skip' }])
        ).toThrow(ValidationError);
    });

    it('refuses a busy slot, which has no decision', () => {
        expect(() =>
            checkWeekendDecisions(answer, [{ slot_id: 'busy', op: 'skip' }])
        ).toThrow(ValidationError);
    });

    it('refuses an operation that is not known', () => {
        expect(() =>
            checkWeekendDecisions(answer, [{ slot_id: 'sat-am', op: 'done' }])
        ).toThrow(ValidationError);
    });

    it('refuses the whole call for a slot already decided', () => {
        const previous = [{ slot_id: 'sat-am', op: 'calendar' }];
        expect(() =>
            checkWeekendDecisions(
                answer,
                [
                    { slot_id: 'sun-pm', op: 'skip' },
                    { slot_id: 'sat-am', op: 'skip' },
                ],
                previous
            )
        ).toThrow('already_decided');
    });

    it('lets an open other request be decided later', () => {
        const previous = [{ slot_id: 'sat-am', op: 'other' }];
        expect(
            checkWeekendDecisions(
                answer,
                [{ slot_id: 'sat-am', op: 'calendar' }],
                previous
            )
        ).toEqual([{ slot_id: 'sat-am', op: 'calendar' }]);
    });

    it('refuses the same slot twice in one call', () => {
        expect(() =>
            checkWeekendDecisions(answer, [
                { slot_id: 'sat-am', op: 'skip' },
                { slot_id: 'sat-am', op: 'calendar' },
            ])
        ).toThrow(ValidationError);
    });
});

describe('recordDecisions', () => {
    it('records a calendar decision with its event requested', () => {
        const decisions = recordDecisions(
            [],
            [{ slot_id: 'sat-am', op: 'calendar' }]
        );
        expect(decisions).toEqual([
            {
                slot_id: 'sat-am',
                op: 'calendar',
                event: { state: 'requested' },
            },
        ]);
    });

    it('records a skip without an event and keeps the other decisions', () => {
        const previous = [{ slot_id: 'sun-pm', op: 'other' }];
        const decisions = recordDecisions(previous, [
            { slot_id: 'sat-am', op: 'skip' },
        ]);
        expect(decisions).toEqual([
            { slot_id: 'sun-pm', op: 'other' },
            { slot_id: 'sat-am', op: 'skip' },
        ]);
    });

    it('replaces an open other request by the decision that follows it', () => {
        const previous = [{ slot_id: 'sat-am', op: 'other', note: 'Autre' }];
        const decisions = recordDecisions(previous, [
            { slot_id: 'sat-am', op: 'skip' },
        ]);
        expect(decisions).toEqual([{ slot_id: 'sat-am', op: 'skip' }]);
    });
});

describe('carryDecisions', () => {
    const answer = answerOf({
        slots: [
            slot(),
            slot({ id: 'sun-pm', date: '2026-11-15', part: 'afternoon' }),
            slot({
                id: 'busy',
                date: '2026-11-15',
                part: 'morning',
                busy: 'Concert',
            }),
        ],
    });

    it('carries final decisions to the slots of the same id', () => {
        const previous = [
            {
                slot_id: 'sat-am',
                op: 'calendar',
                event: {
                    state: 'created',
                    link: 'https://www.google.com/calendar/event?eid=1',
                },
            },
            { slot_id: 'sun-pm', op: 'skip' },
        ];
        expect(carryDecisions(previous, answer)).toEqual(previous);
    });

    it('drops the decisions of slots the new answer no longer has or leaves busy', () => {
        const previous = [
            { slot_id: 'gone', op: 'skip' },
            { slot_id: 'busy', op: 'skip' },
        ];
        expect(carryDecisions(previous, answer)).toEqual([]);
    });

    it('does not carry an open other request: the new answer is its answer', () => {
        expect(
            carryDecisions([{ slot_id: 'sat-am', op: 'other' }], answer)
        ).toEqual([]);
    });
});

describe('isComplete', () => {
    const answer = answerOf({
        slots: [
            slot(),
            slot({ id: 'sun-pm', date: '2026-11-15', part: 'afternoon' }),
            slot({
                id: 'busy',
                date: '2026-11-15',
                part: 'morning',
                busy: 'Concert',
            }),
        ],
    });

    it('is false while a slot with an activity has no final decision', () => {
        expect(
            isComplete(answer, [{ slot_id: 'sat-am', op: 'calendar' }])
        ).toBe(false);
    });

    it('does not count an open other request as final', () => {
        expect(
            isComplete(answer, [
                { slot_id: 'sat-am', op: 'calendar' },
                { slot_id: 'sun-pm', op: 'other' },
            ])
        ).toBe(false);
    });

    it('is true once every slot with an activity is final, busy slots aside', () => {
        expect(
            isComplete(answer, [
                { slot_id: 'sat-am', op: 'calendar' },
                { slot_id: 'sun-pm', op: 'skip' },
            ])
        ).toBe(true);
    });
});

describe('withSlotDecisions', () => {
    it('shows the decision and the event on each slot', () => {
        const answer = answerOf({
            slots: [
                slot(),
                slot({ id: 'sun-pm', date: '2026-11-15', part: 'afternoon' }),
            ],
        });
        const shown = withSlotDecisions(answer, [
            {
                slot_id: 'sat-am',
                op: 'calendar',
                event: { state: 'requested' },
            },
        ]);
        expect(shown.slots[0]).toEqual(
            expect.objectContaining({
                decision: 'calendar',
                event: { state: 'requested' },
            })
        );
        expect(shown.slots[1]).toEqual(
            expect.objectContaining({ decision: null, event: null })
        );
    });
});

describe('checkEventReport', () => {
    it('keeps a Google Calendar https link on a created event', () => {
        expect(
            checkEventReport({
                slot_id: 'sat-am',
                state: 'created',
                link: 'https://www.google.com/calendar/event?eid=abc',
            })
        ).toEqual({
            slot_id: 'sat-am',
            state: 'created',
            link: 'https://www.google.com/calendar/event?eid=abc',
            error: null,
        });
    });

    it('drops a link that is not https or not Google Calendar', () => {
        const report = checkEventReport({
            slot_id: 'sat-am',
            state: 'created',
            link: 'https://evil.example.com/x',
        });
        expect(report.link).toBeNull();
    });

    it('refuses a state other than created or failed', () => {
        expect(() =>
            checkEventReport({ slot_id: 'sat-am', state: 'requested' })
        ).toThrow(ValidationError);
    });
});

describe('reportEvent', () => {
    const decisions = [
        { slot_id: 'sat-am', op: 'calendar', event: { state: 'requested' } },
        { slot_id: 'sun-pm', op: 'skip' },
    ];

    it('sets the event of a requested calendar decision', () => {
        const next = reportEvent(decisions, {
            slot_id: 'sat-am',
            state: 'created',
            link: 'https://calendar.google.com/calendar/event?eid=1',
            error: null,
        });
        expect(next[0].event).toEqual({
            state: 'created',
            link: 'https://calendar.google.com/calendar/event?eid=1',
        });
        expect(next[1]).toBe(decisions[1]);
    });

    it('keeps the error of a failed event', () => {
        const next = reportEvent(decisions, {
            slot_id: 'sat-am',
            state: 'failed',
            error: 'Calendrier absent',
        });
        expect(next[0].event).toEqual({
            state: 'failed',
            error: 'Calendrier absent',
        });
    });

    it('refuses a slot without a calendar decision', () => {
        expect(() =>
            reportEvent(decisions, { slot_id: 'sun-pm', state: 'created' })
        ).toThrow(ValidationError);
    });

    it('refuses a second report, created or failed, as a conflict', () => {
        const settled = [
            { slot_id: 'sat-am', op: 'calendar', event: { state: 'created' } },
        ];
        expect(() =>
            reportEvent(settled, {
                slot_id: 'sat-am',
                state: 'failed',
                error: 'x',
            })
        ).toThrow(ConflictError);
    });
});
