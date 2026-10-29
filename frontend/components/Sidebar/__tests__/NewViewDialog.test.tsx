import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewViewDialog, {
    EMPTY_NEW_VIEW,
    NewViewForm,
    buildViewPayload,
} from '../NewViewDialog';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../utils/csrfService', () => ({
    getCsrfToken: jest.fn().mockResolvedValue('token'),
}));

const mockState = {
    projectsStore: {
        projects: [{ uid: 'p-launch', name: 'Launch' }],
        hasLoaded: true,
        loadProjects: jest.fn(),
    },
    tagsStore: {
        tags: [{ uid: 't-1', name: 'work' }],
        hasLoaded: true,
        loadTags: jest.fn(),
    },
};

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const form = (overrides: Partial<NewViewForm>): NewViewForm => ({
    ...EMPTY_NEW_VIEW,
    name: 'Urgent',
    ...overrides,
});

describe('buildViewPayload', () => {
    it('sends only task filters with no narrowing when every field is blank', () => {
        expect(buildViewPayload(form({}))).toEqual({
            name: 'Urgent',
            search_query: null,
            filters: ['Task'],
            priority: null,
            due: null,
            defer: null,
            tags: [],
            extras: [],
            task_status: null,
            project_uid: null,
        });
    });

    it('maps today and the next 7 days to the due values the search accepts', () => {
        expect(buildViewPayload(form({ due: 'today' })).due).toBe('today');
        expect(buildViewPayload(form({ due: 'next_7_days' })).due).toBe(
            'next_week'
        );
    });

    it('maps overdue and no due date to extras', () => {
        expect(buildViewPayload(form({ due: 'overdue' }))).toEqual(
            expect.objectContaining({ due: null, extras: ['overdue'] })
        );
        expect(buildViewPayload(form({ due: 'no_date' }))).toEqual(
            expect.objectContaining({ due: null, extras: ['no_due_date'] })
        );
    });

    it('keeps the project, tag, priority and status choices', () => {
        expect(
            buildViewPayload(
                form({
                    projectUid: 'p-launch',
                    tag: 'work',
                    priority: 'high',
                    status: 'done',
                })
            )
        ).toEqual(
            expect.objectContaining({
                project_uid: 'p-launch',
                tags: ['work'],
                priority: 'high',
                task_status: 'done',
            })
        );
    });

    it('trims the name', () => {
        expect(buildViewPayload(form({ name: '  Plans  ' })).name).toBe(
            'Plans'
        );
    });
});

describe('NewViewDialog', () => {
    beforeEach(() => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ uid: 'v-new', name: 'Urgent' }),
            })
        ) as unknown as typeof fetch;
        jest.spyOn(window, 'dispatchEvent');
    });

    it('lists the projects and tags to narrow by', () => {
        render(<NewViewDialog onClose={jest.fn()} onCreated={jest.fn()} />);

        expect(
            screen.getByRole('option', { name: 'Launch' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: 'work' })
        ).toBeInTheDocument();
    });

    it('asks for a name before saving', async () => {
        render(<NewViewDialog onClose={jest.fn()} onCreated={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Create view' }));

        expect(
            await screen.findByText('View name is required')
        ).toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('creates the view with the chosen filters and reports it', async () => {
        const onCreated = jest.fn();
        render(<NewViewDialog onClose={jest.fn()} onCreated={onCreated} />);

        fireEvent.change(screen.getByLabelText('Name'), {
            target: { value: 'Launch week' },
        });
        fireEvent.change(screen.getByLabelText('Project'), {
            target: { value: 'p-launch' },
        });
        fireEvent.change(screen.getByLabelText('Tag'), {
            target: { value: 'work' },
        });
        fireEvent.change(screen.getByLabelText('Priority'), {
            target: { value: 'high' },
        });
        fireEvent.change(screen.getByLabelText('Due'), {
            target: { value: 'overdue' },
        });
        fireEvent.change(screen.getByLabelText('Status'), {
            target: { value: 'open' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create view' }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(String(url)).toContain('views');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual(
            expect.objectContaining({
                name: 'Launch week',
                filters: ['Task'],
                project_uid: 'p-launch',
                tags: ['work'],
                priority: 'high',
                extras: ['overdue'],
                task_status: null,
            })
        );
        expect(onCreated).toHaveBeenCalledWith({
            uid: 'v-new',
            name: 'Urgent',
        });
        expect(window.dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'viewUpdated' })
        );
    });

    it('shows an error and stays open when the server refuses', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        ) as unknown as typeof fetch;
        const onCreated = jest.fn();
        render(<NewViewDialog onClose={jest.fn()} onCreated={onCreated} />);

        fireEvent.change(screen.getByLabelText('Name'), {
            target: { value: 'Broken' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create view' }));

        expect(
            await screen.findByText('Could not create the view')
        ).toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('closes on Cancel without saving', () => {
        const onClose = jest.fn();
        render(<NewViewDialog onClose={onClose} onCreated={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
