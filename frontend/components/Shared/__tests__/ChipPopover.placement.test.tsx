import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChipPopover from '../ChipPopover';

// jsdom has no layout: give the trigger a rect and the popover a size.
const POPOVER_HEIGHT = 600;
const POPOVER_WIDTH = 320;

const rectAt = (top: number, height: number, left = 100) => ({
    top,
    bottom: top + height,
    left,
    right: left + 80,
    width: 80,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
});

const originalHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
);
const originalScrollHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
);
const originalWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetWidth'
);
const originalInnerHeight = window.innerHeight;
const originalInnerWidth = window.innerWidth;

const openAt = (rect: ReturnType<typeof rectAt>) => {
    render(
        <ChipPopover
            label="Due"
            renderTrigger={(props) => (
                <button
                    ref={props.ref}
                    type="button"
                    onClick={props.onClick}
                    aria-haspopup="dialog"
                    aria-expanded={props['aria-expanded']}
                    data-testid="chip"
                >
                    Chip
                </button>
            )}
        >
            {() => <div>Content</div>}
        </ChipPopover>
    );
    const chip = screen.getByTestId('chip');
    chip.getBoundingClientRect = () => rect as DOMRect;
    fireEvent.click(chip);
    const dialog = screen.getByRole('dialog', { name: 'Due' });
    return {
        top: parseFloat(dialog.style.top),
        left: parseFloat(dialog.style.left),
        maxHeight: parseFloat(dialog.style.maxHeight || 'NaN'),
    };
};

describe('ChipPopover placement', () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
            configurable: true,
            get: () => POPOVER_HEIGHT,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get: () => POPOVER_HEIGHT,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get: () => POPOVER_WIDTH,
        });
        window.innerHeight = 900;
        window.innerWidth = 1024;
    });

    afterEach(() => {
        const restore = (
            name: string,
            descriptor: PropertyDescriptor | undefined
        ) => {
            if (descriptor) {
                Object.defineProperty(HTMLElement.prototype, name, descriptor);
            } else {
                delete (
                    HTMLElement.prototype as unknown as Record<string, unknown>
                )[name];
            }
        };
        restore('scrollHeight', originalScrollHeight);
        restore('offsetHeight', originalHeight);
        restore('offsetWidth', originalWidth);
        window.innerHeight = originalInnerHeight;
        window.innerWidth = originalInnerWidth;
    });

    it('opens upward when the chip sits low and there is room above', () => {
        const placed = openAt(rectAt(800, 30));
        // 800 - 6 (gap) - 600 (height) = 194: fully above the chip
        expect(placed.top).toBe(194);
        expect(placed.top + POPOVER_HEIGHT).toBeLessThanOrEqual(800);
        expect(placed.top + POPOVER_HEIGHT).toBeLessThanOrEqual(
            window.innerHeight
        );
    });

    it('keeps the popover inside the viewport when neither side fits', () => {
        const placed = openAt(rectAt(500, 30));
        // Above has 500 - 14 = 486 px: placed there, capped and scrollable
        expect(placed.maxHeight).toBe(486);
        expect(placed.top).toBe(8);
        expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(500 - 6);
    });

    it('opens downward when the chip is near the top', () => {
        const placed = openAt(rectAt(40, 30));
        expect(placed.top).toBe(76);
        expect(placed.top + POPOVER_HEIGHT).toBeLessThanOrEqual(
            window.innerHeight
        );
    });

    it('shifts left to keep an 8 px margin on the right', () => {
        const placed = openAt(rectAt(40, 30, 1000));
        expect(placed.left).toBe(1024 - POPOVER_WIDTH - 8);
    });
});
