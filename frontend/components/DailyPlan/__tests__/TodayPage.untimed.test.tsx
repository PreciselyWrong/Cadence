import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayPage from '../TodayPage';
import {
    fetchDailyPlan,
    fetchPlanCandidates,
    saveDailyPlanItems,
} from '../../../utils/dailyPlanService';
import {
    fetchCalendarEvents,
    fetchCalendarFeeds,
} from '../../../utils/calendarFeedsService';
import { fetchCalendarTasks, updateTask } from '../../../utils/tasksService';

// The page's DndContext is wrapped so a test can deliver the drag-end event
// dnd-kit sends after a pointer drag (jsdom has no layout to drag across).
const mockDnd: { onDragEnd?: (event: any) => void } = {};
jest.mock('../../Shared/MarkdownRenderer', () => ({
    __esModule: true,
    default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('@dnd-kit/core', () => {
    const React = jest.requireActual('react');
    const actual = jest.requireActual('@dnd-kit/core');
    return {
        ...actual,
        DndContext: (props: any) => {
            mockDnd.onDragEnd = props.onDragEnd;
            return React.createElement(actual.DndContext, props);
        },
    };
});

jest.mock('react-i18next', () => {
    const t = (
        _key: string,
        fallback: string | Record<string, unknown>,
        values?: Record<string, unknown>
    ) => {
        const options = typeof fallback === 'object' ? fallback : values;
        const text =
            typeof fallback === 'string'
                ? fallback
                : String(fallback?.defaultValue ?? _key);
        return text.replace(/{{(\w+)}}/g, (_m, name) =>
            String(options?.[name] ?? '')
        );
    };
    const i18n = { language: 'en' };
    return { useTranslation: () => ({ t, i18n }) };
});

let mockSearch = '';
const mockSetSearchParams = jest.fn((next: Record<string, string>) => {
    mockSearch = next.date ? `?date=${next.date}` : '';
});
jest.mock('react-router-dom', () => ({
    Link: ({ children, to, ...rest }: any) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
    useLocation: () => ({ pathname: '/today' }),
    useSearchParams: () => [
        new URLSearchParams(mockSearch),
        mockSetSearchParams,
    ],
}));

jest.mock('../../../store/useStore', () => ({
    useStore: (selector: any) =>
        selector({
            userSettingsStore: {
                aiAssistantEnabled: false,
                calendarEnabled: true,
            },
        }),
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));

jest.mock('../../../utils/dateUtils', () => ({
    getUserTimezone: () => 'UTC',
}));

jest.mock('../../../utils/tasksService', () => ({
    toggleTaskCompletion: jest.fn(),
    updateTask: jest.fn().mockResolvedValue({}),
    fetchCalendarTasks: jest.fn(),
}));

jest.mock('../../../utils/dailyPlanService', () => ({
    ...jest.requireActual('../../../utils/dailyPlanService'),
    fetchDailyPlan: jest.fn(),
    fetchPlanCandidates: jest.fn(),
    saveDailyPlanItems: jest.fn(),
    startDailyPlan: jest.fn(),
}));

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarFeeds: jest.fn(),
    fetchCalendarEvents: jest.fn(),
}));

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(
    new Date()
);

const candidates = {
    in_progress: [],
    overdue: [],
    due_today: [],
    suggested: [],
    inbox: [],
    inbox_count: 0,
};

const planItem = (uid: string, startMinute: number | null) => ({
    task_uid: uid,
    position: 0,
    start_minute: startMinute,
    duration_minutes: 30,
    task: { uid, name: `Task ${uid}`, status: 0, due_date: TODAY },
});

// The drag-end dnd-kit reports for a tray item dropped on another item.
const dropItemOn = (item: ReturnType<typeof planItem>, overUid: string) =>
    act(() => {
        mockDnd.onDragEnd?.({
            active: {
                id: `item:${item.task_uid}`,
                data: { current: { type: 'item', item } },
            },
            over: { id: `item:${overUid}` },
            delta: { x: 0, y: 0 },
            activatorEvent: null,
        });
    });

// Task uids in the order of the last plan save.
const lastSavedOrder = () => {
    const calls = (saveDailyPlanItems as jest.Mock).mock.calls;
    return calls[calls.length - 1][1].map(
        (item: { task_uid: string }) => item.task_uid
    );
};

describe('TodayPage untimed tasks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockSearch = '';
        (fetchPlanCandidates as jest.Mock).mockResolvedValue(candidates);
        (fetchCalendarTasks as jest.Mock).mockResolvedValue([]);
        (fetchCalendarFeeds as jest.Mock).mockResolvedValue([]);
        (fetchCalendarEvents as jest.Mock).mockResolvedValue({
            date: TODAY,
            events: [],
            errors: [],
        });
        (saveDailyPlanItems as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: null,
        });
    });

    it('reorders the untimed tasks by drag and saves the new order', async () => {
        const items = [
            planItem('a', null),
            planItem('b', null),
            planItem('c', null),
        ];
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: { uid: 'p', date: TODAY, started_at: null, items },
        });
        render(<TodayPage />);
        // Tray rows are sortable drop targets, not only draggables.
        expect(await screen.findByText('Task c')).toHaveAttribute(
            'aria-roledescription',
            'sortable'
        );

        dropItemOn(items[2], 'a');

        await waitFor(() => expect(saveDailyPlanItems).toHaveBeenCalled());
        expect(lastSavedOrder()).toEqual(['c', 'a', 'b']);
    });

    it('keeps timed tasks in their slots when untimed ones are reordered', async () => {
        const items = [
            planItem('a', null),
            planItem('t', 600),
            planItem('b', null),
        ];
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: { uid: 'p', date: TODAY, started_at: null, items },
        });
        render(<TodayPage />);
        await screen.findByText('Task b');

        dropItemOn(items[2], 'a');

        await waitFor(() => expect(saveDailyPlanItems).toHaveBeenCalled());
        expect(lastSavedOrder()).toEqual(['b', 't', 'a']);
    });

    it('moves a candidate dropped on a sidebar project, without planning it', async () => {
        const task = { uid: 'c1', name: 'Call bank', status: 0 };
        (fetchPlanCandidates as jest.Mock).mockResolvedValue({
            ...candidates,
            due_today: [task],
        });
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: TODAY,
            plan: { uid: 'p', date: TODAY, started_at: null, items: [] },
        });
        render(<TodayPage />);
        await screen.findByText('Call bank');
        const project = document.createElement('div');
        project.setAttribute('data-sidebar-drop', 'project:p9');
        document.body.appendChild(project);
        // jsdom has no hit testing: the pointer is over the project.
        (document as any).elementFromPoint = jest.fn(() => project);

        act(() => {
            mockDnd.onDragEnd?.({
                active: {
                    id: 'candidate:c1',
                    data: {
                        current: { type: 'candidate', task, duration: 30 },
                    },
                },
                over: null,
                delta: { x: -300, y: 0 },
                activatorEvent: { clientX: 400, clientY: 100 },
            });
        });

        await waitFor(() =>
            expect(updateTask).toHaveBeenCalledWith('c1', {
                project_uid: 'p9',
            })
        );
        expect(document.elementFromPoint).toHaveBeenCalledWith(100, 100);
        expect(saveDailyPlanItems).not.toHaveBeenCalled();
        project.remove();
    });
});
