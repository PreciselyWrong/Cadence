import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import IconPicker from '../IconPicker';
import EntityIcon from '../EntityIcon';
import { ENTITY_ICONS } from '../../../constants/entityIcons';

let mockLanguage = 'fr';
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
        i18n: { language: mockLanguage },
    }),
}));

describe('EntityIcon', () => {
    it('draws the glyph of a known icon id', () => {
        const { container } = render(<EntityIcon icon="home" />);
        const path = container.querySelector('svg path');
        expect(path).toHaveAttribute(
            'd',
            ENTITY_ICONS.find((icon) => icon.id === 'home')!.path
        );
    });

    it('renders the fallback for no icon or an unknown id', () => {
        const { rerender } = render(
            <EntityIcon icon={null} fallback={<span>fallback</span>} />
        );
        expect(screen.getByText('fallback')).toBeInTheDocument();
        rerender(
            <EntityIcon icon="not-an-icon" fallback={<span>fallback</span>} />
        );
        expect(screen.getByText('fallback')).toBeInTheDocument();
    });
});

describe('IconPicker', () => {
    beforeEach(() => {
        mockLanguage = 'fr';
    });

    it('lists every shared icon plus a no-icon choice', () => {
        render(<IconPicker value={null} onChange={jest.fn()} />);
        expect(screen.getAllByRole('radio')).toHaveLength(
            ENTITY_ICONS.length + 1
        );
        expect(screen.getByRole('radio', { name: 'No icon' })).toBeChecked();
    });

    it('filters by label or search term in either language', () => {
        render(<IconPicker value={null} onChange={jest.fn()} />);
        const search = screen.getByRole('searchbox');
        fireEvent.change(search, { target: { value: 'vélo' } });
        expect(screen.getByRole('radio', { name: 'Vélo' })).toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: 'Maison' })).toBeNull();

        fireEvent.change(search, { target: { value: 'groceries shopping' } });
        expect(screen.queryAllByRole('radio')).toHaveLength(1);

        fireEvent.change(search, { target: { value: 'shopping' } });
        expect(
            screen.getByRole('radio', { name: 'Courses' })
        ).toBeInTheDocument();
    });

    it('names icons in the interface language', () => {
        mockLanguage = 'en';
        render(<IconPicker value="home" onChange={jest.fn()} />);
        expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked();
    });

    it('reports the picked id, and null for no icon', () => {
        const onChange = jest.fn();
        render(<IconPicker value="home" onChange={onChange} />);
        fireEvent.click(screen.getByRole('radio', { name: 'Vélo' }));
        expect(onChange).toHaveBeenLastCalledWith('bike');
        fireEvent.click(screen.getByRole('radio', { name: 'No icon' }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });
});
