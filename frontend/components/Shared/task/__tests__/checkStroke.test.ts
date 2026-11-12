import { CHECK_STROKE, checkStrokeClass } from '../checkStroke';

describe('checkStrokeClass', () => {
    it('strokes only a high priority in red', () => {
        expect(checkStrokeClass('high')).toBe('border-danger');
        expect(checkStrokeClass(2)).toBe('border-danger');
    });

    it('keeps medium, low and unset neutral', () => {
        for (const priority of ['medium', 'low', 1, 0, null, undefined]) {
            expect(checkStrokeClass(priority as never)).toBe('border-outline');
        }
    });

    it('has no orange or blue stroke', () => {
        expect(Object.values(CHECK_STROKE).join(' ')).not.toMatch(
            /orange|blue|yellow/
        );
    });
});
