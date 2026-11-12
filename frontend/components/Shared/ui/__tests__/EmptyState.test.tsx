import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
    it('shows the title alone', () => {
        render(<EmptyState title="Nothing here" />);
        const state = screen.getByRole('status');
        expect(state).toHaveTextContent('Nothing here');
        expect(state.querySelectorAll('p')).toHaveLength(1);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('shows the hint and the one action', () => {
        const onClick = jest.fn();
        render(
            <EmptyState
                title="No habits"
                hint="Add one to track it."
                action={<button onClick={onClick}>Add</button>}
            />
        );
        expect(screen.getByText('Add one to track it.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(onClick).toHaveBeenCalled();
    });
});
