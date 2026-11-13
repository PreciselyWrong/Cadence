const {
    ACTION_PLACES,
    parseActions,
} = require('../../../../modules/plugins/core/actions');

describe('plugin page actions', () => {
    it('has no actions when the manifest declares none', () => {
        expect(parseActions(undefined, true)).toEqual({ actions: [] });
        expect(parseActions(null, true)).toEqual({ actions: [] });
    });

    it('reads a button declared for several places', () => {
        expect(
            parseActions(
                [
                    {
                        id: 'plan-week',
                        label: ' Planifier ma semaine ',
                        places: ['plan', 'today', 'plan'],
                    },
                ],
                true
            )
        ).toEqual({
            actions: [
                {
                    id: 'plan-week',
                    label: 'Planifier ma semaine',
                    places: ['plan', 'today'],
                },
            ],
        });
    });

    it('needs a page to open', () => {
        expect(
            parseActions([{ id: 'a', label: 'A', places: ['plan'] }], false)
                .error
        ).toMatch(/menu/);
    });

    it.each([
        ['not a list', { id: 'a' }, /list/],
        ['a bad id', [{ id: 'A B', label: 'A', places: ['plan'] }], /id/],
        ['no label', [{ id: 'a', places: ['plan'] }], /label/],
        [
            'a long label',
            [{ id: 'a', label: 'x'.repeat(31), places: ['plan'] }],
            /label/,
        ],
        ['no place', [{ id: 'a', label: 'A', places: [] }], /places/],
        [
            'an unknown place',
            [{ id: 'a', label: 'A', places: ['settings'] }],
            /places/,
        ],
        [
            'the same id twice',
            [
                { id: 'a', label: 'A', places: ['plan'] },
                { id: 'a', label: 'B', places: ['today'] },
            ],
            /twice/,
        ],
        [
            'too many actions',
            Array.from({ length: 11 }, (_, i) => ({
                id: `a${i}`,
                label: 'A',
                places: ['plan'],
            })),
            /10/,
        ],
    ])('refuses %s', (_name, raw, message) => {
        expect(parseActions(raw, true).error).toMatch(message);
    });

    it('lists the places Cadence draws buttons in', () => {
        expect(ACTION_PLACES).toEqual([
            'plan',
            'today',
            'inbox',
            'project',
            'triage',
        ]);
    });
});
