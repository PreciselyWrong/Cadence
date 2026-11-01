import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Tooltip from '../Tooltip';

describe('Tooltip', () => {
    it('renders when its content arrives after a first render without it', () => {
        const { rerender } = render(
            <Tooltip content="">
                <span>Target</span>
            </Tooltip>
        );

        rerender(
            <Tooltip content="Tip">
                <span>Target</span>
            </Tooltip>
        );

        expect(screen.getByText('Target')).toBeInTheDocument();
        expect(screen.getByText('Tip')).toBeInTheDocument();
    });
});
