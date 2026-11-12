import React from 'react';
import { render } from '@testing-library/react';
import EntityMark from '../EntityMark';

describe('EntityMark', () => {
    it('draws the kind icon, tinted by the item colour', () => {
        const { container } = render(
            <EntityMark kind="area" color="#ff0000" />
        );
        const mark = container.querySelector('[data-entity-kind="area"]');
        expect(mark).toHaveStyle({ color: '#ff0000' });
        expect(mark?.querySelector('svg')).toBeInTheDocument();
    });

    it('is grey without a colour', () => {
        const { container } = render(<EntityMark kind="person" />);
        expect(
            container.querySelector('[data-entity-kind="person"]')?.className
        ).toContain('text-surface-on-variant');
    });
});
