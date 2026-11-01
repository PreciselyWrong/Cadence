import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskTagChips from '../TaskRow/TaskTagChips';
import { useStore } from '../../../store/useStore';
import { derivedTagColor } from '../../../utils/tagColor';

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

    it('gives an uncolored tag the color derived from its name', () => {
        render(<TaskTagChips tags={[{ name: 'travail' }]} />);
        expect(screen.getByText('travail').getAttribute('style')).toContain(
            derivedTagColor('travail').value
        );
    });

    it('lets a sub-tag take its parent color from the store', () => {
        useStore.setState((state) => ({
            tagsStore: {
                ...state.tagsStore,
                tags: [
                    { name: 'perso', color: '#dc2626' },
                    { name: 'perso/sport' },
                ],
            },
        }));
        render(<TaskTagChips tags={[{ name: 'perso/sport' }]} />);
        expect(screen.getByText('perso/sport').getAttribute('style')).toContain(
            '#dc2626'
        );
        useStore.setState((state) => ({
            tagsStore: { ...state.tagsStore, tags: [] },
        }));
    });
});
