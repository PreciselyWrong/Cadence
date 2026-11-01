import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import QuickCaptureInput from '../QuickCaptureInput';
import type { Project } from '../../../entities/Project';
import { resetCaptureSettingsCache } from '../../../utils/captureSettings';
import { analyzeInboxText } from '../../../utils/inboxService';
import { createProject, fetchProjects } from '../../../utils/projectsService';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    useTranslation: () => ({
        t: (
            key: string,
            fallback?: string,
            values?: Record<string, string | number>
        ) =>
            (fallback || key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
                String(values?.[name] ?? '')
            ),
    }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));

const mockCreateTask = jest.fn();
const mockCreateArea = jest.fn();
jest.mock('../../../store/useStore', () => {
    const state = {
        tagsStore: {
            getTags: () => [
                { id: 1, name: 'urgent', usage_count: 9, color: '#ef4444' },
                {
                    id: 2,
                    name: 'perso/sport',
                    usage_count: 3,
                    color: '#10b981',
                },
                { id: 3, name: 'perso/admin', usage_count: 1 },
            ],
            setTags: jest.fn(),
            refreshTags: jest.fn().mockResolvedValue(undefined),
        },
        tasksStore: {
            createTask: (task: unknown) => mockCreateTask(task),
            deleteTask: jest.fn(),
        },
        projectsStore: { setProjects: jest.fn() },
        areasStore: {
            areas: [
                { id: 7, uid: 'work', name: 'Work', color: '#6366f1' },
                { id: 8, uid: 'home', name: 'Home Office' },
            ],
            setAreas: (areas: unknown[]) => {
                state.areasStore.areas = areas as typeof state.areasStore.areas;
            },
        },
        notesStore: { addNote: jest.fn() },
        userSettingsStore: { focus: null },
    };
    return {
        useStore: Object.assign(() => state, { getState: () => state }),
    };
});

jest.mock('../../../utils/areasService', () => ({
    createArea: (area: unknown) => mockCreateArea(area),
}));
jest.mock('../../../utils/tagsService', () => ({ createTag: jest.fn() }));
jest.mock('../../../utils/notesService', () => ({
    createNote: jest.fn(),
    deleteNote: jest.fn(),
}));
jest.mock('../../../utils/projectsService', () => ({
    createProject: jest.fn(),
    deleteProject: jest.fn(),
    fetchProjects: jest.fn(),
}));
jest.mock('../../../utils/inboxService', () => ({
    ...jest.requireActual('../../../utils/inboxService'),
    analyzeInboxText: jest.fn(),
    createInboxItemWithStore: jest.fn(),
    deleteInboxItemWithStore: jest.fn(),
}));

const analyze = (text: string) => {
    const word = (sigil: string) =>
        [...text.matchAll(new RegExp(`(?:^|\\s)\\${sigil}(\\S+)`, 'g'))].map(
            (m) => m[1]
        );
    const hasDate = /\btomorrow 3pm\b/.test(text);
    return Promise.resolve({
        parsed_tags: word('#'),
        parsed_projects: word('+'),
        parsed_due_date: hasDate ? '2026-09-26' : null,
        parsed_due_time: hasDate ? '15:00' : null,
        parsed_date_text: hasDate ? 'tomorrow 3pm' : null,
        parsed_recurrence: null,
        parsed_person: null,
        parsed_assignee: null,
        suggested_type: null,
        suggested_reason: null,
        cleaned_content: text
            .replace(/(^|\s)[#+]\S+/g, '')
            .replace(/\btomorrow 3pm\b/, '')
            .replace(/\s+/g, ' ')
            .trim(),
    });
};

const PROJECTS: Project[] = [
    { id: 1, uid: 'launch', name: 'Launch', status: 'in_progress' },
    { id: 2, uid: 'old', name: 'Old Launch', status: 'archived' },
    { id: 3, uid: 'later', name: 'Later Launch', status: 'paused' },
    { id: 4, uid: 'site', name: 'Website', status: 'in_progress' },
];

const inMenu = () => within(screen.getByTestId('slash-menu'));

describe('QuickCaptureInput live suggestions', () => {
    const input = () =>
        screen.getByTestId('quick-capture-input') as HTMLInputElement;
    const type = (value: string) =>
        fireEvent.change(input(), {
            target: { value, selectionStart: value.length },
        });
    const press = (key: string) => fireEvent.keyDown(input(), { key });
    const clickAdd = async () => {
        await act(async () => {
            fireEvent.click(screen.getByTestId('capture-add'));
        });
    };
    const addTask = async (text: string) => {
        type(text);
        await clickAdd();
    };

    beforeEach(() => {
        localStorage.clear();
        resetCaptureSettingsCache();
        Object.defineProperty(window, 'matchMedia', {
            value: undefined,
            writable: true,
            configurable: true,
        });
        let next = 0;
        mockCreateTask
            .mockReset()
            .mockImplementation(async () => ({ uid: `task-${++next}` }));
        (createProject as jest.Mock).mockReset();
        (fetchProjects as jest.Mock).mockReset().mockResolvedValue([]);
        (analyzeInboxText as jest.Mock)
            .mockReset()
            .mockImplementation((text: string) => analyze(text));
        render(
            <MemoryRouter>
                <QuickCaptureInput unified projects={PROJECTS} />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTestId('capture-target-task'));
    });

    it('lists tags as soon as "#" is typed, most used first, with paths and colours', () => {
        type('Buy shoes #');

        const rows = inMenu().getAllByRole('button');
        expect(rows.map((row) => row.textContent)).toEqual([
            'urgent',
            'perso/sport',
            'perso/admin',
        ]);
        expect(inMenu().getAllByTestId('slash-item-dot')).toHaveLength(2);
    });

    it('narrows tags by a path segment and ends the list with Create', () => {
        type('Buy shoes #');
        type('Buy shoes #spo');
        expect(
            inMenu()
                .getAllByRole('button')
                .map((row) => row.textContent)
        ).toEqual(['perso/sport', 'Create #spo']);
    });

    it('keeps a picked nested tag as a badge and saves it', async () => {
        type('Buy shoes #');
        fireEvent.click(inMenu().getByText('perso/sport'));

        expect(input().value.trim()).toBe('Buy shoes');
        expect(
            screen.getByTestId('selected-tag-perso/sport')
        ).toBeInTheDocument();
        await clickAdd();
        expect(mockCreateTask).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Buy shoes',
                tags: [expect.objectContaining({ name: 'perso/sport' })],
            })
        );
    });

    it('lists only live projects on "+" and filters them as you type', () => {
        type('Plan +');
        expect(
            inMenu()
                .getAllByRole('button')
                .map((row) => row.textContent)
        ).toEqual(['Launch', 'Website']);
        expect(inMenu().queryByText('Old Launch')).not.toBeInTheDocument();
        expect(inMenu().queryByText('Later Launch')).not.toBeInTheDocument();

        type('Plan +w');
        fireEvent.click(inMenu().getByText('Website'));
        expect(
            screen.getByTestId('selected-project-Website')
        ).toBeInTheDocument();
    });

    it('lists the three priorities on "!" and inserts the chosen one', () => {
        type('Pay rent !');
        expect(
            inMenu()
                .getAllByRole('button')
                .map((row) => row.textContent)
        ).toEqual(['High!1', 'Medium!2', 'Low!3']);

        fireEvent.click(inMenu().getByText('Medium'));
        expect(input().value).toBe('Pay rent !2 ');
        expect(screen.queryByTestId('slash-menu')).not.toBeInTheDocument();
    });

    it('closes the priority list when a priority is typed, and leaves punctuation alone', () => {
        type('Pay rent !');
        type('Pay rent !1');
        expect(screen.queryByTestId('slash-menu')).not.toBeInTheDocument();

        type('Wow!');
        expect(screen.queryByTestId('slash-menu')).not.toBeInTheDocument();
    });

    it('lists areas with their colour on "~"', () => {
        type('Plan ~');
        expect(inMenu().getByText('Work')).toBeInTheDocument();
        expect(inMenu().getAllByTestId('slash-item-dot')).toHaveLength(1);
    });

    it('picks with the arrows and Enter, with Tab, and closes on Escape', () => {
        type('Buy shoes #');
        press('ArrowDown');
        press('Enter');
        expect(
            screen.getByTestId('selected-tag-perso/sport')
        ).toBeInTheDocument();

        type('Buy shoes #');
        press('Tab');
        expect(screen.getByTestId('selected-tag-urgent')).toBeInTheDocument();

        type('Buy shoes #');
        press('Escape');
        expect(screen.queryByTestId('slash-menu')).not.toBeInTheDocument();
        expect(input().value).toBe('Buy shoes #');
    });

    it('keeps Enter for saving when "!" has no row chosen', async () => {
        type('Pay rent !');
        await act(async () => {
            press('Enter');
        });
        expect(mockCreateTask).toHaveBeenCalled();
    });

    it('highlights the date phrase the parser read', async () => {
        type('Call Sam tomorrow 3pm');
        const mark = await screen.findByTestId('capture-date-highlight');
        expect(mark).toHaveTextContent('tomorrow 3pm');
    });

    describe('adding tasks one after the other', () => {
        it('keeps the project as a badge and counts the series', async () => {
            await addTask('Draft brief +Launch #urgent !1');

            expect(input().value).toBe('');
            expect(
                screen.getByTestId('selected-project-Launch')
            ).toBeInTheDocument();
            expect(screen.getByTestId('capture-chain-count')).toHaveTextContent(
                'Added to Launch: 1'
            );
            expect(
                screen.queryByTestId('selected-tag-urgent')
            ).not.toBeInTheDocument();

            await addTask('Book venue');
            expect(mockCreateTask).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    name: 'Book venue',
                    project_uid: 'launch',
                    priority: 'low',
                    tags: [],
                })
            );
            expect(screen.getByTestId('capture-chain-count')).toHaveTextContent(
                'Added to Launch: 2'
            );
        });

        it('ends the series when the badge is removed', async () => {
            await addTask('Draft brief +Launch');
            fireEvent.click(
                within(
                    screen.getByTestId('selected-project-Launch')
                ).getByTitle(/remove/i)
            );
            await addTask('Loose task');

            expect(mockCreateTask).toHaveBeenLastCalledWith(
                expect.objectContaining({ name: 'Loose task' })
            );
            expect(mockCreateTask.mock.calls[1][0].project_uid).toBeUndefined();
            expect(
                screen.queryByTestId('capture-chain-count')
            ).not.toBeInTheDocument();
        });

        it('takes the last task off the count when it is undone', async () => {
            await addTask('One +Launch');
            await addTask('Two');
            await act(async () => {
                fireEvent.click(screen.getByTestId('capture-undo'));
            });
            expect(screen.getByTestId('capture-chain-count')).toHaveTextContent(
                'Added to Launch: 1'
            );
        });

        it('starts clean after two minutes without activity', async () => {
            jest.useFakeTimers();
            try {
                await addTask('One +Launch');
                expect(
                    screen.getByTestId('selected-project-Launch')
                ).toBeInTheDocument();

                act(() => {
                    jest.advanceTimersByTime(2 * 60 * 1000 + 10);
                });
                expect(
                    screen.queryByTestId('selected-project-Launch')
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByTestId('capture-chain-count')
                ).not.toBeInTheDocument();
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
