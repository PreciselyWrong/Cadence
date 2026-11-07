import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InboxTriage from '../InboxTriage';
import { keepInLinks } from '../../../utils/linkTriage';
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

jest.mock('../../../utils/linkTriage', () => ({
    ...jest.requireActual('../../../utils/linkTriage'),
    keepInLinks: jest.fn().mockResolvedValue({ uid: 'l1' }),
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

    it('offers Links (L) instead of Project, and suggests it', async () => {
        renderTriage();

        expect(await screen.findByText('Rust patterns')).toBeInTheDocument();
        expect(screen.getByTestId('triage-link')).toHaveTextContent('L');
        expect(screen.queryByTestId('triage-project')).toBeNull();
        expect(screen.getByTestId('triage-later')).toHaveTextContent('S');
        expect(screen.getByTestId('triage-link')).toHaveClass('bg-blue-600');
    });

    it('keeps it in Links with the page title on L', async () => {
        renderTriage();
        await screen.findByText('Rust patterns');

        fireEvent.keyDown(document, { key: 'l' });

        await waitFor(() =>
            expect(keepInLinks).toHaveBeenCalledWith('i1', {
                url: 'https://example.com/rust',
                title: 'Rust patterns',
            })
        );
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
    it('offers Project, not Links, and L does nothing', () => {
        mockItems = [{ uid: 'i2', content: 'Plan the garden' }];
        renderTriage();

        expect(screen.getByTestId('triage-project')).toBeInTheDocument();
        expect(screen.queryByTestId('triage-link')).toBeNull();
        fireEvent.keyDown(document, { key: 'l' });
        expect(keepInLinks).not.toHaveBeenCalled();
    });
});
