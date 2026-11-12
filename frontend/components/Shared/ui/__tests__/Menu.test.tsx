import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Menu from '../Menu';

const flushFrame = () =>
    act(() => {
        jest.runOnlyPendingTimers();
    });

describe('Menu', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (cb) => setTimeout(() => cb(0), 0) as unknown as number
        );
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const setup = (onSelect = jest.fn()) => {
        render(
            <Menu
                testId="menu"
                entries={[
                    { key: 'a', label: 'Demain', onSelect },
                    'separator',
                    { key: 'b', label: 'Semaine prochaine' },
                    {
                        key: 'c',
                        label: 'Supprimer',
                        danger: true,
                        disabled: true,
                    },
                ]}
                trigger={(props) => (
                    <button {...props} data-testid="trigger">
                        Plus
                    </button>
                )}
            />
        );
        return onSelect;
    };

    it('opens on click and focuses the first item', () => {
        setup();
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        expect(screen.getByTestId('menu')).toBeInTheDocument();
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Demain' })
        );
        expect(screen.getByTestId('trigger')).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });

    it('moves with the arrow keys and skips disabled items', () => {
        setup();
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        const menu = screen.getByTestId('menu');
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Semaine prochaine' })
        );
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Demain' })
        );
        fireEvent.keyDown(menu, { key: 'End' });
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Semaine prochaine' })
        );
    });

    it('closes on Escape and gives focus back to the trigger', () => {
        setup();
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        fireEvent.keyDown(screen.getByTestId('menu'), { key: 'Escape' });
        expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByTestId('trigger'));
    });

    it('runs the item and closes', () => {
        const onSelect = setup();
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
    });

    it('closes on a click outside', () => {
        setup();
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        fireEvent.pointerDown(document.body);
        expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
    });

    it('opens with ArrowDown on the trigger', () => {
        setup();
        fireEvent.keyDown(screen.getByTestId('trigger'), { key: 'ArrowDown' });
        flushFrame();
        expect(screen.getByTestId('menu')).toBeInTheDocument();
    });
});
