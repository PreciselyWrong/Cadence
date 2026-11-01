import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteEditorView from '../NoteEditorView';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) =>
            ({
                'projects.addProject': 'Ajouter un projet',
                'project.addTags': 'Ajouter des étiquettes',
            })[key] ??
            fallback ??
            key,
    }),
}));
jest.mock('../MarkdownEditor', () => ({
    __esModule: true,
    default: () => <div />,
}));
jest.mock('../NoteBackgroundPicker', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../Tag/TagInput', () => ({
    __esModule: true,
    default: () => null,
}));

describe('NoteEditorView without project or tags', () => {
    it('offers to add them in the user language', () => {
        render(
            <NoteEditorView
                note={{ uid: 'n1', title: 'Idea', content: '' } as any}
                saveStatus="saved"
                onChange={jest.fn()}
                onLookChange={jest.fn()}
                onSaveNow={jest.fn()}
                onTogglePin={jest.fn()}
                onDelete={jest.fn()}
                onShare={jest.fn()}
                onOpenFocusMode={jest.fn()}
            />
        );
        expect(screen.getByText('Ajouter un projet')).toBeInTheDocument();
        expect(screen.getByText('Ajouter des étiquettes')).toBeInTheDocument();
        expect(screen.queryByText(/Add (project|tags)/)).toBeNull();
    });
});
