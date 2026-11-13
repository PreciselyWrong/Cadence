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
const PROJECTS = [
    { id: 1, name: 'Travail', color: '#2563eb' },
    { id: 'home', name: 'Maison' },
];
const TAGS = ['urgent', 'client'];

const Harness: React.FC<{
    onChange?: (next: PlanViewOptions) => void;
    initial?: PlanViewOptions;
}> = ({ onChange, initial = DEFAULT_VIEW_OPTIONS }) => {
    const [options, setOptions] = useState(initial);
    return (
        <>
            <ViewMenu
                options={options}
                projects={PROJECTS}
                tags={TAGS}
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
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Show calendar' })
        );

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

    it('toggles project chips and records their string ids', () => {
        render(<Harness />);
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Travail' }));
        fireEvent.click(screen.getByRole('button', { name: 'Maison' }));
        expect(state().filters.projectIds).toEqual(['1', 'home']);

        fireEvent.click(screen.getByRole('button', { name: 'Travail' }));
        expect(state().filters.projectIds).toEqual(['home']);
        expect(screen.getByRole('button', { name: 'Maison' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
    });

    it('toggles tag and priority chips', () => {
        render(<Harness />);
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: '#urgent' }));
        fireEvent.click(screen.getByRole('button', { name: 'High' }));
        fireEvent.click(screen.getByRole('button', { name: 'Low' }));

        expect(state().filters).toEqual({
            projectIds: [],
            tagNames: ['urgent'],
            priorities: ['high', 'low'],
        });
    });

    it('shows the number of active filters on the trigger', () => {
        render(<Harness />);
        expect(screen.queryByText('0')).not.toBeInTheDocument();
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Travail' }));
        fireEvent.click(screen.getByRole('button', { name: '#client' }));

        expect(
            screen.getByRole('button', { name: 'Display' })
        ).toHaveTextContent('2');
    });

    it('clears every filter with Clear filters and keeps the other choices', () => {
        render(
            <Harness
                initial={{
                    ...DEFAULT_VIEW_OPTIONS,
                    groupBy: 'tag',
                    filters: {
                        projectIds: ['1'],
                        tagNames: ['urgent'],
                        priorities: ['medium'],
                    },
                }}
            />
        );
        openMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

        expect(state()).toEqual({
            ...DEFAULT_VIEW_OPTIONS,
            groupBy: 'tag',
        });
        expect(
            screen.getByRole('button', { name: 'Clear filters' })
        ).toBeDisabled();
    });

    it('hides the project and tag rows when none are offered', () => {
        render(
            <ViewMenu options={DEFAULT_VIEW_OPTIONS} onChange={jest.fn()} />
        );
        openMenu();

        expect(
            screen.queryByRole('group', { name: 'Projects' })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'Tags' })
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('group', { name: 'Priority' })
        ).toBeInTheDocument();
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
