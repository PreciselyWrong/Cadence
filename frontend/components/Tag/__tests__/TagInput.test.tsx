import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TagInput from '../TagInput';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

const addTag = (name: string) => {
    const input = screen.getByPlaceholderText('tags.typeToAdd');
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter' });
};

describe('TagInput', () => {
    it('keeps a tag added while a save is pending when the parent re-renders with the same tags', () => {
        const onTagsChange = jest.fn();
        const props = {
            onTagsChange,
            availableTags: [],
        };
        const { rerender } = render(
            <TagInput {...props} initialTags={['perso']} />
        );

        addTag('x');
        expect(onTagsChange).toHaveBeenLastCalledWith(['perso', 'x']);

        // The parent has not saved yet, so it still passes the old tags. A
        // re-render with a fresh array must not reset the tags being edited.
        rerender(<TagInput {...props} initialTags={['perso']} />);

        addTag('y');
        expect(onTagsChange).toHaveBeenLastCalledWith(['perso', 'x', 'y']);
    });
});
