import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskNotePreview from '../TaskNotePreview';

// Without the Markdown renderer (it cannot load under Jest), the note still
// reads as text: never literal Markdown marks.
describe('TaskNotePreview fallback', () => {
    it('shows plain text, line by line, until the renderer loads', () => {
        render(<TaskNotePreview note={'Une note **markdown**\n- [ ] item'} />);
        const preview = screen.getByTestId('task-note-preview');
        expect(preview).toHaveTextContent('Une note markdown');
        expect(preview).toHaveTextContent('item');
        expect(preview).not.toHaveTextContent('**');
        expect(preview).not.toHaveTextContent('[ ]');
    });
});
