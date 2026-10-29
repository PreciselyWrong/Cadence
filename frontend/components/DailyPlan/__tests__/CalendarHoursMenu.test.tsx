import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarHoursMenu from '../CalendarHoursMenu';
import { WHOLE_DAY, VisibleHours } from '../../Calendar/visibleHours';

const Harness: React.FC = () => {
    const [value, setValue] = useState<VisibleHours>(WHOLE_DAY);
    return <CalendarHoursMenu value={value} onChange={setValue} />;
};

describe('CalendarHoursMenu', () => {
    it('closes the visible hours menu on Escape and returns focus to its trigger', () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', {
            name: 'More calendar options',
        });

        fireEvent.click(trigger);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveFocus();
    });

    it('ignores other keys while open', () => {
        render(<Harness />);
        fireEvent.click(
            screen.getByRole('button', { name: 'More calendar options' })
        );
        fireEvent.keyDown(document, { key: 'Enter' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
