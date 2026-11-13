import {
    chipToneProps,
    colorTone,
    dueTone,
    filledTone,
    priorityTone,
} from '../chipTones';

const TODAY = '2026-11-12';

describe('dueTone', () => {
    it('colours a date by when it falls', () => {
        expect(dueTone({ date: '2026-11-10', today: TODAY })).toBe('danger');
        expect(dueTone({ date: TODAY, today: TODAY })).toBe('success');
        expect(dueTone({ date: '2026-11-20', today: TODAY })).toBe('neutral');
    });

    it('colours a dateless task by its commitment', () => {
        expect(dueTone({ date: null, today: TODAY })).toBe('empty');
        expect(
            dueTone({ date: null, today: TODAY, commitment: 'replan' })
        ).toBe('danger');
        expect(
            dueTone({ date: null, today: TODAY, commitment: 'next_month' })
        ).toBe('horizon');
        // A date wins over the commitment.
        expect(
            dueTone({ date: TODAY, today: TODAY, commitment: 'replan' })
        ).toBe('success');
    });
});

describe('priorityTone', () => {
    it('gives high red, medium amber, low soft blue', () => {
        expect(priorityTone('high')).toBe('danger');
        expect(priorityTone('medium')).toBe('warning');
        expect(priorityTone('low')).toBe('low');
        expect(priorityTone(null)).toBe('empty');
    });
});

describe('colorTone / filledTone', () => {
    it('uses a palette colour when there is one, else neutral', () => {
        expect(colorTone('#15803d')).toEqual({ color: '#15803d' });
        expect(colorTone('green')).toEqual({ color: '#15803d' });
        expect(colorTone(null)).toBe('neutral');
        expect(colorTone('not a colour')).toBe('neutral');
    });

    it('is neutral when filled, empty otherwise', () => {
        expect(filledTone(true)).toBe('neutral');
        expect(filledTone(false)).toBe('empty');
    });
});

describe('chipToneProps', () => {
    it('keeps empty chips grey and filled ones marked', () => {
        expect(chipToneProps('empty').className).toContain('text-gray-500');
        expect(chipToneProps('neutral').className).toContain('text-surface-on');
        expect(chipToneProps('danger').className).toContain('danger');
        expect(chipToneProps('success').className).toContain('success');
        expect(chipToneProps('warning').className).toContain('warning');
    });

    it('tints a coloured chip from the palette in both modes', () => {
        const props = chipToneProps({ color: '#15803d' });
        expect(props.style).toEqual({
            '--accent-light': '#15803d',
            '--accent-dark': '#4ade80',
        });
        expect(props.className).toContain('var(--accent-light)');
        expect(chipToneProps('horizon').style).toEqual({
            '--accent-light': '#7e22ce',
            '--accent-dark': '#c084fc',
        });
    });
});
