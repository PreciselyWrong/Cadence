import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import NoteRow, { noteSnippet } from '../NoteRow';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
    }),
}));
jest.mock('../../Sidebar/sidebarDrop', () => ({
    useSidebarDrop: () => ({ nativeSource: () => ({}) }),
}));

describe('noteSnippet', () => {
    it('gives the first written line without Markdown marks', () => {
        expect(noteSnippet('\n# Plan\n- [ ] call')).toBe('Plan');
        expect(noteSnippet('- [x] **Buy** [milk](https://x.org)')).toBe(
            'Buy milk'
        );
        expect(noteSnippet('[[Other note]] then')).toBe('Other note then');
        expect(noteSnippet(null)).toBe('');
    });
});

describe('NoteRow', () => {
    it('shows the title, then the first line and the project, and opens the note', () => {
        render(
            <MemoryRouter>
                <NoteRow
                    note={
                        {
                            uid: 'n1',
                            title: 'Trip',
                            content: '## Packing\nsocks',
                            project: { name: 'Holidays' },
                        } as never
                    }
                />
            </MemoryRouter>
        );
        expect(screen.getByText('Trip')).toBeInTheDocument();
        expect(screen.getByText('Packing · Holidays')).toBeInTheDocument();
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            '/note/n1-trip'
        );
    });
});
