import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Backlinks from '../Backlinks';
import { fetchBacklinks } from '../../../utils/contentLinksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock('../../../utils/contentLinksService', () => ({
    fetchBacklinks: jest.fn(),
}));
const mockOpenTaskPanel = jest.fn();
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: (uid: string) => mockOpenTaskPanel(uid),
}));

const fetchMock = fetchBacklinks as jest.Mock;

const renderBacklinks = () =>
    render(
        <MemoryRouter>
            <Backlinks type="note" uid="n-1" />
        </MemoryRouter>
    );

describe('Backlinks', () => {
    it('lists the linking notes and tasks with their snippet', async () => {
        fetchMock.mockResolvedValue([
            { type: 'note', uid: 'n-2', title: 'Trip', snippet: 'check list' },
            { type: 'task', uid: 't-1', title: 'Pack', snippet: '' },
        ]);
        renderBacklinks();

        expect(await screen.findByText('Backlinks (2)')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith('note', 'n-1');
        expect(screen.getByRole('link', { name: /Trip/ })).toHaveAttribute(
            'href',
            '/notes/n-2'
        );
        expect(screen.getByText('check list')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Pack/ }));
        expect(mockOpenTaskPanel).toHaveBeenCalledWith('t-1');
    });

    it('shows nothing when nothing links here', async () => {
        fetchMock.mockResolvedValue([]);
        const { container } = renderBacklinks();
        await Promise.resolve();
        expect(container).toBeEmptyDOMElement();
    });
});
