import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinkSorter from '../LinkSorter';
import { processInboxItemWithStore } from '../../../utils/inboxService';

const mockSave = jest.fn();
const mockLinks = [
    {
        uid: 'l1',
        url: 'https://example.com/one',
        domain: 'example.com',
        title: 'First link',
        kind: 'article',
        source_type: 'inbox_item',
        source_uid: 'i1',
        status: 'new',
        note: null,
    },
    {
        uid: 'l2',
        url: 'https://example.com/two',
        domain: 'example.com',
        title: 'Second link',
        kind: 'article',
        source_type: 'inbox_item',
        source_uid: 'i2',
        status: 'new',
        note: null,
    },
];

jest.mock('../../../store/linksStore', () => ({
    useLinksStore: (pick: (s: unknown) => unknown) =>
        pick({ links: mockLinks, save: mockSave, load: jest.fn() }),
}));
jest.mock('../../../utils/inboxService', () => ({
    processInboxItemWithStore: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/tasksService', () => ({ createTask: jest.fn() }));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'en' },
        t: (_key: string, fallback?: string, opts?: Record<string, unknown>) =>
            (fallback ?? _key).replace(/{{(\w+)}}/g, (_m, name) =>
                String(opts?.[name] ?? '')
            ),
    }),
}));

const items = [
    { uid: 'i1', content: 'https://example.com/one' },
    { uid: 'i2', content: 'https://example.com/two' },
] as any;

const sorter = (list: unknown[]) => (
    <MemoryRouter>
        <LinkSorter items={list as any} projects={[]} onExit={jest.fn()} />
    </MemoryRouter>
);

const renderSorter = () => render(sorter(items));

describe('LinkSorter', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows one link at a time with the count left', () => {
        renderSorter();

        expect(screen.getByText('First link')).toBeInTheDocument();
        expect(screen.queryByText('Second link')).toBeNull();
        expect(screen.getByText('2 left')).toBeInTheDocument();
    });

    it('moves a skipped link to the end of the queue', () => {
        renderSorter();

        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

        expect(screen.getByText('Second link')).toBeInTheDocument();
        expect(screen.queryByText('First link')).toBeNull();
    });

    it('keeps the decided link and moves to the next one', async () => {
        const { rerender } = renderSorter();

        fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

        await waitFor(() =>
            expect(processInboxItemWithStore).toHaveBeenCalledWith('i1')
        );
        expect(mockSave).toHaveBeenCalledWith('l1', { status: 'kept' });

        // The store drops the processed item; the sorter shows what is left.
        rerender(sorter([items[1]]));
        expect(screen.getByText('Second link')).toBeInTheDocument();
        expect(screen.getByText('1 left')).toBeInTheDocument();
    });
});
