import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarHabitsPanel from '../SidebarHabitsPanel';
import * as api from '../../../utils/cadenceHabitsService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) => {
            const text = typeof fallback === 'string' ? fallback : key;
            const values = typeof fallback === 'object' ? fallback : options;
            return text.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
                String(values?.[name] ?? '')
            );
        },
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../utils/cadenceHabitsService', () => ({
    ...jest.requireActual('../../../utils/cadenceHabitsService'),
    fetchCadenceHabits: jest.fn(),
    fetchCadenceGroups: jest.fn(),
    createRow: jest.fn(),
    deleteRow: jest.fn(),
}));

const service = api as jest.Mocked<typeof api>;

const goal = (over: Partial<api.CadenceGoal> = {}): api.CadenceGoal => ({
    uid: 'g',
    habit_uid: 'h',
    target_minor: 1,
    period: 'DAY',
    goal_type: 'BINARY',
    unit_id: null,
    unit_dimension: null,
    unit_name_fr: null,
    unit_symbol: null,
    unit_scale_to_canonical: null,
    frequency_target: null,
    minimum_minor: null,
    direction: 'AT_LEAST',
    progression_step: null,
    progression_cadence: null,
    progression_cap_minor: null,
    progression_starts_on: null,
    effective_from: '2026-01-01',
    ...over,
});

const habit = (
    uid: string,
    name: string,
    over: Partial<api.CadenceHabit> = {},
    evaluation: Partial<api.CadenceEvaluation> = {},
    streak = 0
): api.CadenceHabit => ({
    uid,
    group_uid: null,
    name,
    description: null,
    icon_id: null,
    color_argb: null,
    active: true,
    starts_on: '2026-01-01',
    archived: false,
    sort_order: 0,
    timer_enabled: false,
    abstinence_profile: 'NONE',
    abstinence_started_at: null,
    abstinence_spending_minor: null,
    abstinence_spending_period: null,
    abstinence_savings_currency: null,
    alcohol_follow_up_time: null,
    goal: goal({ habit_uid: uid }),
    schedule: null,
    status: {
        date: '2026-11-13',
        evaluation: {
            period_start: '2026-11-13',
            period_end_exclusive: '2026-11-14',
            progress_minor: 0,
            target_minor: 1,
            attainment: 'TODO',
            validates_period: false,
            is_completed: false,
            reached_minimum: false,
            limit_status: null,
            session_count: 0,
            is_paused: false,
            is_planned: true,
            needs_attention: false,
            counts_as_failure: false,
            ...evaluation,
        },
        streak: { current: streak, best: streak },
    },
    ...over,
});

const groups: api.CadenceGroup[] = [
    {
        uid: 'morning',
        name: 'Morning',
        start_minute: 360,
        end_minute: 540,
        sort_order: 0,
    },
    {
        uid: 'group-day',
        name: 'All day',
        start_minute: null,
        end_minute: null,
        sort_order: 1,
    },
];

const location = {
    pathname: '/habits',
    search: '',
    hash: '',
    state: null,
    key: 'k',
} as any;

const renderPanel = (handleNavClick = jest.fn(), openNewHabit = jest.fn()) => {
    render(
        <SidebarHabitsPanel
            handleNavClick={handleNavClick}
            location={location}
            openNewHabit={openNewHabit}
        />
    );
    return { handleNavClick, openNewHabit };
};

describe('SidebarHabitsPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        service.fetchCadenceGroups.mockResolvedValue(groups);
    });

    it("lists today's habits under the groups of the habits page", async () => {
        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [
                habit('read', 'Read', { group_uid: 'morning' }, {}, 4),
                habit(
                    'walk',
                    'Walk',
                    {
                        goal: goal({
                            habit_uid: 'walk',
                            goal_type: 'COUNT',
                            target_minor: 3,
                        }),
                    },
                    { progress_minor: 1, target_minor: 3 }
                ),
            ],
        });
        renderPanel();

        const morning = await screen.findByRole('group', { name: /Morning/ });
        expect(morning).toHaveTextContent('Read');
        expect(morning).toHaveTextContent('06:00–09:00');
        const allDay = screen.getByRole('group', { name: /All day/ });
        expect(allDay).toHaveTextContent('Walk');
        expect(allDay).toHaveTextContent('1 / 3');
        expect(screen.getByText('0 of 2 done for now')).toBeInTheDocument();
        expect(screen.getByTitle('4 periods in a row').textContent).toContain(
            '4'
        );
    });

    it('opens the habit on a click', async () => {
        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [habit('read', 'Read')],
        });
        const { handleNavClick } = renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: /^Read/ }));
        expect(handleNavClick).toHaveBeenCalledWith(
            '/habit/read',
            'Read',
            expect.anything()
        );
    });

    it('logs a yes/no habit as done for today from its check', async () => {
        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [habit('read', 'Read')],
        });
        service.createRow.mockResolvedValue({ uid: 'entry-1' });
        renderPanel();

        fireEvent.click(
            await screen.findByRole('button', { name: 'Mark Read as done' })
        );
        await waitFor(() =>
            expect(service.createRow).toHaveBeenCalledWith('read', 'entries', {
                value_minor: 1,
                note: null,
            })
        );
        expect(await screen.findByRole('img', { name: 'Done' })).toBeVisible();
    });

    it('offers to create a habit when there is none', async () => {
        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [],
        });
        const { openNewHabit } = renderPanel();

        expect(await screen.findByText('No habits yet.')).toBeInTheDocument();
        const buttons = screen.getAllByRole('button', { name: 'New habit' });
        fireEvent.click(buttons[buttons.length - 1]);
        expect(openNewHabit).toHaveBeenCalled();
    });

    it('reloads when a habit changes elsewhere', async () => {
        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [habit('read', 'Read')],
        });
        renderPanel();
        await screen.findByText('Read');

        service.fetchCadenceHabits.mockResolvedValue({
            date: '2026-11-13',
            timezone: 'UTC',
            habits: [habit('read', 'Read'), habit('run', 'Run')],
        });
        window.dispatchEvent(new Event('cadenceHabitsChanged'));
        expect(await screen.findByText('Run')).toBeInTheDocument();
    });
});
