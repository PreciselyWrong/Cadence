import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ViewMenu from '../ViewMenu';
import { DEFAULT_VIEW_OPTIONS, PlanViewOptions } from '../viewOptions';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
        i18n: { language: 'en' },
    }),
}));

// Holds the options like the page does, so each change is visible at once.
const Harness: React.FC<{ onChange?: (next: PlanViewOptions) => void }> = ({
    onChange,
}) => {
    const [options, setOptions] = useState(DEFAULT_VIEW_OPTIONS);
    return (
        <>
            <ViewMenu
                options={options}
                onChange={(next) => {
                    onChange?.(next);
                    setOptions(next);
                }}
            />
            <output data-testid="state">{JSON.stringify(options)}</output>
        </>
    );
};

const state = (): PlanViewOptions =>
    JSON.parse(screen.getByTestId('state').textContent ?? '{}');

const openMenu = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Display' }));

describe('ViewMenu', () => {
    it('opens the display panel from its trigger', () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Display' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        openMenu();

        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(
            screen.getByRole('dialog', { name: 'Display' })
        ).toBeInTheDocument();
    });

    it('changes the grouping through the group select', () => {
        const onChange = jest.fn();
        render(<Harness onChange={onChange} />);
        openMenu();

        fireEvent.change(screen.getByLabelText('Group by'), {
            target: { value: 'tag' },
        });

        expect(onChange).toHaveBeenLastCalledWith({
            ...DEFAULT_VIEW_OPTIONS,
            groupBy: 'tag',
        });
        expect(state().groupBy).toBe('tag');
    });

    it('switches the layout with the segmented control', () => {
        render(<Harness />);
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Horizons' }));

        expect(state().mode).toBe('horizons');
        expect(
            screen.getByRole('button', { name: 'Horizons' })
        ).toHaveAttribute('aria-pressed', 'true');
    });

    it('disables Horizons when it is not available', () => {
        render(
            <ViewMenu
                options={DEFAULT_VIEW_OPTIONS}
                onChange={jest.fn()}
                horizonsAvailable={false}
            />
        );
        openMenu();

        expect(screen.getByRole('button', { name: 'Horizons' })).toBeDisabled();
    });

    it('toggles completed tasks', () => {
        render(<Harness />);
        openMenu();
        const completed = screen.getByRole('checkbox', {
            name: 'Completed tasks',
        });
        expect(completed).toBeChecked();

        fireEvent.click(completed);

        expect(state().showCompleted).toBe(false);
        expect(
            screen.getByRole('checkbox', { name: 'Completed tasks' })
        ).not.toBeChecked();
    });

    it('sets the calendar span and disables it while the calendar is hidden', () => {
        render(<Harness />);
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: '7' }));
        expect(state().calendarSpan).toBe(7);

        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Show calendar' })
        );
        expect(screen.getByRole('button', { name: '3' })).toBeDisabled();
    });

    it('restores the default options with Reset', () => {
        render(<Harness />);
        openMenu();
        fireEvent.change(screen.getByLabelText('Sort by'), {
            target: { value: 'name' },
        });
        fireEvent.click(screen.getByRole('checkbox', { name: 'Inbox column' }));

        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

        expect(state()).toEqual(DEFAULT_VIEW_OPTIONS);
        expect(screen.getByLabelText('Sort by')).toHaveValue('plan');
    });

    it('closes on Escape and returns focus to the trigger', () => {
        render(<Harness />);
        openMenu();
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Display' })).toHaveFocus();
    });

    it('closes on a click outside', () => {
        render(
            <>
                <p>outside</p>
                <Harness />
            </>
        );
        openMenu();

        fireEvent.mouseDown(screen.getByText('outside'));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
