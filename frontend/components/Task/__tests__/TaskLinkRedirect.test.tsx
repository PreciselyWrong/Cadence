import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TaskLinkRedirect from '../TaskLinkRedirect';
import { useTaskPanel } from '../../../store/taskPanelStore';

const Search: React.FC = () => {
    const location = useLocation();
    return <div>All tasks {location.search}</div>;
};

describe('TaskLinkRedirect', () => {
    it('sends a task link to all tasks with the task open in the common sheet', () => {
        render(
            <MemoryRouter initialEntries={['/task/9cjdvfzyhxq9b6v']}>
                <Routes>
                    <Route path="/task/:uid" element={<TaskLinkRedirect />} />
                    <Route path="/tasks" element={<Search />} />
                </Routes>
            </MemoryRouter>
        );

        expect(
            screen.getByText('All tasks ?task=9cjdvfzyhxq9b6v')
        ).toBeInTheDocument();
        // The old drawer is not opened on the way.
        expect(useTaskPanel.getState().uid).toBeFalsy();
    });

    it('encodes the uid in the query', () => {
        render(
            <MemoryRouter initialEntries={['/task/a%26b']}>
                <Routes>
                    <Route path="/task/:uid" element={<TaskLinkRedirect />} />
                    <Route path="/tasks" element={<Search />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('All tasks ?task=a%26b')).toBeInTheDocument();
    });
});
