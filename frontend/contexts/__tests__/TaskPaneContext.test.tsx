import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskPaneProvider, useTaskPane } from '../TaskPaneContext';

let api: ReturnType<typeof useTaskPane>;

const Probe = () => {
    api = useTaskPane();
    const location = useLocation();
    return <div data-testid="search">{location.search}</div>;
};

const renderAt = (path = '/today') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <TaskPaneProvider>
                <Probe />
            </TaskPaneProvider>
        </MemoryRouter>
    );

const search = () => screen.getByTestId('search').textContent ?? '';
const params = () => new URLSearchParams(search());

describe('TaskPaneContext planned day', () => {
    it('sets the planned day and start with the task', () => {
        renderAt();
        act(() =>
            api.openTask('uid-1', { date: '2026-11-12', startMinute: 600 })
        );
        expect(params().get('task')).toBe('uid-1');
        expect(params().get('on')).toBe('2026-11-12');
        expect(params().get('at')).toBe('600');
    });

    it('sets only the day when the planned item has no start', () => {
        renderAt();
        act(() => api.openTask('uid-1', { date: '2026-11-12' }));
        expect(params().get('on')).toBe('2026-11-12');
        expect(params().has('at')).toBe(false);
    });

    it('drops the planned day when a different task is opened without one', () => {
        renderAt();
        act(() =>
            api.openTask('uid-1', { date: '2026-11-12', startMinute: 600 })
        );
        act(() => api.openTask('uid-2'));
        expect(params().get('task')).toBe('uid-2');
        expect(params().has('on')).toBe(false);
        expect(params().has('at')).toBe(false);
    });

    it('replaces the planned day when another task is opened with one', () => {
        renderAt();
        act(() =>
            api.openTask('uid-1', { date: '2026-11-12', startMinute: 600 })
        );
        act(() => api.openTask('uid-2', { date: '2026-11-13' }));
        expect(params().get('task')).toBe('uid-2');
        expect(params().get('on')).toBe('2026-11-13');
        expect(params().has('at')).toBe(false);
    });

    it('drops the planned day on close and keeps unrelated params', () => {
        renderAt('/today?classic=1');
        act(() =>
            api.openTask('uid-1', { date: '2026-11-12', startMinute: 600 })
        );
        act(() => api.closeTask());
        expect(params().has('task')).toBe(false);
        expect(params().has('on')).toBe(false);
        expect(params().has('at')).toBe(false);
        expect(params().get('classic')).toBe('1');
    });
});
