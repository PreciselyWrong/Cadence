import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMinimalRowKeyboard } from '../useMinimalRowKeyboard';
import { useIsMinimal } from '../../../hooks/useUiDensity';

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: jest.fn(),
}));

const Demo: React.FC = () => {
    const { listRef, onListKeyDown, onListFocus } = useMinimalRowKeyboard();
    return (
        <div ref={listRef} onKeyDown={onListKeyDown} onFocus={onListFocus}>
            <div data-minimal-task-row="" tabIndex={0} data-testid="r1">
                one
                <input data-testid="field" />
            </div>
            <div data-minimal-task-row="" tabIndex={0} data-testid="r2">
                two
            </div>
            <div data-minimal-task-row="" tabIndex={0} data-testid="r3">
                three
            </div>
        </div>
    );
};

describe('useMinimalRowKeyboard in minimal mode', () => {
    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(true);
    });

    it('keeps one row in the tab order', () => {
        render(<Demo />);

        expect(screen.getByTestId('r1')).toHaveAttribute('tabindex', '0');
        expect(screen.getByTestId('r2')).toHaveAttribute('tabindex', '-1');
        expect(screen.getByTestId('r3')).toHaveAttribute('tabindex', '-1');
    });

    it('moves focus with ArrowDown and ArrowUp', () => {
        render(<Demo />);
        const r1 = screen.getByTestId('r1');
        const r2 = screen.getByTestId('r2');

        act(() => r1.focus());
        fireEvent.keyDown(r1, { key: 'ArrowDown' });
        expect(r2).toHaveFocus();
        expect(r2).toHaveAttribute('tabindex', '0');
        expect(r1).toHaveAttribute('tabindex', '-1');

        fireEvent.keyDown(r2, { key: 'ArrowUp' });
        expect(r1).toHaveFocus();
        expect(r1).toHaveAttribute('tabindex', '0');
    });

    it('stays on the first and last row at the ends of the list', () => {
        render(<Demo />);
        const r1 = screen.getByTestId('r1');
        const r3 = screen.getByTestId('r3');

        act(() => r1.focus());
        fireEvent.keyDown(r1, { key: 'ArrowUp' });
        expect(r1).toHaveFocus();

        act(() => r3.focus());
        fireEvent.keyDown(r3, { key: 'ArrowDown' });
        expect(r3).toHaveFocus();
    });

    it('remembers the row that was focused by click or Tab', () => {
        render(<Demo />);

        act(() => screen.getByTestId('r3').focus());

        expect(screen.getByTestId('r3')).toHaveAttribute('tabindex', '0');
        expect(screen.getByTestId('r1')).toHaveAttribute('tabindex', '-1');
    });

    it('ignores arrow keys typed into a field inside a row', () => {
        render(<Demo />);
        const field = screen.getByTestId('field');

        act(() => field.focus());
        fireEvent.keyDown(field, { key: 'ArrowDown' });

        expect(field).toHaveFocus();
    });
});

describe('useMinimalRowKeyboard in dense mode', () => {
    beforeEach(() => {
        (useIsMinimal as jest.Mock).mockReturnValue(false);
    });

    it('leaves focus and tab order alone', () => {
        render(<Demo />);
        const r1 = screen.getByTestId('r1');

        act(() => r1.focus());
        fireEvent.keyDown(r1, { key: 'ArrowDown' });

        expect(r1).toHaveFocus();
        expect(screen.getByTestId('r2')).toHaveAttribute('tabindex', '0');
    });
});
