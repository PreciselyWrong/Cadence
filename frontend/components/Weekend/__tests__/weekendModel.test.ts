import {
    activityMetaLine,
    applyBody,
    countLine,
    decisionLabel,
    groupNearbyByDay,
    initialPicks,
    isBusySlot,
    isOpenSlot,
    nearbyMetaLine,
    safeHttpsUrl,
    togglePick,
    Translate,
} from '../weekendModel';
import type {
    WeekendAnswer,
    WeekendSlot,
} from '../../../utils/proposalsService';

const t: Translate = (_key, fallback, options) =>
    Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        fallback
    );

const activity = { title: 'Balade à Dizy' };

const answer = (slots: WeekendSlot[]): WeekendAnswer => ({
    headline: 'Un week-end doux',
    days: [],
    slots,
});

describe('weekend rules', () => {
    it('preselects the open slots the agent recommends', () => {
        const picks = initialPicks(
            answer([
                {
                    id: 's1',
                    date: '2026-11-14',
                    part: 'morning',
                    activity,
                    recommended: true,
                },
                { id: 's2', date: '2026-11-14', part: 'afternoon', activity },
                {
                    id: 's3',
                    date: '2026-11-15',
                    part: 'morning',
                    activity,
                    recommended: true,
                    decision: { op: 'skip' },
                },
                {
                    id: 's4',
                    date: '2026-11-15',
                    part: 'afternoon',
                    busy: 'Foire',
                    recommended: true,
                },
            ])
        );
        expect([...picks.entries()]).toEqual([['s1', 'calendar']]);
    });

    it('treats a busy slot as taking no decision', () => {
        const slot: WeekendSlot = {
            id: 's4',
            date: '2026-11-15',
            part: 'afternoon',
            busy: 'Foire',
        };
        expect(isBusySlot(slot)).toBe(true);
        expect(isOpenSlot(slot)).toBe(false);
    });

    it('keeps a slot open after an idea was asked', () => {
        const slot: WeekendSlot = {
            id: 's1',
            date: '2026-11-14',
            part: 'morning',
            activity,
            decision: { op: 'other' },
        };
        expect(isOpenSlot(slot)).toBe(true);
    });

    it('toggles a pick off when the same op is tapped again', () => {
        const once = togglePick(new Map(), 's1', 'skip');
        expect(once.get('s1')).toBe('skip');
        expect(togglePick(once, 's1', 'skip').has('s1')).toBe(false);
        expect(togglePick(once, 's1', 'other').get('s1')).toBe('other');
    });

    it('sends only the picked slots, in slot order, with trimmed notes', () => {
        const slots: WeekendSlot[] = [
            { id: 's1', date: '2026-11-14', part: 'morning', activity },
            { id: 's2', date: '2026-11-14', part: 'afternoon', activity },
            { id: 's3', date: '2026-11-15', part: 'morning', activity },
        ];
        const body = applyBody(
            answer(slots),
            new Map<string, 'calendar' | 'skip' | 'other'>([
                ['s3', 'other'],
                ['s1', 'calendar'],
            ]),
            new Map([['s3', '  plutôt un musée  ']])
        );
        expect(body).toEqual([
            { slot_id: 's1', op: 'calendar' },
            { slot_id: 's3', op: 'other', note: 'plutôt un musée' },
        ]);
    });

    it('counts the picks in the footer line', () => {
        expect(countLine(new Map(), t)).toBe('Rien de choisi');
        expect(
            countLine(
                new Map<string, 'calendar' | 'skip' | 'other'>([
                    ['s1', 'calendar'],
                    ['s2', 'calendar'],
                    ['s3', 'other'],
                ]),
                t
            )
        ).toBe('À l’agenda : 2 · Autre idée demandée : 1');
    });

    it('labels a final decision by its calendar state', () => {
        const base: WeekendSlot = {
            id: 's1',
            date: '2026-11-14',
            part: 'morning',
            activity,
            decision: { op: 'calendar' },
        };
        expect(decisionLabel({ ...base, event: { state: 'created' } }, t)).toBe(
            'Ajouté à l’agenda'
        );
        expect(decisionLabel({ ...base, event: { state: 'failed' } }, t)).toBe(
            'Pas ajouté'
        );
        expect(decisionLabel({ ...base, decision: { op: 'skip' } }, t)).toBe(
            'Ignorée'
        );
        expect(decisionLabel({ ...base, decision: undefined }, t)).toBeNull();
    });

    it('opens only https addresses', () => {
        expect(safeHttpsUrl('https://example.com/a')).toBe(
            'https://example.com/a'
        );
        expect(safeHttpsUrl('http://example.com/a')).toBeNull();
        expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    });

    it('formats the activity meta line from present parts only', () => {
        expect(
            activityMetaLine({
                title: 'Expo',
                place: 'La Sarraz, La Filature',
                start: '14:00',
                travel: '5 min',
            })
        ).toBe('La Sarraz, La Filature · 14:00 · 5 min');
        expect(
            activityMetaLine({
                title: 'Expo',
                travel: '20 min',
            })
        ).toBe('20 min');
    });

    it('formats the nearby meta line and groups nearby items by day in received order', () => {
        expect(
            nearbyMetaLine(
                {
                    title: 'Concert',
                    date: '2026-11-14',
                    start: '14:00',
                    place: 'La Sarraz',
                    travel: '5 min',
                },
                'fr'
            )
        ).toBe('samedi 14:00 · La Sarraz · 5 min');

        const groups = groupNearbyByDay([
            { title: 'A', date: '2026-11-14' },
            { title: 'B', date: '2026-11-15' },
            { title: 'C', date: '2026-11-14' },
        ]);
        expect(groups.map((g) => g.date)).toEqual([
            '2026-11-14',
            '2026-11-15',
        ]);
        expect(groups[0].items.map((i) => i.title)).toEqual(['A', 'C']);
        expect(groups[1].items.map((i) => i.title)).toEqual(['B']);
    });
});
