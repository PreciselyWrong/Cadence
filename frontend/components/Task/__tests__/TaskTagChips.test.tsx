import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskTagChips from '../TaskRow/TaskTagChips';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, d: string, o?: { count?: number }) =>
            d.replace('{{count}}', String(o?.count ?? '')),
    }),
}));

describe('TaskTagChips', () => {
    it('shows two chips and a +N chip listing the rest', () => {
        render(
            <TaskTagChips
                tags={[
                    { name: 'a', color: '#1d4ed8' },
                    { name: 'b' },
                    { name: 'c' },
                    { name: 'd' },
                ]}
            />
        );
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.getByText('b')).toBeInTheDocument();
        expect(screen.queryByText('c')).not.toBeInTheDocument();
        expect(screen.getByText('+2')).toHaveAttribute('title', 'c, d');
    });

    it('shows the tag icon before its name', () => {
        render(<TaskTagChips tags={[{ name: 'velo', icon: 'bike' }]} />);
        expect(
            screen.getByText('velo').querySelector('svg path')
        ).toBeInTheDocument();
    });

    it('uses the palette accent when a tag has a color', () => {
        render(<TaskTagChips tags={[{ name: 'a', color: '#1d4ed8' }]} />);
        expect(screen.getByText('a').getAttribute('style')).toContain(
            '--accent-light'
        );
    });
});
