import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Menu, { ContextMenu } from '../Menu';

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

    // A long menu near the bottom: neither below nor above has room.
    it('stays inside the window and scrolls when it is taller than the room', () => {
        jest.spyOn(
            HTMLElement.prototype,
            'offsetHeight',
            'get'
        ).mockReturnValue(500);
        Object.defineProperty(window, 'innerHeight', {
            value: 600,
            configurable: true,
        });
        setup();
        const trigger = screen.getByTestId('trigger');
        jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
            top: 300,
            bottom: 330,
            left: 10,
            right: 60,
        } as DOMRect);
        fireEvent.click(trigger);
        flushFrame();
        const menu = screen.getByTestId('menu');
        expect(menu.style.top).toBe('92px');
        expect(menu.style.maxHeight).toBe('calc(100vh - 16px)');
        expect(menu).toHaveClass('overflow-y-auto');
    });

    it('opens with ArrowDown on the trigger', () => {
        setup();
        fireEvent.keyDown(screen.getByTestId('trigger'), { key: 'ArrowDown' });
        flushFrame();
        expect(screen.getByTestId('menu')).toBeInTheDocument();
    });

    it('opens a submenu with ArrowRight, runs its item and closes all', () => {
        const pick = jest.fn();
        render(
            <Menu
                testId="menu"
                entries={[
                    {
                        key: 'date',
                        label: 'Date',
                        submenu: [
                            { key: 'd1', label: 'Demain', onSelect: pick },
                        ],
                    },
                ]}
                trigger={(props) => (
                    <button {...props} data-testid="trigger">
                        Plus
                    </button>
                )}
            />
        );
        fireEvent.click(screen.getByTestId('trigger'));
        flushFrame();
        fireEvent.keyDown(screen.getByTestId('menu'), { key: 'ArrowRight' });
        flushFrame();
        const sub = screen.getByTestId('menu-date');
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Demain' })
        );
        fireEvent.keyDown(sub, { key: 'ArrowLeft' });
        expect(screen.queryByTestId('menu-date')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Date' })
        );
        fireEvent.click(screen.getByRole('menuitem', { name: 'Date' }));
        flushFrame();
        // A press inside the submenu is not outside the menu.
        fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Demain' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }));
        expect(pick).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
    });

    it('opens a context menu at a point and closes on Escape', () => {
        const onClose = jest.fn();
        render(
            <ContextMenu
                testId="ctx"
                x={40}
                y={50}
                onClose={onClose}
                entries={[{ key: 'a', label: 'Supprimer', danger: true }]}
            />
        );
        flushFrame();
        const menu = screen.getByTestId('ctx');
        expect(menu.style.top).toBe('50px');
        expect(document.activeElement).toBe(
            screen.getByRole('menuitem', { name: 'Supprimer' })
        );
        fireEvent.keyDown(menu, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
