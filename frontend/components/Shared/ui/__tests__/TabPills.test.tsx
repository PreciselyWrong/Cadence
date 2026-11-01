import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TabPills from '../TabPills';

describe('TabPills', () => {
    it('shows a count only when there is something to count', () => {
        render(
            <TabPills
                aria-label="Lists"
                selected="habits"
                onSelect={jest.fn()}
                tabs={[
                    { id: 'habits', label: 'Habits', count: 3 },
                    { id: 'archived', label: 'Archived', count: 0 },
                ]}
            />
        );

        expect(screen.getByRole('tab', { name: /Habits/ })).toHaveTextContent(
            'Habits3'
        );
        expect(screen.getByRole('tab', { name: /Archived/ })).toHaveTextContent(
            /^Archived$/
        );
    });
});
