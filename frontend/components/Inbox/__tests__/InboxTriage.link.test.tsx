import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InboxTriage from '../InboxTriage';
import { createTask } from '../../../utils/tasksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));

let mockItems: { uid: string; content: string }[] = [];
jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (s: unknown) => unknown) =>
        selector({ inboxStore: { inboxItems: mockItems } }),
}));

jest.mock('../../../utils/inboxService', () => ({
    analyzeInboxText: (text: string) =>
        Promise.resolve({ cleaned_content: text }),
    ensureAnalysisArea: (analysis: unknown) => Promise.resolve(analysis),
    applyAnalysisToTask: (task: unknown) => task,
    processInboxItemWithStore: jest.fn().mockResolvedValue(undefined),
    deleteInboxItemWithStore: jest.fn(),
}));

jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn().mockResolvedValue({ uid: 't1' }),
}));

const mockPreview = {
    url: 'https://example.com/rust',
    title: 'Rust patterns',
    description: null,
    image: null,
    siteName: null,
};
jest.mock('../../../utils/urlService', () => ({
    fetchUrlPreview: () => Promise.resolve(mockPreview),
    urlPreviewWithin: () => Promise.resolve(mockPreview),
}));

const renderTriage = () =>
    render(
        <InboxTriage
            projects={[]}
            onExit={jest.fn()}
            onProjectsChanged={jest.fn()}
        />
    );

describe('InboxTriage - an item with an address', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockItems = [{ uid: 'i1', content: 'https://example.com/rust' }];
    });

    it('offers no Project and suggests a task, not a link', async () => {
        renderTriage();

        expect(await screen.findByText('Rust patterns')).toBeInTheDocument();
        expect(screen.queryByTestId('triage-link')).toBeNull();
        expect(screen.queryByTestId('triage-project')).toBeNull();
        expect(screen.getByTestId('triage-task')).toHaveClass('bg-blue-600');
    });

    it('makes a task named after the page on T', async () => {
        renderTriage();
        await screen.findByText('Rust patterns');

        fireEvent.keyDown(document, { key: 't' });

        await waitFor(() =>
            expect(createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Rust patterns',
                    note: 'https://example.com/rust',
                })
            )
        );
    });
});

describe('InboxTriage - an idea', () => {
    it('offers Project, and no Links key', () => {
        jest.clearAllMocks();
        mockItems = [{ uid: 'i2', content: 'Plan the garden' }];
        renderTriage();

        expect(screen.getByTestId('triage-project')).toBeInTheDocument();
        expect(screen.queryByTestId('triage-link')).toBeNull();
        fireEvent.keyDown(document, { key: 'l' });
        expect(createTask).not.toHaveBeenCalled();
    });
});
