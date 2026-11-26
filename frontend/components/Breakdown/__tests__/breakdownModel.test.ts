import {
    addStep,
    canApply,
    draftsFromProposal,
    fallbackDrafts,
    MAX_STEPS,
    moveStep,
    parseMinutes,
    readySteps,
    removeStep,
    stepProblem,
    totalMinutes,
    updateStep,
} from '../breakdownModel';

const names = (steps: { name: string }[]) => steps.map((s) => s.name);

describe('breakdown step list', () => {
    it('turns the proposal into editable drafts with their own ids', () => {
        const drafts = draftsFromProposal([
            { name: 'Ouvrir le dossier', minutes: 10 },
            { name: 'Lister les pièces', minutes: 25 },
        ]);
        expect(drafts.map((d) => [d.name, d.minutes])).toEqual([
            ['Ouvrir le dossier', '10'],
            ['Lister les pièces', '25'],
        ]);
        expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
    });

    it('offers one empty step of 5 minutes when the AI gave none', () => {
        const drafts = fallbackDrafts();
        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ name: '', minutes: '5' });
    });

    it('edits, removes and moves a step by id', () => {
        const [a, b, c] = draftsFromProposal([
            { name: 'a', minutes: 5 },
            { name: 'b', minutes: 5 },
            { name: 'c', minutes: 5 },
        ]);
        let list = [a, b, c];
        list = updateStep(list, b.id, { name: 'beta' });
        expect(names(list)).toEqual(['a', 'beta', 'c']);
        list = moveStep(list, c.id, -1);
        expect(names(list)).toEqual(['a', 'c', 'beta']);
        list = moveStep(list, a.id, -1);
        expect(names(list)).toEqual(['a', 'c', 'beta']);
        list = moveStep(list, beta(list), 1);
        expect(names(list)).toEqual(['a', 'c', 'beta']);
        list = removeStep(list, c.id);
        expect(names(list)).toEqual(['a', 'beta']);
    });

    it('adds a blank step with the smallest estimate, up to the cap', () => {
        let list = addStep([]);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ name: '', minutes: '5' });
        for (let i = 0; i < MAX_STEPS + 5; i++) list = addStep(list);
        expect(list).toHaveLength(MAX_STEPS);
    });
});

function beta(list: { id: string; name: string }[]): string {
    return list.find((s) => s.name === 'beta')!.id;
}

describe('minutes', () => {
    it.each([
        ['', { ok: true, value: null }],
        ['  ', { ok: true, value: null }],
        ['5', { ok: true, value: 5 }],
        ['720', { ok: true, value: 720 }],
        ['4', { ok: false }],
        ['721', { ok: false }],
        ['7.5', { ok: false }],
        ['abc', { ok: false }],
        ['-10', { ok: false }],
    ])('parses %p', (text, expected) => {
        expect(parseMinutes(text)).toEqual(expected);
    });
});

describe('validation', () => {
    const step = (name: string, minutes: string) => ({
        id: name || 'blank',
        name,
        minutes,
    });

    it('flags a named step with bad minutes or a name that is too long', () => {
        expect(stepProblem(step('Ok', '15'))).toBeNull();
        expect(stepProblem(step('Ok', ''))).toBeNull();
        expect(stepProblem(step('Ok', '3'))).toBe('minutes');
        expect(stepProblem(step('x'.repeat(201), '10'))).toBe('name');
        expect(stepProblem(step('x'.repeat(200), '10'))).toBeNull();
    });

    it('ignores a step with no name, whatever its minutes', () => {
        expect(stepProblem(step('', '3'))).toBeNull();
        expect(readySteps([step('', '5'), step('  ', '9')])).toEqual([]);
    });

    it('sends trimmed names with integer minutes or null', () => {
        expect(
            readySteps([
                step('  Appeler  ', '10'),
                step('Écrire', ''),
                step('', '5'),
            ])
        ).toEqual([
            { name: 'Appeler', minutes: 10 },
            { name: 'Écrire', minutes: null },
        ]);
    });

    it('applies only with at least one named step and no problem', () => {
        expect(canApply([])).toBe(false);
        expect(canApply([step('', '5')])).toBe(false);
        expect(canApply([step('A', '10')])).toBe(true);
        expect(canApply([step('A', '10'), step('B', '2')])).toBe(false);
        expect(canApply([step('A', '10'), step('', '2')])).toBe(true);
    });

    it('totals the minutes of the named steps that have a valid estimate', () => {
        expect(
            totalMinutes([
                step('A', '10'),
                step('B', ''),
                step('C', '25'),
                step('', '30'),
                step('D', '2'),
            ])
        ).toBe(35);
    });
});
