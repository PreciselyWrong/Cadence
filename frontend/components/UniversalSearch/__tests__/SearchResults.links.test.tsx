import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SearchResults from '../SearchResults';
import { searchUniversal } from '../../../utils/searchService';

jest.mock('../../../utils/searchService', () => ({
    searchUniversal: jest.fn(),
}));
jest.mock('../../../utils/focus', () => ({
    focusKey: () => 'none',
    focusScopeParams: () => undefined,
    useFocus: () => null,
}));
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

const mocked = searchUniversal as jest.Mock;
const mockNavigate = jest.fn();

const renderResults = (selectedFilters: string[] = []) =>
    render(
        <MemoryRouter>
            <SearchResults
                navRef={{ current: null }}
                onCounts={jest.fn()}
                searchQuery="gate"
                selectedFilters={selectedFilters}
                selectedPriority={null}
                selectedStatus={null}
                selectedDue={null}
                selectedDefer={null}
                selectedTags={[]}
                selectedExtras={[]}
                onClose={jest.fn()}
            />
        </MemoryRouter>
    );

describe('universal search with links', () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    beforeEach(() => {
        mocked.mockResolvedValue({
            results: [
                {
                    type: 'Link',
                    id: 7,
                    uid: 'l7',
                    name: 'Impeccable',
                    title: 'Impeccable',
                    project_uid: 'p9',
                    project_name: 'Design',
                    description: '',
                },
            ],
        });
        jest.spyOn(window, 'open').mockImplementation(() => null);
        mockNavigate.mockClear();
    });

    afterEach(() => jest.restoreAllMocks());

    it('searches links when no filter is chosen', async () => {
        renderResults();

        expect(await screen.findByText('Impeccable')).toBeInTheDocument();
        expect(mocked).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.arrayContaining(['Link', 'Task', 'Note']),
            })
        );
    });

    it('opens a link result in the project holding its page', async () => {
        renderResults(['Link']);
        fireEvent.click(await screen.findByText('Impeccable'));

        await waitFor(() =>
            expect(mockNavigate).toHaveBeenCalledWith('/project/p9')
        );
        expect(window.open).not.toHaveBeenCalled();
    });
});
