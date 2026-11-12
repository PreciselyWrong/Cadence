import React from 'react';
import { render, screen } from '@testing-library/react';
import Button, { IconButton } from '../Button';
import Segmented from '../Segmented';
import { CONTROL_HEIGHT, FIELD_CLASS } from '../controlSizes';

describe('control sizes', () => {
    it.each(['sm', 'md', 'lg'] as const)(
        'a %s button has its height',
        (size) => {
            render(<Button size={size}>Go</Button>);
            expect(screen.getByRole('button').className).toContain(
                CONTROL_HEIGHT[size]
            );
        }
    );

    it('a field is as tall as an md button', () => {
        expect(FIELD_CLASS).toContain(CONTROL_HEIGHT.md);
    });

    it('an icon button and a segmented switch match a header button', () => {
        render(
            <>
                <IconButton label="More">x</IconButton>
                <Segmented
                    options={[{ id: 'a', label: 'A' }]}
                    selected="a"
                    onSelect={() => undefined}
                />
            </>
        );
        expect(
            screen.getByRole('button', { name: 'More' }).className
        ).toContain('h-8 w-8');
        // h-7 segments in a 2px track: the track is h-8 tall.
        const track = screen.getByRole('tablist');
        expect(track.className).toContain('p-0.5');
        expect(screen.getByRole('tab').className).toContain('h-7');
    });
});
